# Fwd:Me

Save anything from any app in one tap, have it organized automatically, and optionally share it.
Design doc: [Scrapbook App — Product & Technical Design](https://claude.ai/artifact/1eAUAC2aFVSCbnMZ7DZuPM).

**Status:** milestone 4 of 5 in progress — boards, keyword search and search by meaning are in; iOS sharing is next.
Sharing works on Android; iOS comes later in milestone 4.

## Layout

| Path | What it is |
| --- | --- |
| `apps/app` | Expo (React Native + Expo Router) app for iOS, Android and web. The private library lives here. |
| `packages/core` | Shared TypeScript: URL canonicalization, typed Supabase data access, generated DB types. |
| `packages/core/src/enrich` | The enrichment pipeline (fetch, metadata, prompt, retries), unit-tested and shared with the worker. |
| `supabase/` | Postgres schema, row-level security, pgTAP tests (`supabase/tests`), and the `enrich` Edge Function (`supabase/functions`). |
| `e2e/` | Browser smoke test of the web app (Playwright, run in Docker). |

The Next.js app for public `@username` pages arrives with the social milestone.

## Run it locally

Needs Node 22+, pnpm, Docker and the Supabase CLI.

```sh
pnpm install
pnpm db:start                      # local Supabase on :54321 (first run pulls images)
cp apps/app/.env.example apps/app/.env
cp supabase/functions/.env.example supabase/functions/.env   # add ANTHROPIC_API_KEY (AI titles/summaries), VOYAGE_API_KEY (search by meaning)
supabase functions serve --env-file supabase/functions/.env  # the enrichment worker (separate terminal)
pnpm web                           # Expo dev server; press w for the browser (http://localhost:8081)
```

Without `ANTHROPIC_API_KEY` the worker still fills in each link's page title, description and image;
AI titles, categories, tags and summaries need the key.

Sign up with any email: local Supabase skips email confirmation. Emails it would send show up in
Mailpit at http://127.0.0.1:54324.

## Tests

```sh
pnpm test:db      # pgTAP: privacy, sign-up, save_scrap, account type, enrichment queue + categories, boards, search, search by meaning (109 checks)
pnpm test         # core + enrichment pipeline unit tests, API integration tests against local Supabase
pnpm typecheck
pnpm build:web && npx serve -s apps/app/dist -l 8081 &   # then:
pnpm test:e2e     # sign up → save → organized in background → comment → search → visibility → boards → delete → account type → Hebrew/RTL → sign in again
```

Integration tests skip themselves when local Supabase isn't running (and the background test when the
worker isn't served). The e2e run needs the worker served.

## How it works (milestone 1)

- **Auth:** Supabase email + password. The sign-up form sends the chosen username and language as
  metadata; a database trigger creates the `profiles` row. Sessions persist in `localStorage` on web
  and an expo-sqlite-backed store on iOS/Android.
- **Data model:** `items` is one row per canonical URL, shared by everyone who saves it (so it gets
  enriched once). `scraps` is a user's save of an item, with their own visibility. `scrap_comments`
  holds the owner's notes. `follows` exists only so the followers-only rule can be enforced; nothing
  writes to it yet.
- **Privacy is enforced in Postgres** (`private.can_view_scrap`): the owner sees everything; anyone
  else sees a scrap only if it is public, or followers-only and they follow the owner. Clients
  can't write `items`, reassign scraps, or comment on other people's scraps.
- **Visibility is fixed per scrap.** The account type (public/private) only sets the default for
  new scraps, stored when they are saved. Changing the account type never changes existing scraps;
  Settings offers to move them all to the new mode (`set_all_scraps_visibility()`), and only does
  so if the user accepts.
- **Capture:** the one write path is `save_scrap()`. It finds or creates the item, creates the scrap
  (or returns the existing one with `already_saved`), and appends the optional comment. The share
  extensions in milestone 2 will call the same function.
- **Languages:** Hebrew (default) and English, chosen at sign-up and in Settings. On web the
  document switches to `dir="rtl"`. Native RTL comes with the Hebrew/RTL polish milestone.

## How it works (milestone 3): organizing links

- **Queue:** `items.status` is the queue (`pending → fetching → enriching → ready`, or `failed`).
  Inserting an item pings the `enrich` Edge Function right away (`pg_net`), and `pg_cron` pings it
  every minute for retries. The function claims items with `worker_claim_items()` (`SKIP LOCKED`, so
  overlapping runs never take the same item) and answers at once, working in the background.
- **Fetch:** follows redirects by hand and refuses private/internal addresses at every hop (incl. DNS).
  Reads Open Graph tags, `<title>`, page text (any charset, e.g. windows-1255) and schema.org Recipe
  JSON-LD; uses oEmbed for YouTube, TikTok and X (Instagram/Facebook too with `META_OEMBED_TOKEN`).
- **Images:** the preview image is copied into the public `thumbnails` bucket (`items.image_path`),
  because source image links (Instagram, TikTok) expire within hours.
- **AI:** one Claude call with structured output: English + Hebrew title and summary, one of 20 fixed
  categories (`packages/core/src/categories.ts`), and tags as language-neutral keys with he/en labels.
  Results are stored on the shared item, so a link saved by many people is organized once. Owner
  comments are never sent; text the sharing app attached (often the caption) is, with an instruction
  not to repeat personal remarks. Model: `ENRICH_MODEL` secret, default `claude-haiku-5-5` (cheap and fast; set e.g. `claude-sonnet-5-5` for richer summaries).
- **Retries:** network trouble, 5xx and rate limits retry after 30s, 2m, 10m (4 attempts), then
  `failed`; the owner can tap "Try again" (`retry_item()`). A dead worker's lock expires after 3 min.
- **Categories:** each scrap keeps an effective `category`: the owner's correction
  (`user_category_override`) or the AI's, kept in sync by triggers. The library filters and counts by it.
- **App:** cards show "Organizing…" and the library refreshes every 3s while anything is in progress.

## How it works (milestone 4): boards

- **Boards** (`boards`, `board_scraps`) are named collections of your own scraps; a scrap can be on
  any number of boards. Names are unique per person, ignoring case. Deleting a board keeps its
  scraps; deleting a scrap takes it off its boards.
- **Private to the owner for now:** row-level security lets only the owner see or change a board,
  and only their own scraps can go on it. Public boards and following a board come with the social milestone.
- `my_boards()` returns the boards screen in one call (order, scrap counts, up to four cover
  images); `reorder_boards()` saves the order. In the app: **Boards** in the library header, a page
  per board (rename, delete), and a Boards card on each scrap (tap a board to add or remove, or make a new one).

## How it works (milestone 4): keyword search

- `search_my_scraps(query, category?)` searches only the caller's scraps. Every word must appear
  somewhere; where it appears sets the rank: title (8) > tags and the owner's comments (4) >
  summary, site and URL (2) > page text and the text the sharing app attached (1).
- **Hebrew:** Postgres full-text search has no Hebrew dictionary, so words match as substrings after
  lowercasing and removing niqqud. A query word that starts with prefix letters (ו ה ב ל מ ש כ) also
  matches without one (4+ letters) or two (5+ letters): "והחומוס" finds "חומוס".
- The normalized text of each item is stored in generated columns (`items.search_*`), updated by
  Postgres whenever the worker writes. A search is a scan of your own library: about 250–350 ms for
  3,000 links with the full 6,000 characters of page text each, much less for real libraries. Add a
  trigram index if libraries grow far beyond that.
- In the app: a search field in the library (searches as you type, after a short pause), combined
  with the category chips.

## How it works (milestone 4): search by meaning and related scraps

- **Embeddings:** Voyage (`voyage-4`, 1024 dimensions; `EMBED_MODEL` to override) embeds each ready
  item's titles in both languages, summaries, tags and the first 2000 characters of page text, into
  `items.embedding` (pgvector). The enrich worker does it after each run, in batches of 64, for every
  ready item that has none, including older items. pg_cron also wakes the worker for those (at most one
  try per item every 15 minutes, `items.embed_attempted_at`), so failed embeddings are retried. When the title, summary or tags change, a trigger
  drops the embedding so it is made again. Without `VOYAGE_API_KEY` this is off.
- **Search:** the `semantic-search` Edge Function checks the caller's session, embeds the query (the
  key never reaches the app) and calls `match_my_scraps()` as the caller. Matches below 0.3 cosine
  similarity are dropped (good matches score about 0.33–0.6; nonsense queries stay under 0.29). The
  app shows them as "Similar ideas" under the keyword results, at most 8, half a second after typing
  stops.
- **Related in your library:** `related_scraps()` compares the scrap's own embedding with the
  caller's other scraps, with no API call. Similarities between links run high across the board,
  so a fixed cut-off doesn't work: a scrap counts as related when it is two standard deviations
  above this scrap's average similarity to the rest of the library, and at least 0.5. Below 5 other
  scraps, only 0.6+ counts.
- No vector index: matches are always within one person's library, and an exact scan is fast.
- **Voyage rate limits:** without a payment method on the Voyage account, the limit is 3 requests and
  10K tokens per minute, so searches fail often (the app then shows keyword results only).

## Phone builds (EAS) and the cloud database

- Expo project: `@fwdme4s-team/fwdme`. Build profiles are in `apps/app/eas.json`; the cloud Supabase
  URL and publishable key are baked in at build time from there.
- Android test build (installable APK, link + QR code on expo.dev):

  ```sh
  cd apps/app && npx eas-cli@latest build --platform android --profile preview
  ```

- Cloud Supabase project `fwd:me-app` (`rvyystroacoobyhurnrz`, eu-west-1) is linked. Apply new
  migrations with `supabase db push --remote --dry-run`, then without `--dry-run`.
- Sharing: Android registers Fwd:Me as a share target for text/links (`expo-sharing` plugin in
  `app.json`). A share opens `fwdme://expo-sharing`, which routes to `src/app/share.tsx`.
- Email confirmation links redirect to `fwdme://` (allowed under Supabase → Authentication → URL
  Configuration); the app signs the user in from the tokens in that link.

### Deploying the worker to the cloud

One-time setup (CLI logged in with `supabase login`):

```sh
supabase db push --remote --dry-run && supabase db push --remote
openssl rand -hex 32                                   # → WORKER_SECRET
supabase secrets set WORKER_SECRET=<secret> ANTHROPIC_API_KEY=<key>   # optional: ENRICH_MODEL=…
supabase functions deploy enrich
```

Then, in the dashboard's SQL editor, tell the database where the worker is:

```sql
select vault.create_secret('https://rvyystroacoobyhurnrz.supabase.co/functions/v1/enrich', 'worker_url');
select vault.create_secret('<same WORKER_SECRET>', 'worker_secret');
```

Later changes to the worker: `supabase functions deploy enrich`. Logs: dashboard → Edge Functions → enrich.
Links that were organized without a key (`enriched_at is null`) can be re-queued with
`update items set status = 'pending', attempts = 0, next_attempt_at = now() where enriched_at is null;`.

## Changing the schema

```sh
supabase migration new <name>     # write SQL in supabase/migrations
pnpm db:reset                     # re-apply all migrations locally
pnpm db:types                     # regenerate packages/core/src/database.types.ts
pnpm test:db
```
