// The enrichment worker. Woken by the database (pg_net on insert, pg_cron
// every minute) with a shared secret; answers at once and drains the queue in
// the background. The pipeline itself lives in packages/core/src/enrich so it
// is unit-tested; this file only wires it to Supabase, DNS and Claude.

import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { isPrivateAddress } from '../../../packages/core/src/enrich/metadata.ts';
import {
  drainQueue,
  processItem,
  TransientError,
  type ClaimedItem,
  type EnrichOutcome,
  type PipelineDeps,
} from '../../../packages/core/src/enrich/pipeline.ts';
import {
  buildEnrichmentPrompt,
  ENRICHMENT_SCHEMA,
  ENRICHMENT_SYSTEM,
  validateEnrichment,
  type EnrichmentInput,
} from '../../../packages/core/src/enrich/prompt.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  (JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>).default;
const WORKER_SECRET = Deno.env.get('WORKER_SECRET') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL = Deno.env.get('ENRICH_MODEL') || 'claude-opus-5-5';
const META_OEMBED_TOKEN = Deno.env.get('META_OEMBED_TOKEN') || undefined;
const MAX_ATTEMPTS = 4;

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 }) : null;

// Server-side refusal fallback is offered on these models (not on Haiku).
const SUPPORTS_FALLBACKS = /^claude-(opus-5-5|sonnet-5-5|fable-5)/.test(MODEL);

function log(message: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: 'enrich', message, ...extra }));
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

async function enrich(input: EnrichmentInput): Promise<EnrichOutcome> {
  const params = {
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: 'low' as const, format: { type: 'json_schema' as const, schema: ENRICHMENT_SCHEMA } },
    system: ENRICHMENT_SYSTEM,
    messages: [{ role: 'user' as const, content: buildEnrichmentPrompt(input) }],
  };
  let response;
  try {
    response = SUPPORTS_FALLBACKS
      ? await anthropic!.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await anthropic!.messages.create(params);
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionError) throw new TransientError(`llm: ${e.message}`);
    if (e instanceof Anthropic.APIError && (e.status === 429 || (e.status ?? 0) >= 500)) {
      throw new TransientError(`llm ${e.status}: ${e.message}`);
    }
    throw new Error(`llm: ${(e as Error).message}`);
  }

  if (response.stop_reason === 'refusal') return { kind: 'refused', model: response.model };
  if (response.stop_reason === 'max_tokens') throw new TransientError('llm: hit max_tokens');
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TransientError('llm: response was not JSON');
  }
  const enrichment = validateEnrichment(parsed);
  if (!enrichment) throw new TransientError('llm: response failed validation');
  log('enriched', {
    model: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });
  return { kind: 'ok', enrichment, model: response.model };
}

// ---------------------------------------------------------------------------
// Supabase + network
// ---------------------------------------------------------------------------

let dnsWarned = false;
async function hostIsPublic(hostname: string): Promise<boolean> {
  const answers: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    try {
      answers.push(...(await Deno.resolveDns(hostname, type)));
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound) && !dnsWarned) {
        dnsWarned = true;
        log('dns lookup unavailable', { error: (e as Error).message });
      }
    }
  }
  return !answers.some(isPrivateAddress);
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
};

const deps: PipelineDeps = {
  fetch,
  hostIsPublic,
  enrich: anthropic ? enrich : null,
  metaToken: META_OEMBED_TOKEN,
  maxAttempts: MAX_ATTEMPTS,
  log,
  async storeImage(itemId, bytes, contentType) {
    const path = `items/${itemId}.${EXT[contentType] ?? 'img'}`;
    const { error } = await db.storage
      .from('thumbnails')
      .upload(path, bytes, { contentType, upsert: true, cacheControl: '604800' });
    if (error) throw new Error(`storage: ${error.message}`);
    return path;
  },
  async sharedTexts(itemId) {
    const { data, error } = await db
      .from('scraps')
      .select('shared_text')
      .eq('item_id', itemId)
      .not('shared_text', 'is', null)
      .order('created_at')
      .limit(2);
    if (error) throw new TransientError(`db: ${error.message}`);
    return (data ?? []).map((r: { shared_text: string }) => r.shared_text);
  },
  async update(itemId, patch) {
    const { error } = await db.from('items').update(patch).eq('id', itemId);
    if (error) throw new TransientError(`db: ${error.message}`);
  },
};

async function claim(limit: number): Promise<ClaimedItem[]> {
  const { data, error } = await db.rpc('worker_claim_items', { p_limit: limit, p_max_attempts: MAX_ATTEMPTS });
  if (error) throw new Error(`claim: ${error.message}`);
  return (data ?? []) as ClaimedItem[];
}

async function drain() {
  try {
    const counts = await drainQueue(claim, (item) => processItem(deps, item), { batchSize: 5, budgetMs: 100_000 });
    if (Object.values(counts).some((n) => n > 0)) log('drained', counts);
  } catch (e) {
    log('drain failed', { error: (e as Error).message });
  }
}

function secretMatches(given: string | null): boolean {
  if (!WORKER_SECRET || !given || given.length !== WORKER_SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ WORKER_SECRET.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!secretMatches(req.headers.get('x-worker-secret'))) return new Response('forbidden', { status: 403 });
  await req.body?.cancel();
  // `?wait=1` runs in the foreground (tests, manual runs).
  if (new URL(req.url).searchParams.get('wait') === '1') {
    await drain();
    return Response.json({ ok: true });
  }
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(drain());
  else await drain();
  return Response.json({ ok: true, llm: !!anthropic }, { status: 202 });
});
