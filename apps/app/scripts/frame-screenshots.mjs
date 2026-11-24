// Google Play phone screenshots: frames the raw shots from store/screenshots/capture.sh
// (store/screenshots/raw/<lang>/NN-name.png) with the captions in
// store/screenshots/captions.json, into store/out/screenshots/<lang>/ (1080 x 1920 PNG, no alpha).
// Run from apps/app in the Playwright container (same image as the e2e test):
//   docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -v "$PWD/../..":/repo -w /repo/apps/app \
//     mcr.microsoft.com/playwright:v1.64.1-noble node scripts/frame-screenshots.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const store = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'store');
const raw = path.join(store, 'screenshots', 'raw');
const captions = JSON.parse(fs.readFileSync(path.join(store, 'screenshots', 'captions.json'), 'utf8'));
const template = pathToFileURL(path.join(store, 'screenshot-frame.html'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
let count = 0;
for (const lang of ['en', 'he']) {
  const dir = path.join(raw, lang);
  if (!fs.existsSync(dir)) continue;
  const out = path.join(store, 'out', 'screenshots', lang);
  fs.mkdirSync(out, { recursive: true });
  for (const file of fs.readdirSync(dir).filter((f) => /^\d\d-.+\.png$/.test(f)).sort()) {
    const key = file.replace(/^\d\d-/, '').replace(/\.png$/, '');
    const caption = captions[lang]?.[key];
    if (!caption) throw new Error(`no caption for ${lang}/${key} in captions.json`);
    const url = new URL(template);
    url.search = new URLSearchParams({ lang, shot: `screenshots/raw/${lang}/${file}`, ...caption }).toString();
    await page.goto(url.href);
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    await page.screenshot({ path: path.join(out, file) });
    count++;
  }
}
await browser.close();
console.log(count ? `wrote ${count} screenshots to store/out/screenshots/` : 'no raw screenshots in store/screenshots/raw/');
