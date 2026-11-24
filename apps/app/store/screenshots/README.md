# Google Play screenshots

Five phone screenshots per language (English and Hebrew), taken on a real phone with
[Maestro](https://maestro.dev), then framed with a caption at 1080 × 1920:

| # | Screen | Caption (en) |
|---|---|---|
| 01 | Share screen after sharing a link into Fwd:Me | Save from any app |
| 02 | Library, grid view | Sorted for you |
| 03 | A scrap: summary, category, comments | The gist at a glance |
| 04 | Search by meaning | Find it by meaning |
| 05 | Boards | Group it your way |

Captions are in `captions.json`, demo content in `demo.json`.

## One-time setup (on the computer the phone is plugged into)

1. **Tools:** `adb` (Android platform-tools), Java 17+, Maestro 2.7 or newer
   (`curl -fsSL https://get.maestro.mobile.dev | bash`, older versions can't type Hebrew),
   Node and pnpm, and a checkout of this repo with `pnpm install` done.
2. **Phone:** Developer options → USB debugging on; plug it in and accept the prompt; `adb devices`
   should list it. Install a current Fwd:Me build.
3. **Demo account:** create an account in the app just for this, for example `demo@fwdme.click`.
   The same account can be the Play review login. **Every run deletes all of its scraps and boards.**
   Stay signed in to it on the phone.

## Taking the screenshots

From `apps/app`:

```sh
DEMO_EMAIL=demo@fwdme.click DEMO_PASSWORD=… store/screenshots/capture.sh        # he, then en
DEMO_EMAIL=… DEMO_PASSWORD=… store/screenshots/capture.sh en                      # one language
```

For each language this:

1. resets the demo account and fills it from `demo.json`, with comments and board names in that
   language. The profile language is set too, so the app opens in it (`seed.ts`). It waits until
   every link is organized, and names any link the worker couldn't read, so you can swap it.
2. turns on Android's status bar demo mode (12:00, full battery, no notifications),
3. drives the app through `flows/capture.yaml` (library, scrap, search, boards),
4. shares `demo.json`'s `share` link into the app and catches the "Saved to Fwd:Me" screen
   (`flows/share.yaml`). That screen closes itself after 4 seconds. If it's missed, rerun with
   `SHARE_DELAY=25` (seconds to wait for Maestro to start before sharing).

Raw screenshots land in `store/screenshots/raw/<lang>/` (gitignored).

## Framing

From `apps/app`, in the Playwright container (any machine with Docker; copy `raw/` over if needed):

```sh
docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -v "$PWD/../..":/repo -w /repo/apps/app \
  mcr.microsoft.com/playwright:v1.64.1-noble node scripts/frame-screenshots.mjs
```

This writes `store/out/screenshots/<lang>/NN-name.png` (1080 × 1920, no alpha), ready for Play Console →
Main store listing → Phone screenshots. Upload the Hebrew set under the Hebrew translation of the listing.
To change a caption, edit `captions.json` and rerun the framing only. To change the look, edit
`store/screenshot-frame.html`.
