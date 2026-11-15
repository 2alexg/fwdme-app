// Pulls what a link exposes out of its HTML and oEmbed responses. Pure
// functions with no DOM or Node APIs, so they run in the Deno worker and in
// vitest alike. Relative imports carry `.ts` because Deno requires it.

import type { Source } from '../url.ts';

export interface PageMetadata {
  title?: string;
  description?: string;
  /** Absolute URL of the preview image. */
  image?: string;
  siteName?: string;
  author?: string;
  /** BCP-47 tag from <html lang> or og:locale, e.g. "he" or "en-US". */
  language?: string;
  /** Readable body text, trimmed to a budget. */
  text?: string;
  /** schema.org Recipe from JSON-LD, when the page has one. */
  recipe?: Record<string, unknown>;
}

const MAX_TEXT = 6000;

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/**
 * Turns response bytes into text using the charset from the Content-Type
 * header or a <meta charset>. Many Israeli sites still serve windows-1255.
 */
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  let charset = fromHeader;
  if (!charset) {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
    charset =
      head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
      head.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1];
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  copy: '©', reg: '®', trade: '™', middot: '·', bull: '•', shy: '',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function clean(value: string | undefined | null, max = 500): string | undefined {
  if (!value) return undefined;
  const text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) attrs[m[1]!.toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  return attrs;
}

function absolute(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined;
  try {
    const resolved = new URL(decodeEntities(url.trim()), base);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Visible text of an HTML fragment: no scripts, styles or tags. */
export function htmlToText(html: string, max = MAX_TEXT): string {
  const text = html
    .replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer|form)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, max);
}

function findRecipe(node: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!node || typeof node !== 'object' || depth > 6) return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRecipe(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  const type = obj['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return obj;
  return findRecipe(obj['@graph'], depth + 1);
}

/** Only the fields worth keeping from a schema.org Recipe (pages stuff a lot in). */
function slimRecipe(recipe: Record<string, unknown>): Record<string, unknown> {
  const keep = ['name', 'recipeYield', 'totalTime', 'prepTime', 'cookTime', 'recipeIngredient',
    'recipeInstructions', 'recipeCategory', 'recipeCuisine', 'keywords', 'suitableForDiet'];
  const out: Record<string, unknown> = {};
  for (const key of keep) if (recipe[key] !== undefined) out[key] = recipe[key];
  return out;
}

export function parseHtml(html: string, pageUrl: string): PageMetadata {
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = parseAttributes(tag);
    const key = (a.property ?? a.name ?? a.itemprop ?? '').toLowerCase();
    if (key && a.content !== undefined && meta[key] === undefined) meta[key] = a.content;
  }
  let canonicalBase = pageUrl;
  const baseHref = html.match(/<base\b[^>]*>/i)?.[0];
  if (baseHref) canonicalBase = absolute(parseAttributes(baseHref).href, pageUrl) ?? pageUrl;

  let imageFromLink: string | undefined;
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const a = parseAttributes(tag);
    if (a.rel?.toLowerCase() === 'image_src') imageFromLink = a.href;
  }

  let recipe: Record<string, unknown> | undefined;
  const ldRe = /<script\b[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while (!recipe && (m = ldRe.exec(html))) {
    try {
      const found = findRecipe(JSON.parse(m[1]!.trim()));
      if (found) recipe = slimRecipe(found);
    } catch {
      // Broken JSON-LD is common; ignore it.
    }
  }

  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const htmlLang = html.match(/<html\b[^>]*\blang=["']?([\w-]+)/i)?.[1];
  const body =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ??
    html;

  return {
    title: clean(meta['og:title'] ?? meta['twitter:title'] ?? titleTag, 300),
    description: clean(meta['og:description'] ?? meta['twitter:description'] ?? meta['description'], 1000),
    image: absolute(meta['og:image:secure_url'] ?? meta['og:image'] ?? meta['og:image:url'] ??
      meta['twitter:image'] ?? meta['twitter:image:src'] ?? imageFromLink, canonicalBase),
    siteName: clean(meta['og:site_name'] ?? meta['application-name'], 100),
    author: clean(meta['author'] ?? meta['article:author'] ?? meta['twitter:creator'], 100),
    language: clean(htmlLang ?? meta['og:locale']?.replace('_', '-'), 20),
    text: htmlToText(body) || undefined,
    recipe,
  };
}

// ---------------------------------------------------------------------------
// oEmbed: the official way to read TikTok, YouTube, X (and Instagram/Facebook
// with a Meta app token). Gives the caption/title, author and thumbnail.
// ---------------------------------------------------------------------------

export function oembedEndpoint(source: Source, url: string, metaToken?: string): string | null {
  const u = encodeURIComponent(url);
  switch (source) {
    case 'youtube':
      return `https://www.youtube.com/oembed?format=json&url=${u}`;
    case 'tiktok':
      return `https://www.tiktok.com/oembed?url=${u}`;
    case 'x':
      return `https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${u}`;
    case 'instagram':
      return metaToken ? `https://graph.facebook.com/v21.0/instagram_oembed?omitscript=true&url=${u}&access_token=${encodeURIComponent(metaToken)}` : null;
    case 'facebook':
      return metaToken ? `https://graph.facebook.com/v21.0/oembed_post?omitscript=true&url=${u}&access_token=${encodeURIComponent(metaToken)}` : null;
    default:
      return null;
  }
}

export function parseOembed(json: unknown): PageMetadata {
  if (!json || typeof json !== 'object') return {};
  const o = json as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined);
  const htmlText = str('html') ? htmlToText(str('html')!, 2000) : undefined;
  return {
    title: clean(str('title'), 300),
    author: clean(str('author_name'), 100),
    siteName: clean(str('provider_name'), 100),
    image: absolute(str('thumbnail_url'), 'https://invalid.local/'),
    text: htmlText || undefined,
  };
}

/** Earlier sources win, field by field. */
export function mergeMetadata(...parts: PageMetadata[]): PageMetadata {
  const out: PageMetadata = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part) as [keyof PageMetadata, never][]) {
      if (value !== undefined && value !== '' && out[key] === undefined) out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Safety: the worker fetches URLs that users typed, so it must never reach
// internal addresses (cloud metadata, the database, localhost).
// ---------------------------------------------------------------------------

export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v6.includes(':')) {
    if (v6 === '::' || v6 === '::1') return true;
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
  }
  return false;
}

/** Rejects URLs that obviously point inside the network, before any DNS lookup. */
export function isFetchableUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== '80' && url.port !== '443') return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') && !host.includes(':')) return false; // localhost, kong, db…
  if (/\.(local|internal|localhost|lan|home|corp)$/.test(host)) return false;
  return !isPrivateAddress(host);
}
