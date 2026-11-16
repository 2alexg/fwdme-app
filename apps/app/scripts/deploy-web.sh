#!/usr/bin/env bash
# Builds the web app against the cloud Supabase project and deploys it to EAS
# Hosting (privacy policy, account deletion page, the web app itself).
# Usage: scripts/deploy-web.sh [--prod]   (without --prod: a preview URL)
set -euo pipefail
cd "$(dirname "$0")/.."

# Same public values the phone builds use (eas.json → build.base.env).
# Inline variables win over .env, which points at the local stack.
url=$(node -p "require('./eas.json').build.base.env.EXPO_PUBLIC_SUPABASE_URL")
key=$(node -p "require('./eas.json').build.base.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

rm -rf dist-hosting
EXPO_PUBLIC_SUPABASE_URL="$url" EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$key" \
  npx expo export --platform web --output-dir dist-hosting
grep -rq "$url" dist-hosting || { echo "cloud Supabase URL missing from the build" >&2; exit 1; }

npx eas-cli@latest deploy --export-dir dist-hosting "$@"
