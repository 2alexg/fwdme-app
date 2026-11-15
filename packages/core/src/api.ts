import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';
import { categoryLabel, type Category } from './categories';
import { hostnameOf, normalizeLink } from './url';

export type Db = SupabaseClient<Database>;
type Tables = Database['public']['Tables'];
export type Visibility = Database['public']['Enums']['visibility'];
export type AccountType = Database['public']['Enums']['account_type'];
export type ItemStatus = Database['public']['Enums']['item_status'];
export type Locale = 'he' | 'en';
export type Profile = Tables['profiles']['Row'];
export type ProfileUpdate = Pick<
  Tables['profiles']['Update'],
  'username' | 'display_name' | 'avatar_url' | 'bio' | 'account_type' | 'profile_field_consent' | 'locale'
>;

export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
export const MIN_PASSWORD_LENGTH = 8;

const SCRAP_FIELDS = `
  id, user_id, original_url, shared_text, visibility, created_at, category, user_category_override,
  item:items!inner ( id, canonical_url, source, og_title, og_description, og_image, image_path,
                     site_name, author_name, ai_title, ai_title_he, category, tags, tag_labels,
                     summary_he, summary_en, status, error, enriched_at ),
  comments:scrap_comments ( id, body, created_at, edited_at ),
  boards:board_scraps ( board_id )
` as const;

export interface ScrapComment {
  id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}

export interface Scrap {
  id: string;
  user_id: string;
  original_url: string;
  shared_text: string | null;
  visibility: Visibility;
  created_at: string;
  /** Effective category: the owner's correction, else the AI's. */
  category: string | null;
  user_category_override: string | null;
  item: {
    id: string;
    canonical_url: string;
    source: string;
    og_title: string | null;
    og_description: string | null;
    og_image: string | null;
    /** Our copy of the preview image in the `thumbnails` bucket. */
    image_path: string | null;
    site_name: string | null;
    author_name: string | null;
    ai_title: string | null;
    ai_title_he: string | null;
    category: string | null;
    tags: string[];
    tag_labels: Json;
    summary_he: string | null;
    summary_en: string | null;
    status: ItemStatus;
    error: string | null;
    enriched_at: string | null;
  };
  comments: ScrapComment[];
  /** The owner's boards this scrap is on (always empty for other people's scraps). */
  boards: { board_id: string }[];
}

export interface Board {
  id: string;
  name: string;
  position: number;
  created_at: string;
  /** How many scraps are on it. */
  scraps: number;
  /** Preview images of the most recently added scraps (up to four). */
  covers: { image_path: string | null; og_image: string | null; source: string }[];
}

export const MAX_BOARD_NAME_LENGTH = 80;

export class ApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function unwrap<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new ApiError(result.error.message, result.error.code);
  return result.data as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function usernameAvailable(db: Db, username: string): Promise<boolean> {
  return unwrap(await db.rpc('username_available', { p_username: username.trim().toLowerCase() }));
}

export async function signUp(
  db: Db,
  input: {
    email: string;
    password: string;
    username: string;
    locale: Locale;
    /** Where the confirmation email's link sends people (e.g. fwdme:// on phones). */
    emailRedirectTo?: string;
  },
) {
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) throw new ApiError('invalid_username');
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new ApiError('weak_password');
  if (!(await usernameAvailable(db, username))) throw new ApiError('username_taken');
  return unwrap(
    await db.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: { data: { username, locale: input.locale }, emailRedirectTo: input.emailRedirectTo },
    }),
  );
}

export async function signIn(db: Db, email: string, password: string) {
  const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new ApiError(error.message, error.code);
  return data;
}

export async function signOut(db: Db) {
  const { error } = await db.auth.signOut();
  if (error) throw new ApiError(error.message);
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getMyProfile(db: Db): Promise<Profile | null> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  return unwrap(await db.from('profiles').select('*').eq('id', auth.user.id).maybeSingle());
}

export async function updateMyProfile(db: Db, userId: string, patch: ProfileUpdate): Promise<Profile> {
  return unwrap(await db.from('profiles').update(patch).eq('id', userId).select('*').single());
}

// ---------------------------------------------------------------------------
// Scraps
// ---------------------------------------------------------------------------

export interface SaveScrapInput {
  /** A URL, or any shared text that contains one. */
  input: string;
  comment?: string;
  /** Omit to use the account default at save time; stored on the scrap from then on. */
  visibility?: Visibility | null;
  sharedText?: string;
}

export interface SaveScrapResult {
  scrapId: string;
  itemId: string;
  alreadySaved: boolean;
}

export async function saveScrap(db: Db, input: SaveScrapInput): Promise<SaveScrapResult> {
  const link = normalizeLink(input.input);
  const data = unwrap(
    await db.rpc('save_scrap', {
      p_original_url: link.originalUrl,
      p_canonical_url: link.canonicalUrl,
      p_source: link.source,
      p_comment: input.comment?.trim() || undefined,
      p_visibility: input.visibility ?? undefined,
      p_shared_text: input.sharedText?.trim() || undefined,
    }),
  ) as { scrap_id: string; item_id: string; already_saved: boolean };
  return { scrapId: data.scrap_id, itemId: data.item_id, alreadySaved: data.already_saved };
}

/** The signed-in user's own scraps, newest first. */
export async function listMyScraps(
  db: Db,
  userId: string,
  opts: { limit?: number; offset?: number; source?: string; category?: string; boardId?: string } = {},
): Promise<Scrap[]> {
  const limit = opts.limit ?? 30;
  const offset = opts.offset ?? 0;
  // A board filter needs an inner join under its own alias, so `boards` still lists every board.
  const fields = opts.boardId ? `${SCRAP_FIELDS}, on_board:board_scraps!inner ( board_id )` : SCRAP_FIELDS;
  let query = db
    .from('scraps')
    .select(fields)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (opts.source) query = query.eq('item.source', opts.source);
  if (opts.category) query = query.eq('category', opts.category);
  if (opts.boardId) query = query.eq('on_board.board_id', opts.boardId);
  const rows = unwrap(await query) as unknown as (Scrap & { on_board?: unknown })[];
  for (const row of rows) delete row.on_board;
  return sortComments(rows);
}

/**
 * Searches my library: every word must appear in the title, tags, my comments,
 * summary, site or page text (Hebrew prefixes and niqqud are handled). Best
 * matches first.
 */
export async function searchMyScraps(
  db: Db,
  query: string,
  opts: { limit?: number; offset?: number; category?: string } = {},
): Promise<Scrap[]> {
  if (!query.trim()) return [];
  const hits = unwrap(
    await db.rpc('search_my_scraps', {
      p_query: query,
      p_category: opts.category ?? undefined,
      p_limit: opts.limit ?? 30,
      p_offset: opts.offset ?? 0,
    }),
  ) as { scrap_id: string; rank: number }[];
  return scrapsInOrder(db, hits.map((h) => h.scrap_id));
}

/** Loads full scraps for ids from a search, keeping the search's order. */
async function scrapsInOrder(db: Db, ids: string[]): Promise<Scrap[]> {
  if (ids.length === 0) return [];
  const rows = unwrap(await db.from('scraps').select(SCRAP_FIELDS).in('id', ids)) as unknown as Scrap[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return sortComments(ids.map((id) => byId.get(id)).filter((r): r is Scrap => !!r));
}

/**
 * Searches my library by meaning ("ideas for a rainy day" finds a museum
 * guide). The words go to the semantic-search Edge Function, which embeds them;
 * closest first. Empty when search by meaning isn't set up on the server.
 */
export async function searchByMeaning(
  db: Db,
  query: string,
  opts: { limit?: number; category?: string } = {},
): Promise<Scrap[]> {
  if (!query.trim()) return [];
  const { data, error } = await db.functions.invoke('semantic-search', {
    body: { query, category: opts.category, limit: opts.limit ?? 20 },
  });
  if (error) throw new ApiError(error.message, 'semantic_search_failed');
  const results = ((data as { results?: { scrap_id: string }[] } | null)?.results ?? []);
  return scrapsInOrder(db, results.map((r) => r.scrap_id));
}

/** My other scraps closest in meaning to this one ("related in your library"). */
export async function relatedScraps(db: Db, scrapId: string, opts: { limit?: number } = {}): Promise<Scrap[]> {
  const hits = unwrap(
    await db.rpc('related_scraps', { p_scrap_id: scrapId, p_limit: opts.limit ?? 6 }),
  ) as { scrap_id: string }[];
  return scrapsInOrder(db, hits.map((h) => h.scrap_id));
}

export async function getScrap(db: Db, scrapId: string): Promise<Scrap | null> {
  const row = unwrap(
    await db
      .from('scraps')
      .select(SCRAP_FIELDS)
      .eq('id', scrapId)
      .maybeSingle(),
  ) as unknown as Scrap | null;
  return row ? sortComments([row])[0]! : null;
}

export async function setScrapVisibility(db: Db, scrapId: string, visibility: Visibility) {
  unwrap(await db.from('scraps').update({ visibility }).eq('id', scrapId).select('id').single());
}

/**
 * How many of the user's scraps are not in the given mode. Used to offer a
 * bulk change after the account type changes (existing scraps never change
 * on their own).
 */
export async function countScrapsNotIn(db: Db, userId: string, visibility: Visibility): Promise<number> {
  const { count, error } = await db
    .from('scraps')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('visibility', visibility);
  if (error) throw new ApiError(error.message, error.code);
  return count ?? 0;
}

/** Opt-in: moves all of the signed-in user's scraps to one mode. Returns how many changed. */
export async function setAllScrapsVisibility(db: Db, visibility: Visibility): Promise<number> {
  return unwrap(await db.rpc('set_all_scraps_visibility', { p_visibility: visibility }));
}

/** Corrects the AI's category for this scrap; null goes back to the AI's. */
export async function setScrapCategory(db: Db, scrapId: string, category: Category | null): Promise<string | null> {
  const row = unwrap(
    await db
      .from('scraps')
      .update({ user_category_override: category })
      .eq('id', scrapId)
      .select('category')
      .single(),
  ) as { category: string | null };
  return row.category;
}

/** How many of my scraps are in each category, biggest first. */
export async function myCategoryCounts(db: Db): Promise<{ category: string; scraps: number }[]> {
  return unwrap(await db.rpc('my_category_counts')) ?? [];
}

/** Asks for a link that couldn't be read to be tried again. False if it wasn't failed. */
export async function retryScrap(db: Db, scrapId: string): Promise<boolean> {
  return unwrap(await db.rpc('retry_item', { p_scrap_id: scrapId }));
}

export async function deleteScrap(db: Db, scrapId: string) {
  unwrap(await db.from('scraps').delete().eq('id', scrapId).select('id').single());
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addComment(db: Db, scrapId: string, body: string): Promise<ScrapComment> {
  const text = body.trim();
  if (!text) throw new ApiError('empty_comment');
  return unwrap(
    await db
      .from('scrap_comments')
      .insert({ scrap_id: scrapId, body: text })
      .select('id, body, created_at, edited_at')
      .single(),
  );
}

export async function editComment(db: Db, commentId: string, body: string): Promise<ScrapComment> {
  const text = body.trim();
  if (!text) throw new ApiError('empty_comment');
  return unwrap(
    await db
      .from('scrap_comments')
      .update({ body: text })
      .eq('id', commentId)
      .select('id, body, created_at, edited_at')
      .single(),
  );
}

export async function deleteComment(db: Db, commentId: string) {
  unwrap(await db.from('scrap_comments').delete().eq('id', commentId).select('id').single());
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** My boards in my order, with counts and cover images. */
export async function listMyBoards(db: Db): Promise<Board[]> {
  return (unwrap(await db.rpc('my_boards')) ?? []) as unknown as Board[];
}

export async function getBoard(db: Db, boardId: string): Promise<Pick<Board, 'id' | 'name'> | null> {
  return unwrap(await db.from('boards').select('id, name').eq('id', boardId).maybeSingle());
}

function boardName(name: string): string {
  const text = name.trim();
  if (!text) throw new ApiError('empty_board_name');
  if (text.length > MAX_BOARD_NAME_LENGTH) throw new ApiError('board_name_too_long');
  return text;
}

/** Postgres unique violation on (owner, name) → a friendly error. */
function boardNameTaken(e: unknown): never {
  if (e instanceof ApiError && e.code === '23505') throw new ApiError('board_name_taken', '23505');
  throw e;
}

export async function createBoard(db: Db, name: string): Promise<Pick<Board, 'id' | 'name'>> {
  const text = boardName(name);
  try {
    return unwrap(await db.from('boards').insert({ name: text }).select('id, name').single());
  } catch (e) {
    return boardNameTaken(e);
  }
}

export async function renameBoard(db: Db, boardId: string, name: string): Promise<Pick<Board, 'id' | 'name'>> {
  const text = boardName(name);
  try {
    return unwrap(await db.from('boards').update({ name: text }).eq('id', boardId).select('id, name').single());
  } catch (e) {
    return boardNameTaken(e);
  }
}

/** Deletes the board only; its scraps stay in the library. */
export async function deleteBoard(db: Db, boardId: string) {
  unwrap(await db.from('boards').delete().eq('id', boardId).select('id').single());
}

/** Saves my boards' order, top to bottom. */
export async function reorderBoards(db: Db, boardIds: string[]) {
  unwrap(await db.rpc('reorder_boards', { p_ids: boardIds }));
}

export async function addScrapToBoard(db: Db, scrapId: string, boardId: string) {
  const { error } = await db.from('board_scraps').insert({ board_id: boardId, scrap_id: scrapId });
  // Already on it is fine.
  if (error && error.code !== '23505') throw new ApiError(error.message, error.code);
}

export async function removeScrapFromBoard(db: Db, scrapId: string, boardId: string) {
  const { error } = await db.from('board_scraps').delete().eq('board_id', boardId).eq('scrap_id', scrapId);
  if (error) throw new ApiError(error.message, error.code);
}

/** Cover image URLs for a board card: our stored copy if we have one, else the source's link. */
export function boardCoverUrls(db: Db, board: Pick<Board, 'covers'>): { uri: string | null; source: string }[] {
  return board.covers.map((c) => ({
    uri: c.image_path ? db.storage.from('thumbnails').getPublicUrl(c.image_path).data.publicUrl : c.og_image,
    source: c.source,
  }));
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** AI title in the reader's language once enrichment runs; until then the page title or the site. */
export function scrapTitle(scrap: Pick<Scrap, 'item' | 'original_url'>, locale: Locale): string {
  const { ai_title, ai_title_he, og_title } = scrap.item;
  const ai = locale === 'he' ? ai_title_he || ai_title : ai_title || ai_title_he;
  return ai || og_title || hostnameOf(scrap.original_url);
}

/** Our stored copy of the preview image if we have one, else the source's link. */
export function scrapImageUrl(db: Db, scrap: Pick<Scrap, 'item'>): string | null {
  if (scrap.item.image_path) return db.storage.from('thumbnails').getPublicUrl(scrap.item.image_path).data.publicUrl;
  return scrap.item.og_image;
}

export function scrapCategoryLabel(scrap: Pick<Scrap, 'category'>, locale: Locale): string | null {
  return categoryLabel(scrap.category, locale);
}

/** Tags with labels in the reader's language. */
export function scrapTags(scrap: Pick<Scrap, 'item'>, locale: Locale): { key: string; label: string }[] {
  const labels = (scrap.item.tag_labels ?? {}) as Record<string, { en?: string; he?: string } | undefined>;
  return scrap.item.tags.map((key) => ({ key, label: labels[key]?.[locale] || labels[key]?.en || key.replace(/-/g, ' ') }));
}

/** Still being fetched or organized by the worker. */
export function isProcessing(scrap: Pick<Scrap, 'item'>): boolean {
  return scrap.item.status === 'pending' || scrap.item.status === 'fetching' || scrap.item.status === 'enriching';
}


export function scrapSummary(scrap: Pick<Scrap, 'item'>, locale: Locale): string | null {
  const { summary_he, summary_en, og_description } = scrap.item;
  return (locale === 'he' ? summary_he || summary_en : summary_en || summary_he) || og_description;
}

/** The visibility a new scrap gets when the user doesn't choose one. */
export function defaultVisibility(accountType: AccountType): Visibility {
  return accountType === 'public' ? 'public' : 'private';
}

function sortComments(rows: Scrap[]): Scrap[] {
  for (const row of rows) row.comments.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return rows;
}
