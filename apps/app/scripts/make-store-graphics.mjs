// Store graphics for Google Play, written to store/out/:
// - feature-graphic-en.png, feature-graphic-he.png  1024 x 500 (from store/feature-graphic.html)
// - play-icon-512.png                               512 x 512, 32-bit PNG (from assets/icon.png)
// Run from apps/app in the Playwright container (same image as the e2e test):
//   docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -v "$PWD/../..":/repo -w /repo/apps/app \
//     mcr.microsoft.com/playwright:v1.64.1-noble node scripts/make-store-graphics.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const Jimp = require('jimp-compact');

const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(app, 'store', 'out');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
for (const lang of ['en', 'he']) {
  await page.goto(`${pathToFileURL(path.join(app, 'store', 'feature-graphic.html'))}?lang=${lang}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(out, `feature-graphic-${lang}.png`) });
}
await browser.close();

const icon = await Jimp.read(path.join(app, 'assets', 'icon.png'));
await icon.resize(512, 512, Jimp.RESIZE_BICUBIC).writeAsync(path.join(out, 'play-icon-512.png'));
console.log('wrote', fs.readdirSync(out).join(', '));
