// Builds the app's icon assets from the generated originals in assets/source/.
// Re-run after replacing any original:  node scripts/make-icons.cjs
//
// - icon.png                    iOS / store icon: symbol at ~62% on solid forest green
// - android-icon-foreground.png adaptive icon layer: symbol inside Android's safe circle
// - android-icon-monochrome.png themed-icon layer: same framing, white silhouette
// - splash-icon.png             splash image: mint symbol, trimmed, 512px (shown on forest green)
// - logo.png / logo-dark.png    in-app logo for light / dark backgrounds, trimmed, 264px
// - favicon.png                 48px web favicon
const Jimp = require('jimp-compact');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const SRC = path.join(ASSETS, 'source');
const SIZE = 1024;
const FOREST = [0x14, 0x53, 0x2d];
const MINT = [0x6e, 0xe7, 0xb7];
// Android masks the adaptive icon to a circle as small as 66% of the canvas.
const SAFE_RADIUS = 0.31 * SIZE;

const src = (name) => Jimp.read(path.join(SRC, `${name}.png`));
const out = (img, name) => img.writeAsync(path.join(ASSETS, `${name}.png`));

// Same, as a plain RGB PNG with no alpha channel: Apple rejects store icons
// that have one, even a fully opaque one.
function outOpaque(img, name) {
  const { width, height, data } = img.bitmap;
  const png = new PNG({ width, height });
  data.copy(png.data);
  fs.writeFileSync(path.join(ASSETS, `${name}.png`), PNG.sync.write(png, { colorType: 2, inputHasAlpha: true }));
}

// Bounding box of the symbol, ignoring stray specks: a row or column counts
// only if it has a few solid pixels.
function symbolBox(img) {
  const { width: w, height: h, data } = img.bitmap;
  const rows = new Array(h).fill(0);
  const cols = new Array(w).fill(0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 128) {
        rows[y]++;
        cols[x]++;
      }
  const first = (a) => a.findIndex((n) => n >= 4);
  const last = (a) => a.length - 1 - [...a].reverse().findIndex((n) => n >= 4);
  return { x0: first(cols), x1: last(cols), y0: first(rows), y1: last(rows) };
}

// The symbol alone: cropped to its box, specks outside it dropped.
function trimmed(img) {
  const b = symbolBox(img);
  return img.clone().crop(b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
}

// Farthest solid pixel from the centre of a trimmed symbol.
function maxRadius(img) {
  const { width: w, height: h, data } = img.bitmap;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  let r = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 128) r = Math.max(r, Math.hypot(x - cx, y - cy));
  return r;
}

async function canvas(rgb) {
  const color = rgb ? Jimp.rgbaToInt(rgb[0], rgb[1], rgb[2], 255) : 0x00000000;
  return Jimp.create(SIZE, SIZE, color);
}

async function placed(symbol, scale, background) {
  const s = symbol.clone().resize(Math.round(symbol.bitmap.width * scale), Math.round(symbol.bitmap.height * scale), Jimp.RESIZE_BICUBIC);
  const c = await canvas(background);
  return c.composite(s, Math.round((SIZE - s.bitmap.width) / 2), Math.round((SIZE - s.bitmap.height) / 2));
}

// Symbol scaled so its longest side is `fraction` of the canvas.
const fit = (symbol, fraction, background) =>
  placed(symbol, (fraction * SIZE) / Math.max(symbol.bitmap.width, symbol.bitmap.height), background);

// Turn the solid icon background into transparency, keeping the symbol.
function knockOut(img, rgb) {
  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, i) {
    const d = this.bitmap.data;
    const dist = Math.hypot(d[i] - rgb[0], d[i + 1] - rgb[1], d[i + 2] - rgb[2]);
    d[i + 3] = Math.max(0, Math.min(255, Math.round(((dist - 20) / 80) * 255)));
  });
  return img;
}

// Dark-mode logo: the near-black greens become mint so they show on dark backgrounds.
function lightenDarks(img) {
  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, i) {
    const d = this.bitmap.data;
    const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    if (lum < 0.25) [d[i], d[i + 1], d[i + 2]] = MINT;
  });
  return img;
}

async function main() {
  const fg = trimmed(await src('android-icon-foreground'));
  const fgScale = SAFE_RADIUS / maxRadius(fg);
  await out(await placed(fg, fgScale, null), 'android-icon-foreground');

  const mono = trimmed(await src('android-icon-monochrome'));
  await out(await placed(mono, SAFE_RADIUS / maxRadius(mono), null), 'android-icon-monochrome');

  const iosSymbol = trimmed(knockOut(await src('icon'), FOREST));
  const icon = await fit(iosSymbol, 0.62, FOREST);
  outOpaque(icon, 'icon');
  await out(icon.clone().resize(48, 48, Jimp.RESIZE_BICUBIC), 'favicon');

  // Shown 160dp wide on the splash; 512px covers 3x screens.
  await out((await fit(fg, 0.9, null)).resize(512, 512, Jimp.RESIZE_BICUBIC), 'splash-icon');

  const logo = trimmed(await src('logo'));
  // Shown at 88dp; 264px covers 3x screens.
  await out((await fit(logo, 0.9, null)).resize(264, 264, Jimp.RESIZE_BICUBIC), 'logo');
  await out((await fit(lightenDarks(logo.clone()), 0.9, null)).resize(264, 264, Jimp.RESIZE_BICUBIC), 'logo-dark');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
