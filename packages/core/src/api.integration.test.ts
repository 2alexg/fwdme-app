// Runs against the local Supabase stack (`pnpm db:start`). Skipped when it
// is not reachable so unit tests still run anywhere.
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ApiError,
  addComment,
  addScrapToBoard,
  createShareToken,
  revokeShareToken,
  createBoard,
  deleteBoard,
  getBoard,
  listMyBoards,
  removeScrapFromBoard,
  renameBoard,
  reorderBoards,
  relatedScraps,
  searchByMeaning,
  searchMyScraps,
  countScrapsNotIn,
  deleteComment,
  deleteScrap,
  editComment,
  getMyProfile,
  getScrap,
  isProcessing,
  listMyScraps,
  myCategoryCounts,
  retryScrap,
  saveScrap,
  scrapImageUrl,
  setScrapCategory,
  scrapTitle,
  setAllScrapsVisibility,
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
// The enrich Edge Function answers GET with 405 when it is being served.
const workerUp = reachable && (await fetch(`${URL}/functions/v1/enrich`).then((r) => r.status === 405).catch(() => false));

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
    expect(scrap.item.status).not.toBe('failed');
    expect(scrap.category).toBeNull();
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

    await setScrapVisibility(alice, scrapId, 'private');
    expect(await getScrap(anon, scrapId)).toBeNull();
  });

  it('keeps existing scraps when the account type changes, and bulk-changes only on request', async () => {
    const before = await saveScrap(alice, { input: `https://example.com/before-${run}` });
    expect((await getScrap(alice, before.scrapId))!.visibility).toBe('private');

    await updateMyProfile(alice, aliceId, { account_type: 'public' });
    expect(await getScrap(anon, before.scrapId)).toBeNull();
    const after = await saveScrap(alice, { input: `https://example.com/after-${run}` });
    expect((await getScrap(alice, after.scrapId))!.visibility).toBe('public');

    const notPublic = await countScrapsNotIn(alice, aliceId, 'public');
    expect(notPublic).toBeGreaterThanOrEqual(2);
    expect(await setAllScrapsVisibility(alice, 'public')).toBe(notPublic);
    expect(await countScrapsNotIn(alice, aliceId, 'public')).toBe(0);
    expect(await getScrap(anon, before.scrapId)).not.toBeNull();

    // Bob's scraps are untouched by Alice's bulk change.
    const bobs = await saveScrap(bob, { input: `https://example.com/bob-${run}` });
    await setAllScrapsVisibility(alice, 'private');
    expect((await getScrap(bob, bobs.scrapId))!.visibility).toBe('private');
    expect(await getScrap(anon, bobs.scrapId)).toBeNull();
  });

  it('lets the owner correct the category and counts by category', async () => {
    const { scrapId } = await saveScrap(alice, { input: `https://example.com/cat-${run}` });
    expect(await setScrapCategory(alice, scrapId, 'travel')).toBe('travel');
    expect((await listMyScraps(alice, aliceId, { category: 'travel' })).map((s) => s.id)).toEqual([scrapId]);
    expect(await listMyScraps(alice, aliceId, { category: 'humor' })).toEqual([]);
    expect(await myCategoryCounts(alice)).toEqual([{ category: 'travel', scraps: 1 }]);
    expect(await myCategoryCounts(bob)).toEqual([]);
    await expect(setScrapCategory(bob, scrapId, 'humor')).rejects.toBeInstanceOf(ApiError);
    expect(await setScrapCategory(alice, scrapId, null)).toBeNull();
  });

  it('only retries links that failed, and only for their owner', async () => {
    const { scrapId } = await saveScrap(alice, { input: `https://example.com/retry-${run}` });
    expect(await retryScrap(alice, scrapId)).toBe(false);
    expect(await retryScrap(bob, scrapId)).toBe(false);
  });

  it.skipIf(!workerUp)('organizes a saved link in the background', { timeout: 40_000 }, async () => {
    const { scrapId } = await saveScrap(alice, { input: `https://example.com/?fwdme=${run}` });
    let scrap = (await getScrap(alice, scrapId))!;
    for (let i = 0; i < 30 && isProcessing(scrap); i++) {
      await new Promise((r) => setTimeout(r, 1000));
      scrap = (await getScrap(alice, scrapId))!;
    }
    expect(scrap.item.status).toBe('ready');
    expect(scrap.item.og_title).toBe('Example Domain');
    expect(scrapTitle(scrap, 'en')).toBeTruthy();
    expect(scrapImageUrl(alice, scrap)).toBeNull(); // example.com has no preview image
  });

  it('organizes scraps on boards', async () => {
    const one = await saveScrap(alice, { input: `https://example.com/board-1-${run}` });
    const two = await saveScrap(alice, { input: `https://example.com/board-2-${run}` });
    const desserts = await createBoard(alice, '  Vegan desserts ');
    expect(desserts.name).toBe('Vegan desserts');
    const rome = await createBoard(alice, 'Trip to Rome');
    await expect(createBoard(alice, 'VEGAN desserts')).rejects.toThrow('board_name_taken');
    await expect(createBoard(alice, '   ')).rejects.toThrow('empty_board_name');

    await addScrapToBoard(alice, one.scrapId, desserts.id);
    await addScrapToBoard(alice, one.scrapId, desserts.id); // twice is fine
    await addScrapToBoard(alice, two.scrapId, desserts.id);
    await addScrapToBoard(alice, one.scrapId, rome.id);
    await expect(addScrapToBoard(bob, one.scrapId, desserts.id)).rejects.toBeInstanceOf(ApiError);

    const onBoard = await listMyScraps(alice, aliceId, { boardId: desserts.id });
    expect(onBoard.map((s) => s.id).sort()).toEqual([one.scrapId, two.scrapId].sort());
    // Every board the scrap is on, not only the filtered one.
    expect(onBoard.find((s) => s.id === one.scrapId)!.boards.map((b) => b.board_id).sort())
      .toEqual([desserts.id, rome.id].sort());
    expect((await getScrap(alice, two.scrapId))!.boards).toEqual([{ board_id: desserts.id }]);

    let boards = await listMyBoards(alice);
    expect(boards.map((b) => [b.name, b.scraps])).toEqual([['Vegan desserts', 2], ['Trip to Rome', 1]]);
    expect(await listMyBoards(bob)).toEqual([]);
    expect(await getBoard(bob, desserts.id)).toBeNull();

    await reorderBoards(alice, [rome.id, desserts.id]);
    await renameBoard(alice, rome.id, 'Rome 2027');
    await expect(renameBoard(alice, rome.id, 'vegan desserts')).rejects.toThrow('board_name_taken');
    await removeScrapFromBoard(alice, one.scrapId, desserts.id);
    boards = await listMyBoards(alice);
    expect(boards.map((b) => [b.name, b.scraps])).toEqual([['Rome 2027', 1], ['Vegan desserts', 1]]);

    await deleteBoard(alice, rome.id);
    expect(await getScrap(alice, one.scrapId)).toMatchObject({ boards: [] });
    await expect(deleteBoard(bob, desserts.id)).rejects.toBeInstanceOf(ApiError);
  });

  it('searches my own library', async () => {
    const { scrapId } = await saveScrap(alice, { input: `https://example.com/search-${run}`, comment: `shakshuka ${run}` });
    await saveScrap(bob, { input: `https://example.com/search-bob-${run}`, comment: `shakshuka ${run}` });
    expect((await searchMyScraps(alice, `SHAKSHUKA ${run}`)).map((s) => s.id)).toEqual([scrapId]);
    const [hit] = await searchMyScraps(alice, `shakshuka ${run}`);
    expect(hit!.comments[0]!.body).toBe(`shakshuka ${run}`);
    expect(await searchMyScraps(alice, `shakshuka ${run} nothing-like-this`)).toEqual([]);
    expect(await searchMyScraps(alice, '   ')).toEqual([]);
    expect(await searchMyScraps(alice, `shakshuka ${run}`, { category: 'travel' })).toEqual([]);
  });

  it('has nothing related for a scrap without an embedding, and nothing for other people', async () => {
    const { scrapId } = await saveScrap(alice, { input: `https://example.com/related-${run}` });
    expect(await relatedScraps(alice, scrapId)).toEqual([]);
    expect(await relatedScraps(bob, scrapId)).toEqual([]);
  });

  it.skipIf(!workerUp)('search by meaning answers signed-in users only', async () => {
    // Without VOYAGE_API_KEY on the server this is switched off and finds nothing;
    // with a key it may be rate-limited, which is reported as unavailable.
    const outcome = await searchByMeaning(alice, 'something to cook tonight').catch((e: ApiError) => e);
    if (outcome instanceof ApiError) expect(outcome.code).toBe('semantic_search_unavailable');
    else expect(Array.isArray(outcome)).toBe(true);
    await expect(searchByMeaning(anon, 'something to cook tonight')).rejects.toBeInstanceOf(ApiError);
  });

  it('creates and revokes share tokens for the iOS share sheet', async () => {
    const token = await createShareToken(alice, 'test iPhone');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    await revokeShareToken(bob, token); // someone else's: no effect, no error
    await revokeShareToken(alice, token);
    await expect(createShareToken(anon)).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses saves without a session or a link', async () => {
    await expect(saveScrap(anon, { input: 'https://example.com/' })).rejects.toBeInstanceOf(ApiError);
    await expect(saveScrap(alice, { input: 'no link here' })).rejects.toThrow('Not a web link');
  });
});
