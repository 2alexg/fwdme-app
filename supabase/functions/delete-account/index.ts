// Deletes the caller's account (Settings → Delete account). Required by the
// App Store and Google Play.
//
// 1. Note which pages (items) the caller has saved.
// 2. Delete the auth user. Foreign keys cascade to everything they own:
//    profile, scraps, comments, boards, follows, share tokens.
// 3. Remove the pages nobody else has saved, and their thumbnails.
//
// Steps 2 and 3 can't share a transaction (step 2 is the Auth API). If step 3
// fails the account is still gone; only unshared page copies are left over.
//
// POST (signed in) → { ok: true }
// Errors: 401 { error: 'not_authenticated' }, 500 { error: 'failed' }.

import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  (JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>).default;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS });
}

function log(message: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: 'delete-account', message, ...extra }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'not_authenticated' }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(authorization.slice('Bearer '.length));
  if (authError || !auth.user) return json({ error: 'not_authenticated' }, 401);
  const userId = auth.user.id;

  const { data: scraps, error: listError } = await admin.from('scraps').select('item_id').eq('user_id', userId);
  if (listError) {
    log('listing scraps failed', { error: listError.message });
    return json({ error: 'failed' }, 500);
  }
  const itemIds = [...new Set((scraps ?? []).map((s) => s.item_id as string))];

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    log('deleting user failed', { error: deleteError.message });
    return json({ error: 'failed' }, 500);
  }

  let removedThumbnails = 0;
  if (itemIds.length > 0) {
    const { data: paths, error: orphanError } = await admin.rpc('delete_orphan_items', { p_item_ids: itemIds });
    if (orphanError) {
      log('removing pages failed', { error: orphanError.message });
    } else {
      const imagePaths = (paths ?? []) as string[];
      removedThumbnails = imagePaths.length;
      if (imagePaths.length > 0) {
        const { error: storageError } = await admin.storage.from('thumbnails').remove(imagePaths);
        if (storageError) log('removing thumbnails failed', { error: storageError.message });
      }
    }
  }

  log('deleted', { scraps: itemIds.length, thumbnails: removedThumbnails });
  return json({ ok: true });
});
