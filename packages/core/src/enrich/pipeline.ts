// One item through the pipeline: fetch → copy the image → LLM → save.
// Everything with side effects comes in through `deps`, so the same code runs
// in the Deno Edge Function and in unit tests with fakes.

import type { Source } from '../url.ts';
import {
  decodeHtml,
  isFetchableUrl,
  mergeMetadata,
  oembedEndpoint,
  parseHtml,
  parseOembed,
  type PageMetadata,
} from './metadata.ts';
import { isThin, type Enrichment, type EnrichmentInput } from './prompt.ts';

export interface ClaimedItem {
  id: string;
  canonical_url: string;
  source: string;
  attempts: number;
}

/** A failure worth retrying later (network trouble, rate limits, 5xx). */
export class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
  }
}

export type EnrichOutcome =
  | { kind: 'ok'; enrichment: Enrichment; model: string }
  | { kind: 'refused'; model: string };

export interface PipelineDeps {
  fetch: typeof fetch;
  /** DNS check: false if the host resolves to a private address. */
  hostIsPublic?: (hostname: string) => Promise<boolean>;
  /** The LLM call; null when no API key is configured (metadata only). */
  enrich: ((input: EnrichmentInput) => Promise<EnrichOutcome>) | null;
  /** Stores image bytes, returns the storage path. */
  storeImage: (itemId: string, bytes: Uint8Array, contentType: string) => Promise<string>;
  sharedTexts: (itemId: string) => Promise<string[]>;
  update: (itemId: string, patch: Record<string, unknown>) => Promise<void>;
  metaToken?: string;
  maxAttempts?: number;
  now?: () => Date;
  log?: (message: string, extra?: Record<string, unknown>) => void;
}

const USER_AGENT = 'Mozilla/5.0 (compatible; FwdMeBot/1.0; link preview)';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_IMAGE_BYTES = 5_000_000;
const MAX_REDIRECTS = 5;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/** Seconds to wait before attempt n+1. */
export function backoffSeconds(attempts: number): number {
  return [30, 120, 600, 1800][Math.max(0, attempts - 1)] ?? 1800;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

interface Fetched {
  url: string;
  status: number;
  contentType: string | null;
  bytes: Uint8Array;
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > max) throw new Error(`too large (${declared} bytes)`);
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.byteLength >= max) {
      // Keep the first `max` bytes: the <head> with the tags we want comes first.
      chunks.push(value.subarray(0, max - total));
      total = max;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** GET with redirects followed by hand, so every hop is checked for safety. */
export async function safeGet(
  deps: Pick<PipelineDeps, 'fetch' | 'hostIsPublic'>,
  startUrl: string,
  accept: string,
  maxBytes: number,
): Promise<Fetched> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isFetchableUrl(url)) throw new Error(`blocked url: ${url}`);
    if (deps.hostIsPublic && !(await deps.hostIsPublic(new URL(url).hostname))) {
      throw new Error(`blocked host: ${new URL(url).hostname}`);
    }
    let res: Response;
    try {
      res = await deps.fetch(url, {
        redirect: 'manual',
        headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'he,en;q=0.8' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (e) {
      throw new TransientError(`fetch failed: ${(e as Error).message}`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel();
      url = new URL(res.headers.get('location')!, url).toString();
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await res.body?.cancel();
      throw new TransientError(`HTTP ${res.status}`);
    }
    return { url, status: res.status, contentType: res.headers.get('content-type'), bytes: await readCapped(res, maxBytes) };
  }
  throw new Error('too many redirects');
}

export interface Gathered {
  metadata: PageMetadata;
  resolvedUrl: string;
  /** Set when nothing could be read for a reason worth retrying. */
  transientError?: string;
}

export async function gather(deps: PipelineDeps, item: ClaimedItem): Promise<Gathered> {
  const source = item.source as Source;
  let page: PageMetadata = {};
  let oembed: PageMetadata = {};
  let resolvedUrl = item.canonical_url;
  const errors: { transient: boolean; message: string }[] = [];

  const pageTask = (async () => {
    try {
      const res = await safeGet(deps, item.canonical_url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', MAX_HTML_BYTES);
      resolvedUrl = res.url;
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      if (res.contentType && !/html|xml/i.test(res.contentType)) return;
      page = parseHtml(decodeHtml(res.bytes, res.contentType), res.url);
    } catch (e) {
      errors.push({ transient: e instanceof TransientError, message: `page: ${(e as Error).message}` });
    }
  })();

  const endpoint = oembedEndpoint(source, item.canonical_url, deps.metaToken);
  const oembedTask = (async () => {
    if (!endpoint) return;
    try {
      const res = await safeGet(deps, endpoint, 'application/json', 500_000);
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      oembed = parseOembed(JSON.parse(new TextDecoder().decode(res.bytes)));
    } catch (e) {
      errors.push({ transient: e instanceof TransientError, message: `oembed: ${(e as Error).message}` });
    }
  })();

  await Promise.all([pageTask, oembedTask]);

  // Social platforms: oEmbed is authoritative (their pages often show a login
  // wall). Elsewhere the page itself knows best.
  const metadata = source === 'web' ? mergeMetadata(page, oembed) : mergeMetadata(oembed, page);
  const empty = !metadata.title && !metadata.description && !metadata.text;
  const transient = errors.find((e) => e.transient);
  return {
    metadata,
    resolvedUrl,
    transientError: empty && transient ? errors.map((e) => e.message).join('; ') : undefined,
  };
}

async function copyImage(deps: PipelineDeps, itemId: string, imageUrl: string): Promise<string | null> {
  try {
    const res = await safeGet(deps, imageUrl, 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', MAX_IMAGE_BYTES);
    const type = res.contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (res.status >= 400 || !IMAGE_TYPES.includes(type) || res.bytes.byteLength < 100) return null;
    if (res.bytes.byteLength >= MAX_IMAGE_BYTES) return null; // truncated
    return await deps.storeImage(itemId, res.bytes, type);
  } catch (e) {
    deps.log?.('image copy failed', { itemId, error: (e as Error).message });
    return null;
  }
}

// ---------------------------------------------------------------------------
// The whole thing for one item
// ---------------------------------------------------------------------------

export type ItemResult = 'ready' | 'metadata-only' | 'retry' | 'failed';

export async function processItem(deps: PipelineDeps, item: ClaimedItem): Promise<ItemResult> {
  const maxAttempts = deps.maxAttempts ?? 4;
  const now = deps.now ?? (() => new Date());

  const retryOrFail = async (message: string, transient: boolean): Promise<ItemResult> => {
    if (transient && item.attempts < maxAttempts) {
      const next = new Date(now().getTime() + backoffSeconds(item.attempts) * 1000);
      await deps.update(item.id, { status: 'pending', error: message.slice(0, 500), next_attempt_at: next.toISOString(), locked_until: null });
      deps.log?.('retry later', { itemId: item.id, attempts: item.attempts, message });
      return 'retry';
    }
    await deps.update(item.id, { status: 'failed', error: message.slice(0, 500), locked_until: null });
    deps.log?.('failed', { itemId: item.id, attempts: item.attempts, message });
    return 'failed';
  };

  try {
    const gathered = await gather(deps, item);
    if (gathered.transientError) return await retryOrFail(gathered.transientError, true);
    const m = gathered.metadata;

    const imagePath = m.image ? await copyImage(deps, item.id, m.image) : null;
    const base = {
      og_title: m.title ?? null,
      og_description: m.description ?? null,
      og_image: m.image ?? null,
      site_name: m.siteName ?? null,
      author_name: m.author ?? null,
      raw_text: m.text ?? null,
      resolved_url: gathered.resolvedUrl !== item.canonical_url ? gathered.resolvedUrl : null,
      ...(imagePath ? { image_path: imagePath } : {}),
    };
    const extracted: Record<string, unknown> = m.recipe ? { recipe_jsonld: m.recipe } : {};

    if (!deps.enrich) {
      // No LLM configured: show what the page told us. enriched_at stays null
      // so these can be re-queued once a key is added.
      await deps.update(item.id, { ...base, extracted_json: extracted, status: 'ready', locked_until: null });
      return 'metadata-only';
    }

    // Let the app show the title and image while the LLM runs.
    await deps.update(item.id, { ...base, status: 'enriching' });

    const input: EnrichmentInput = {
      url: gathered.resolvedUrl,
      source: item.source,
      metadata: m,
      sharedTexts: await deps.sharedTexts(item.id),
    };
    const outcome = await deps.enrich(input);
    if (outcome.kind === 'refused') {
      await deps.update(item.id, {
        extracted_json: { ...extracted, refused: true, model: outcome.model },
        status: 'ready',
        enriched_at: now().toISOString(),
        locked_until: null,
      });
      return 'ready';
    }
    const e = outcome.enrichment;
    const thin = e.thin || isThin(input);
    await deps.update(item.id, {
      ai_title: e.titleEn,
      ai_title_he: e.titleHe,
      category: e.category,
      tags: e.tags,
      tag_labels: e.tagLabels,
      summary_en: thin ? null : e.summaryEn || null,
      summary_he: thin ? null : e.summaryHe || null,
      content_language: e.contentLanguage,
      extracted_json: { ...extracted, thin, sensitive: e.sensitive, confidence: e.confidence, model: outcome.model },
      status: 'ready',
      enriched_at: now().toISOString(),
      error: null,
      locked_until: null,
    });
    return 'ready';
  } catch (e) {
    return await retryOrFail((e as Error).message ?? String(e), e instanceof TransientError);
  }
}

/** Claims and processes items until the queue is empty or time runs out. */
export async function drainQueue(
  claim: (limit: number) => Promise<ClaimedItem[]>,
  run: (item: ClaimedItem) => Promise<ItemResult>,
  opts: { batchSize?: number; budgetMs?: number; now?: () => number } = {},
): Promise<Record<ItemResult, number>> {
  const counts: Record<ItemResult, number> = { ready: 0, 'metadata-only': 0, retry: 0, failed: 0 };
  const clock = opts.now ?? Date.now;
  const deadline = clock() + (opts.budgetMs ?? 90_000);
  while (clock() < deadline) {
    const items = await claim(opts.batchSize ?? 5);
    if (items.length === 0) break;
    const results = await Promise.all(items.map(run));
    for (const r of results) counts[r]++;
  }
  return counts;
}
