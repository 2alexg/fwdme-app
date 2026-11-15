// Search by meaning. The app sends the words typed; this embeds them with
// Voyage (the key stays here, never in the app) and asks the database for the
// caller's closest scraps. The database call runs as the caller, so row-level
// security limits results to their own library.
//
// POST { query: string, category?: string, limit?: number }
//   → { results: { scrap_id, similarity }[] }

import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { DEFAULT_EMBED_MODEL, toPgVector, voyageEmbed } from '../../../packages/core/src/enrich/embed.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const VOYAGE_API_KEY = Deno.env.get('VOYAGE_API_KEY') || undefined;
const EMBED_MODEL = Deno.env.get('EMBED_MODEL') || DEFAULT_EMBED_MODEL;
const MAX_QUERY = 200;
/** Below this, matches are mostly noise (tuned on real libraries; Voyage cosine similarity). */
const MIN_SIMILARITY = Number(Deno.env.get('SEMANTIC_MIN_SIMILARITY') || '0.3');

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS });
}

function log(message: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: 'semantic-search', message, ...extra }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('authorization') ?? '';
  const apikey = req.headers.get('apikey') ?? '';
  if (!authorization.startsWith('Bearer ') || !apikey) return json({ error: 'not_authenticated' }, 401);
  // A client that acts as the caller: their token, the app's public key.
  const db = createClient(SUPABASE_URL, apikey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth, error: authError } = await db.auth.getUser(authorization.slice('Bearer '.length));
  if (authError || !auth.user) {
    log('auth failed', { error: authError?.message });
    return json({ error: 'not_authenticated' }, 401);
  }

  let body: { query?: unknown; category?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, MAX_QUERY) : '';
  if (!query) return json({ results: [] });
  // Without a key the feature is simply off; the app shows keyword results only.
  if (!VOYAGE_API_KEY) return json({ results: [], disabled: true });

  let vector: number[];
  try {
    const out = await voyageEmbed([query], 'query', { apiKey: VOYAGE_API_KEY, model: EMBED_MODEL });
    vector = out.vectors[0]!;
  } catch (e) {
    log('embedding failed', { error: (e as Error).message });
    return json({ error: 'embedding_unavailable' }, 503);
  }

  const { data, error } = await db.rpc('match_my_scraps', {
    p_embedding: toPgVector(vector),
    p_limit: typeof body.limit === 'number' ? body.limit : 20,
    p_min_similarity: MIN_SIMILARITY,
    p_category: typeof body.category === 'string' ? body.category : undefined,
  });
  if (error) {
    log('match failed', { error: error.message });
    return json({ error: 'search_failed' }, 500);
  }
  return json({ results: data ?? [] });
});
