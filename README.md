# Fwd:Me

Save anything from any app in one tap, have it organized automatically, and optionally share it.
Design doc: [Scrapbook App — Product & Technical Design](https://claude.ai/artifact/1eAUAC2aFVSCbnMZ7DZuPM).

**Status:** milestone 5 of 5 — getting ready for the beta (account deletion first); the iOS share sheet is being tested.
Sharing works on Android; on iOS through a native share extension (TestFlight).

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
pnpm test:db      # pgTAP: privacy, sign-up, save_scrap, account type, enrichment queue + categories, boards, search, search by meaning, merging redirected links, share tokens, account deletion, feedback (156 checks)
pnpm test         # core + enrichment pipeline unit tests, API integration tests against local Supabase
pnpm typecheck
pnpm build:web && npx serve -s apps/app/dist -l 8081 &   # then:
pnpm test:e2e     # sign up → save → organized in background → comment → search → visibility → boards → delete → account type → Hebrew/RTL → feedback → sign in again → delete account
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
  document switches to `dir="rtl"`. On iOS and Android the app switches React Native's layout
  direction and reloads once when the language changes (`src/lib/direction.ts`).
- **RTL details:** icons that point forward or out (Send, Sign out, Open link) are flipped in Hebrew
  (`useIconFlip`). Email, password, username and link fields are left to right once something is
  typed. Empty fields show their placeholder in the app's direction (`useInputDirection`). Number
  and letter ranges in Hebrew strings (3–30, a–z) are wrapped in left-to-right isolates (U+2066/U+2069)
  so they don't come out reversed.

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

## How it works (milestone 4): one item per page

- Only the worker can follow redirects, so a short link (bit.ly, a Facebook `share/p` link, AliExpress
  app links) first gets its own item. When the worker finds that it lands on a page with a different
  canonical URL, `worker_resolve_item()` merges it into the item for that page if one exists: every
  scrap moves over, and someone who saved both keeps the scrap they made first, with the comments,
  boards and shared text from both. If no item exists for the page yet, the item is renamed to it.
- Either way the old URL is kept in `item_aliases`, so `save_scrap()` sends the next save of it
  straight to the right item.
- Never treated as a destination: error pages (status 400+), login walls and consent screens, and a
  site's home page, so unrelated links don't merge into "Instagram login".
- Canonical URLs also drop Facebook's `share_url` pointer, and AliExpress product pages keep only the
  product ID (`aliexpress.com/item/<id>.html`).

## How it works (milestone 4): the iOS share sheet

- `apps/app/targets/share/` is a native Swift share extension ("Fwd:Me" in the share sheet), added to
  the iOS build by `@bacons/apple-targets`. No React Native inside: it opens instantly and stays far
  below iOS's memory limit for extensions. It accepts one web link or text (`Info.plist`).
- Like the Android share screen, it saves at once, then offers an optional comment and visibility,
  and closes after 4 seconds unless you use them. Hebrew or English, following the app's language.
- **Auth:** the extension can't use the app's session (sharing refresh tokens between two processes
  risks Supabase's reuse detection signing the user out). The signed-in app creates a **share token**
  for the device (`create_share_token()`; only its SHA-256 hash is stored) and puts it, with the
  server URL, publishable key and language, in the App Group `group.app.fwdme.mobile`
  (`src/lib/share-token.ios.ts`). Signing out revokes it. If the server refuses a token, the
  extension flags it and the app makes a new one on its next launch.
- The extension posts what was shared to the `share` Edge Function, which finds the link with the
  same code as the app (`shareToSave`, `normalizeLink`) and calls `share_save()` /
  `share_add_comment()` / `share_set_visibility()`. Those are service-role only and run the
  regular paths as the token's user, so row-level security and `save_scrap()`'s checks apply.

## How it works (milestone 5): deleting your account

- **Settings → Delete account** (iOS, Android and web; the App Store and Google Play both require
  it). You type your username to confirm.
- The app calls the `delete-account` Edge Function, which deletes the auth user. Foreign keys
  cascade to everything the person owns: profile, scraps, comments, boards, follows, share tokens.
- Pages (`items`) are shared between users, so only the ones nobody else saved are removed
  (`delete_orphan_items()`, service-role only), along with their thumbnails in Storage.
- Google Play also asks for a web link where people can request deletion without the app; that
  comes with the store paperwork.

## How it works (milestone 5): crash reporting

- Sentry (`@sentry/react-native`) on iOS and Android, in `src/lib/crash.ts`. It is off in
  development, on web, and in any build without `EXPO_PUBLIC_SENTRY_DSN` (set in `eas.json`).
- It catches native crashes, JavaScript errors and unhandled promise rejections. Reports carry the
  account id (a random uuid) but no email, username, IP address or device name. There is no screen
  recording and no performance tracing, and query strings (search words) are stripped from request
  breadcrumbs.
- Sentry org `fwdme`, project `fwdme-app`, EU (Germany) region; the DSN, org, project and
  `SENTRY_URL` are in `eas.json`. Source maps and debug symbols upload during EAS builds with the
  `SENTRY_AUTH_TOKEN` EAS environment variable (secret, in preview and production). If the token is
  ever revoked, builds fail at the upload step: set `SENTRY_DISABLE_AUTO_UPLOAD=true` to build anyway.
- Check a build: in Settings, long-press the version line at the bottom. It sends a test report.

## How it works (milestone 5): feedback

- **Settings → Send feedback** saves a message with `send_feedback()`, along with the app version,
  platform, OS version and app language. At most 20 a day per person.
- People can't read feedback back (no policies on `feedback`); read it in the Supabase dashboard:
  Table Editor → `feedback`. `user_id` matches the user id on Sentry crash reports. Deleted with
  the account.

## How it works (milestone 5): public pages for the stores

- `/privacy` (privacy policy) and `/delete-account` (how to delete an account, with or without the app)
  are routes in the app, open to everyone, in Hebrew and English. Their text lives in
  `src/lib/legal.ts`, along with the contact email and publisher name. Keep it in step with what
  the app collects. Settings and sign-up link to the policy.
- The web app is hosted on EAS Hosting. `pnpm --filter app deploy:web` builds it against the cloud
  Supabase project (values from `eas.json`), then deploys a preview; add `-- --prod` for production.
  The App Store and Google Play link to `https://<domain>.expo.app/privacy` and `/delete-account`.

## Phone builds (EAS) and the cloud database

- Expo project: `@fwdme4s-team/fwdme`. Build profiles are in `apps/app/eas.json`; the cloud Supabase
  URL and publishable key are baked in at build time from there.
- Android test build (installable APK, link + QR code on expo.dev):

  ```sh
  cd apps/app && npx eas-cli@latest build --platform android --profile preview
  ```

- iOS (TestFlight): `cd apps/app && npx eas-cli@latest build --platform ios --profile production --auto-submit`.
  The first run is interactive: it signs in to Apple and creates the certificates and the
  provisioning profiles for the app and the share extension (App Group included).
- Cloud Supabase project `fwd:me-app` (`rvyystroacoobyhurnrz`, eu-west-1) is linked. Apply new
  migrations with `supabase db push --remote --dry-run`, then without `--dry-run`.
- Sharing: Android registers Fwd:Me as a share target for text/links (`expo-sharing` plugin in
  `app.json`). A share opens `fwdme://expo-sharing`, which routes to `src/app/share.tsx`.
- Email confirmation links redirect to `fwdme://` (allowed under Supabase → Authentication → URL
  Configuration); the app signs the user in from the tokens in that link.

### Beta and store releases

- **Android → Google Play internal testing:**
  `cd apps/app && npx eas-cli@latest build -p android --profile production --auto-submit`.
  The production profile builds an `.aab`, the only format Play accepts. Submitting needs a Google
  Play service account key, uploaded once in the Expo dashboard (Credentials) or with
  `eas credentials -p android`. Uploads land on the internal track as a **draft** (Play only accepts
  drafts until the app has been published once); roll it out to testers in Play Console.
- **iOS → TestFlight:** `npx eas-cli@latest build -p ios --profile production --auto-submit`.
- Versions: `appVersionSource: remote` with `autoIncrement`, so EAS raises the build number every time.
- **Store graphics:** `store/feature-graphic.html` + `scripts/make-store-graphics.mjs` write the
  Play feature graphic (English and Hebrew, 1024×500) and the 512px icon to `store/out/`. The
  command is at the top of the script.

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

## UI

- Styling is [NativeWind](https://www.nativewind.dev) 4 (Tailwind 3 classes in `className`). Colours are
  theme tokens: CSS variables in `apps/app/global.css` (light, and dark via `prefers-color-scheme`),
  mapped in `tailwind.config.js` (`bg-surface`, `text-muted`, `bg-accent/10`…). `usePalette()` gives the
  same colours as values for icons and placeholders.
- Shared building blocks live in `src/ui/components.tsx` (Card, CardTitle, Button with icons,
  Segmented, Chip, Field…); icons come from `lucide-react-native`.
- Navigation is a bottom tab bar (`src/app/(tabs)`): Library, Boards, Search, Settings. A scrap or a board
  opens on top of the tabs. The Library and Search tabs share one screen (`src/ui/library-view.tsx`).
- The library's + button opens the "Save a link" sheet (`src/ui/add-scrap-sheet.tsx`).
- The library, search and board pages show scraps as a grid, wide cards or a compact list
  (`src/ui/scrap-grid.tsx`); the choice is shared by all screens and remembered on the device.
- `darkMode: 'class'` in `tailwind.config.js` is deliberate: dark mode still follows the system through
  the CSS variables, and the flag stops NativeWind's web runtime from throwing when its stylesheet loads late.

## Changing the schema

```sh
supabase migration new <name>     # write SQL in supabase/migrations
pnpm db:reset                     # re-apply all migrations locally
pnpm db:types                     # regenerate packages/core/src/database.types.ts
pnpm test:db
```
