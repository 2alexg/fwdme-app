// Saving from the iOS share sheet. The share extension can't use the app's
// session, so it sends the device's share token (created by the signed-in app,
// see the share_tokens migration) with what was shared. Finding the link and
// canonicalizing it use the same code as the app.
//
// POST { token, action: 'save', payloads: [{ value, shareType }] }
//   → { scrapId, alreadySaved, host }
// POST { token, action: 'comment', scrapId, body }            → { ok: true }
// POST { token, action: 'visibility', scrapId, visibility }   → { ok: true }
// Errors: 401 { error: 'invalid_token' }, 422 { error: 'no_link' }, 400, 500.

import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { shareToSave, type IncomingShare } from '../../../packages/core/src/share.ts';
import { hostnameOf, InvalidUrlError, normalizeLink } from '../../../packages/core/src/url.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  (JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>).default;

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const MAX_PAYLOADS = 10;
const MAX_VALUE = 20_000;
const VISIBILITIES = new Set(['private', 'followers', 'public']);

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function log(message: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: 'share', message, ...extra }));
}

/** Database errors → HTTP answers the extension understands. */
function fail(error: { code?: string; message: string }) {
  if (error.code === '28000') return json({ error: 'invalid_token' }, 401);
  if (error.code === '42501') return json({ error: 'forbidden' }, 403);
  log('failed', { error: error.message, code: error.code });
  return json({ error: 'failed' }, 500);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const token = typeof body.token === 'string' ? body.token : '';
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'invalid_token' }, 401);

  switch (body.action) {
    case 'save': {
      const payloads = (Array.isArray(body.payloads) ? body.payloads : [])
        .slice(0, MAX_PAYLOADS)
        .filter((p): p is IncomingShare =>
          !!p && typeof p.value === 'string' && (p.shareType === 'text' || p.shareType === 'url'))
        .map((p) => ({ value: p.value.slice(0, MAX_VALUE), shareType: p.shareType }));
      const share = shareToSave(payloads);
      if (!share) return json({ error: 'no_link' }, 422);
      let link;
      try {
        link = normalizeLink(share.url);
      } catch (e) {
        if (e instanceof InvalidUrlError) return json({ error: 'no_link' }, 422);
        throw e;
      }
      const { data, error } = await db.rpc('share_save', {
        p_token: token,
        p_original_url: link.originalUrl,
        p_canonical_url: link.canonicalUrl,
        p_source: link.source,
        p_shared_text: share.sharedText,
      });
      if (error) return fail(error);
      const result = data as { scrap_id: string; already_saved: boolean };
      return json({ scrapId: result.scrap_id, alreadySaved: result.already_saved, host: hostnameOf(link.originalUrl) });
    }
    case 'comment': {
      if (typeof body.scrapId !== 'string' || typeof body.body !== 'string') return json({ error: 'bad_request' }, 400);
      const { error } = await db.rpc('share_add_comment', {
        p_token: token,
        p_scrap_id: body.scrapId,
        p_body: body.body.slice(0, 5000),
      });
      return error ? fail(error) : json({ ok: true });
    }
    case 'visibility': {
      if (typeof body.scrapId !== 'string' || !VISIBILITIES.has(body.visibility as string)) {
        return json({ error: 'bad_request' }, 400);
      }
      const { error } = await db.rpc('share_set_visibility', {
        p_token: token,
        p_scrap_id: body.scrapId,
        p_visibility: body.visibility as 'private' | 'followers' | 'public',
      });
      return error ? fail(error) : json({ ok: true });
    }
    default:
      return json({ error: 'bad_request' }, 400);
  }
});
