#!/usr/bin/env bash
# Takes the Google Play screenshots on a real phone with Maestro. See README.md.
#   DEMO_EMAIL=… DEMO_PASSWORD=… store/screenshots/capture.sh [he] [en]
# For each language: reset and fill the demo account (seed.ts), drive the app
# (flows/capture.yaml), share a link into it (flows/share.yaml). Raw shots go
# to store/screenshots/raw/<lang>/; scripts/frame-screenshots.mjs frames them.
set -euo pipefail
cd "$(dirname "$0")/../.."   # apps/app
here=store/screenshots
langs=("$@")
[ ${#langs[@]} -gt 0 ] || langs=(he en)   # English last: the account stays in English for Play review

: "${DEMO_EMAIL:?set DEMO_EMAIL (the demo account, signed in on the phone)}"
: "${DEMO_PASSWORD:?set DEMO_PASSWORD}"
for tool in adb maestro node pnpm; do
  command -v "$tool" >/dev/null || { echo "missing: $tool (see $here/README.md)"; exit 1; }
done
maestro_version=$(maestro --version 2>/dev/null | tail -1)
if [ "$(printf '%s\n2.7.0\n' "$maestro_version" | sort -V | head -1)" != 2.7.0 ]; then
  echo "Maestro $maestro_version can't type Hebrew; need 2.7.0 or newer (maestro upgrade)"; exit 1
fi
[ "$(adb devices | grep -c 'device$')" = 1 ] || { echo "connect exactly one phone with USB debugging on (adb devices)"; exit 1; }
adb shell pm path app.fwdme.mobile >/dev/null || { echo "Fwd:Me isn't installed on the phone"; exit 1; }

# A clean status bar: 12:00, full battery, full signal, no notifications.
demo() { adb shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null; }
adb shell settings put global sysui_demo_allowed 1
demo enter
demo clock -e hhmm 1200
demo battery -e level 100 -e plugged false
demo network -e wifi show -e level 4 -e mobile show -e datatype none -e level 4
demo notifications -e visible false
trap 'demo exit' EXIT

work=$(mktemp -d)
for lang in "${langs[@]}"; do
  echo "== $lang"
  pnpm exec jiti "$here/seed.ts" "$lang"

  # Labels the flows tap or wait for, from src/lib/i18n.tsx and demo.json.
  args=()
  while IFS= read -r line; do args+=(-e "$line"); done < <(node -e '
    const demo = require("./store/screenshots/demo.json");
    const lang = process.argv[1];
    const ui = {
      en: { SAVE_LINK: "Save a link", VIEW_GRID: "Grid", BOARDS: "Boards", SEARCH_PLACEHOLDER: "Search your library…", SHARE_SAVED: "Saved to Fwd:Me" },
      he: { SAVE_LINK: "שמירת קישור", VIEW_GRID: "רשת", BOARDS: "לוחות", SEARCH_PLACEHOLDER: "חיפוש בספרייה…", SHARE_SAVED: "נשמר ב-Fwd:Me" },
    }[lang];
    const comment = (url) => demo.links.find((l) => l.url === url)[lang];
    const regex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const vars = {
      ...ui,
      DETAIL_COMMENT: regex(comment(demo.detail)),
      SEARCH_QUERY: demo.search[lang],
      SEARCH_EXPECT: regex(comment(demo.boards[0].links[0])),
      BOARD_NAME: regex(demo.boards[0][lang]),
    };
    for (const [k, v] of Object.entries(vars)) console.log(`${k}=${v}`);
  ' "$lang")

  maestro test --test-output-dir "$work/$lang" "${args[@]}" "$here/flows/capture.yaml"

  # The share screen closes itself after 4 seconds: start watching for it, then share.
  maestro test --test-output-dir "$work/$lang-share" "${args[@]}" "$here/flows/share.yaml" &
  watcher=$!
  sleep "${SHARE_DELAY:-15}"
  share_url=$(node -p 'require("./store/screenshots/demo.json").share')
  adb shell am start -a android.intent.action.SEND -t text/plain \
    --es android.intent.extra.TEXT "'$share_url'" -p app.fwdme.mobile >/dev/null
  wait "$watcher" || echo "missed the share screen; rerun with a longer SHARE_DELAY (now ${SHARE_DELAY:-15}s)"

  mkdir -p "$here/raw/$lang"
  find "$work/$lang" "$work/$lang-share" -name '0[0-9]-*.png' -exec cp {} "$here/raw/$lang/" \;
  ls "$here/raw/$lang"
done

echo "Raw screenshots are in $here/raw/. Frame them with scripts/frame-screenshots.mjs (see README.md)."
