# Fwd:Me

Save anything from any app in one tap, have it organized automatically, and optionally share it.
Design doc: [Scrapbook App — Product & Technical Design](https://claude.ai/artifact/1eAUAC2aFVSCbnMZ7DZuPM).

**Status:** milestone 1 of 5 — repo skeleton, auth, and the web library.

## Layout

| Path | What it is |
| --- | --- |
| `apps/app` | Expo (React Native + Expo Router) app for iOS, Android and web. The private library lives here. |
| `packages/core` | Shared TypeScript: URL canonicalization, typed Supabase data access, generated DB types. |
| `supabase/` | Postgres schema, row-level security, and pgTAP tests (`supabase/tests`). |
| `e2e/` | Browser smoke test of the web app (Playwright, run in Docker). |

The Next.js app for public `@username` pages arrives with the social milestone.

## Run it locally

Needs Node 22+, pnpm, Docker and the Supabase CLI.

```sh
pnpm install
pnpm db:start                      # local Supabase on :54321 (first run pulls images)
cp apps/app/.env.example apps/app/.env
pnpm web                           # Expo dev server; press w for the browser (http://localhost:8081)
```

Sign up with any email: local Supabase skips email confirmation. Emails it would send show up in
Mailpit at http://127.0.0.1:54324.

## Tests

```sh
pnpm test:db      # pgTAP: privacy rule, sign-up trigger, save_scrap, account-type changes (40 checks)
pnpm test         # core unit tests + API integration tests against local Supabase
pnpm typecheck
pnpm build:web && npx serve -s apps/app/dist -l 8081 &   # then:
pnpm test:e2e     # sign up → save → comment → visibility → delete → account type → Hebrew/RTL → sign in again
```

Integration tests skip themselves when local Supabase isn't running.

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

## Changing the schema

```sh
supabase migration new <name>     # write SQL in supabase/migrations
pnpm db:reset                     # re-apply all migrations locally
pnpm db:types                     # regenerate packages/core/src/database.types.ts
pnpm test:db
```
