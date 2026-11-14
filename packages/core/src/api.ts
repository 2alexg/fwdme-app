import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
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
  id, user_id, original_url, shared_text, visibility, created_at,
  item:items!inner ( id, canonical_url, source, og_title, og_description, og_image,
                     ai_title, category, tags, summary_he, summary_en, status ),
  comments:scrap_comments ( id, body, created_at, edited_at )
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
  visibility: Visibility | null;
  created_at: string;
  item: {
    id: string;
    canonical_url: string;
    source: string;
    og_title: string | null;
    og_description: string | null;
    og_image: string | null;
    ai_title: string | null;
    category: string | null;
    tags: string[];
    summary_he: string | null;
    summary_en: string | null;
    status: ItemStatus;
  };
  comments: ScrapComment[];
}

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
  input: { email: string; password: string; username: string; locale: Locale },
) {
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) throw new ApiError('invalid_username');
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new ApiError('weak_password');
  if (!(await usernameAvailable(db, username))) throw new ApiError('username_taken');
  return unwrap(
    await db.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: { data: { username, locale: input.locale } },
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
  /** null/undefined = follow the account default. */
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
  opts: { limit?: number; offset?: number; source?: string } = {},
): Promise<Scrap[]> {
  const limit = opts.limit ?? 30;
  const offset = opts.offset ?? 0;
  let query = db
    .from('scraps')
    .select(SCRAP_FIELDS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (opts.source) query = query.eq('item.source', opts.source);
  return sortComments(unwrap(await query) as unknown as Scrap[]);
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

export async function setScrapVisibility(db: Db, scrapId: string, visibility: Visibility | null) {
  unwrap(await db.from('scraps').update({ visibility }).eq('id', scrapId).select('id').single());
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
// Display helpers
// ---------------------------------------------------------------------------

/** AI title once enrichment runs; until then the page title or the site. */
export function scrapTitle(scrap: Pick<Scrap, 'item' | 'original_url'>): string {
  return scrap.item.ai_title || scrap.item.og_title || hostnameOf(scrap.original_url);
}

export function scrapSummary(scrap: Pick<Scrap, 'item'>, locale: Locale): string | null {
  const { summary_he, summary_en, og_description } = scrap.item;
  return (locale === 'he' ? summary_he || summary_en : summary_en || summary_he) || og_description;
}

export function effectiveVisibility(
  visibility: Visibility | null,
  accountType: AccountType,
): Visibility {
  return visibility ?? (accountType === 'public' ? 'public' : 'private');
}

function sortComments(rows: Scrap[]): Scrap[] {
  for (const row of rows) row.comments.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return rows;
}
