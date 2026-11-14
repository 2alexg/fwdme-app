// Runs against the local Supabase stack (`pnpm db:start`). Skipped when it
// is not reachable so unit tests still run anywhere.
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ApiError,
  addComment,
  deleteComment,
  deleteScrap,
  editComment,
  getMyProfile,
  getScrap,
  listMyScraps,
  saveScrap,
  scrapTitle,
  setScrapVisibility,
  signIn,
  signUp,
  updateMyProfile,
  usernameAvailable,
  type Db,
} from './index';
import type { Database } from './database.types';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const reachable = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY } })
  .then((r) => r.ok)
  .catch(() => false);

const client = (): Db =>
  createClient<Database>(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const run = Date.now().toString(36);
const password = 'correct-horse-battery';

describe.skipIf(!reachable)('api against local supabase', () => {
  const alice = client();
  const bob = client();
  const anon = client();
  let aliceId = '';

  beforeAll(async () => {
    const a = await signUp(alice, {
      email: `alice_${run}@test.local`, password, username: `alice_${run}`, locale: 'en',
    });
    aliceId = a.user!.id;
    await signUp(bob, { email: `bob_${run}@test.local`, password, username: `bob_${run}`, locale: 'he' });
  });

  it('creates a profile at sign-up and rejects a taken handle', async () => {
    const me = await getMyProfile(alice);
    expect(me).toMatchObject({ username: `alice_${run}`, locale: 'en', account_type: 'private' });
    expect(await usernameAvailable(anon, `ALICE_${run}`)).toBe(false);
    await expect(
      signUp(client(), { email: `x_${run}@test.local`, password, username: `alice_${run}`, locale: 'en' }),
    ).rejects.toThrow('username_taken');
  });

  it('signs in with email and password', async () => {
    const fresh = client();
    const { user } = await signIn(fresh, `alice_${run}@test.local`, password);
    expect(user.id).toBe(aliceId);
    await expect(signIn(client(), `alice_${run}@test.local`, 'wrong-password')).rejects.toBeInstanceOf(ApiError);
  });

  it('saves, lists, comments and deletes', async () => {
    const shared = `Look at this https://www.example.com/pasta-${run}?utm_source=wa`;
    const first = await saveScrap(alice, { input: shared, comment: 'for Friday dinner' });
    expect(first.alreadySaved).toBe(false);
    const again = await saveScrap(alice, { input: `https://example.com/pasta-${run}` });
    expect(again).toMatchObject({ scrapId: first.scrapId, alreadySaved: true });

    const list = await listMyScraps(alice, aliceId);
    expect(list).toHaveLength(1);
    const scrap = list[0]!;
    expect(scrap.item.canonical_url).toBe(`https://example.com/pasta-${run}`);
    expect(scrap.item.status).toBe('pending');
    expect(scrapTitle(scrap)).toBe('example.com');
    expect(scrap.comments.map((c) => c.body)).toEqual(['for Friday dinner']);

    const c2 = await addComment(alice, scrap.id, '  double the lemon  ');
    expect(c2.body).toBe('double the lemon');
    const edited = await editComment(alice, c2.id, 'triple the lemon');
    expect(edited.edited_at).not.toBeNull();
    await deleteComment(alice, c2.id);
    expect((await getScrap(alice, scrap.id))!.comments).toHaveLength(1);

    await deleteScrap(alice, scrap.id);
    expect(await getScrap(alice, scrap.id)).toBeNull();
  });

  it('hides private scraps from others and shows public ones', async () => {
    const { scrapId } = await saveScrap(alice, { input: `https://example.com/secret-${run}`, comment: 'mine' });
    expect(await getScrap(bob, scrapId)).toBeNull();
    expect(await getScrap(anon, scrapId)).toBeNull();
    await expect(addComment(bob, scrapId, 'hi')).rejects.toBeInstanceOf(ApiError);
    await expect(deleteScrap(bob, scrapId)).rejects.toBeInstanceOf(ApiError);

    await setScrapVisibility(alice, scrapId, 'public');
    const seen = await getScrap(anon, scrapId);
    expect(seen?.comments.map((c) => c.body)).toEqual(['mine']);

    await setScrapVisibility(alice, scrapId, null);
    expect(await getScrap(anon, scrapId)).toBeNull();
    await updateMyProfile(alice, aliceId, { account_type: 'public' });
    expect(await getScrap(anon, scrapId)).not.toBeNull();
  });

  it('refuses saves without a session or a link', async () => {
    await expect(saveScrap(anon, { input: 'https://example.com/' })).rejects.toBeInstanceOf(ApiError);
    await expect(saveScrap(alice, { input: 'no link here' })).rejects.toThrow('Not a web link');
  });
});
