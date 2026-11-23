# Services needed to run Fwd:Me

These are the outside services the Android and iOS apps depend on, in production and for building
and releasing them. Most of them are shared by both platforms. The settings named below are the
real places each value lives, so this page doubles as a checklist when something stops working.

## At a glance

| Service | What it does for the app | Android | iOS | If it's down or misconfigured |
| --- | --- | :-: | :-: | --- |
| **Supabase** (project `fwd:me-app`, `rvyystroacoobyhurnrz`, eu-west-1) | Database, sign-in, file storage, background worker, API | ✅ | ✅ | Nothing works: can't sign in, save or browse |
| **Anthropic** (Claude API) | AI titles, summaries, categories and tags for saved links | ✅ | ✅ | Links are saved with page title/image only, not organized |
| **Voyage AI** | Embeddings for "Similar ideas" search and related scraps | ✅ | ✅ | Keyword search still works; meaning-based results disappear |
| **Sentry** (org `fwdme`, project `fwdme-app`, EU region) | Crash reports; source maps uploaded during builds | ✅ | ✅ | App works; crashes go unreported. Builds fail if the auth token is revoked |
| **Expo / EAS** (project `@fwdme4s-team/fwdme`) | Cloud builds, signing credentials, store submission, web hosting | ✅ | ✅ | Running apps are fine; no new builds, and the privacy/deletion pages go offline |
| **Google Play Console** | Distributes the Android app (internal testing, later public) | ✅ | | No Android releases |
| **Apple Developer Program + App Store Connect** (team `T2KF7HWCXN`) | Signing, TestFlight, App Store | | ✅ | No iOS builds or releases |
| **GitHub** (`2alexg/fwdme-app`) | Source code and pull requests | ✅ | ✅ | Development only; running apps are not affected |
| **Domain `fwdme.click` + email** | Contact address `support@fwdme.click` in the stores and privacy policy | ✅ | ✅ | Store review and users can't reach you |
| Meta oEmbed token (optional, not set) | Better previews for Instagram/Facebook links | ✅ | ✅ | Instagram/Facebook previews come back thinner |

## Runtime services (what the installed app talks to)

### Supabase — the backend

Everything the app does goes through one Supabase project. The app only knows its URL and
publishable key, which are baked into each build from `apps/app/eas.json`.

| Part | Used for |
| --- | --- |
| **Postgres** | All data: profiles, items, scraps, comments, boards, feedback. Privacy rules (row-level security) are enforced here. Extensions: `pg_net` (wakes the worker when a link is saved), `pg_cron` (wakes it every minute for retries and embeddings), `pgvector` (embeddings), Vault (holds `worker_url` and `worker_secret`). |
| **Auth** | Email + password sign-in. Confirmation links redirect to `fwdme://` (set under Authentication → URL Configuration). Emails are sent by Supabase's built-in mailer; it has low sending limits, so a custom SMTP provider is worth setting up before a larger beta. |
| **Storage** | Public `thumbnails` bucket: copies of link preview images, since the originals expire. |
| **Edge Functions** | `enrich` (background worker: fetch the page, call Claude and Voyage), `semantic-search` (search by meaning), `share` (iOS share extension saves through it), `delete-account` (in-app account deletion). |

Edge Function secrets (`supabase secrets set …`):

| Secret | Needed for |
| --- | --- |
| `WORKER_SECRET` | Must match the `worker_secret` Vault entry, so only the database can wake the worker |
| `ANTHROPIC_API_KEY` | AI organizing (Anthropic) |
| `ENRICH_MODEL` | Optional model override; default `claude-haiku-5-5` |
| `VOYAGE_API_KEY` | Embeddings (Voyage AI) |
| `EMBED_MODEL` | Optional; default `voyage-4` |
| `META_OEMBED_TOKEN` | Optional; Instagram/Facebook oEmbed |

`SUPABASE_URL` and the service-role/secret keys are provided to functions automatically.

### Anthropic — AI organizing

One Claude call per new link (titles and summaries in Hebrew and English, category, tags). Called
only by the `enrich` worker, never by the app. Only items from users who agreed to the AI services
(`profiles.ai_consent_at`) are processed. Needs a funded API account.

### Voyage AI — search by meaning

Called by `enrich` (to embed items) and `semantic-search` (to embed the query). Without a payment
method on the Voyage account the rate limit is very low (3 requests/minute) and searches fail often.

### Sentry — crash reporting

The app sends crash reports straight to Sentry (DSN in `eas.json`). Off in development and on web.

### EAS Hosting — public web pages

`https://fwdme.expo.app/privacy` and `/delete-account` are linked from both stores and from the app.
They must stay online for the store listings to remain valid.

## Build and release services

| Service | Android | iOS |
| --- | --- | --- |
| **EAS Build** | Builds the APK (`preview`) and AAB (`production`); stores the upload keystore | Builds the IPA; stores the distribution certificate and provisioning profiles for the app and the share extension |
| **EAS environment variables** | `SENTRY_AUTH_TOKEN` (secret, preview + production) for source map upload | same |
| **EAS Submit** | Uploads to Play's internal track as a draft, using the Google Play service account key stored in EAS credentials | Uploads to TestFlight, using App Store Connect credentials |
| **Store account** | Google Play Console developer account; Google Cloud project for the service account | Apple Developer Program membership (yearly fee); App Group `group.app.fwdme.mobile`; bundle id `app.fwdme.mobile` |

## Differences between Android and iOS

- **Sharing into the app:** Android uses the `expo-sharing` share target and the app's own session.
  iOS uses a native share extension that saves through the `share` Edge Function with a per-device
  share token, so iOS also depends on that function and on the App Group.
- **Store paperwork:** Play needs a data safety form and the web deletion link; the App Store needs
  privacy labels, a demo account for review, and the AI consent (guideline 5.1.2(i)).
- **Cost:** Apple charges a yearly developer fee; Google Play a one-time registration fee.

## Running locally

Local development replaces the cloud Supabase project with a local one (Docker + Supabase CLI) and
needs no other service; Anthropic and Voyage keys are optional. See the README.
