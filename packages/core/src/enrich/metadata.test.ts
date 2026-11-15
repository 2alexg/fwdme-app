import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  decodeHtml,
  htmlToText,
  isFetchableUrl,
  isPrivateAddress,
  mergeMetadata,
  oembedEndpoint,
  parseHtml,
  parseOembed,
} from './metadata.ts';

const PAGE = `<!doctype html>
<html lang="he"><head>
  <meta charset="utf-8">
  <title>Fallback title</title>
  <meta property="og:title" content="פסטה לימון &amp; ריקוטה">
  <meta property="og:description" content='15 דקות, &quot;קל&quot;'>
  <meta property="og:image" content="/img/pasta.jpg">
  <meta property="og:site_name" content="Kitchen">
  <meta name="author" content="Dana">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},
    {"@type":"Recipe","name":"Lemon pasta","recipeIngredient":["200g spaghetti"],"image":"x.jpg","review":[]}]}</script>
  <script>var junk = "<p>not text</p>";</script>
</head><body><nav>Menu</nav><article><h1>Lemon pasta</h1><p>Boil the pasta.</p><p>Mix&nbsp;ricotta.</p></article></body></html>`;

describe('parseHtml', () => {
  const m = parseHtml(PAGE, 'https://kitchen.test/recipes/pasta');

  it('reads Open Graph tags and decodes entities', () => {
    expect(m.title).toBe('פסטה לימון & ריקוטה');
    expect(m.description).toBe('15 דקות, "קל"');
    expect(m.siteName).toBe('Kitchen');
    expect(m.author).toBe('Dana');
    expect(m.language).toBe('he');
  });

  it('makes the image URL absolute', () => {
    expect(m.image).toBe('https://kitchen.test/img/pasta.jpg');
  });

  it('finds a schema.org Recipe inside @graph and keeps only useful fields', () => {
    expect(m.recipe).toEqual({ name: 'Lemon pasta', recipeIngredient: ['200g spaghetti'] });
  });

  it('extracts article text without scripts or navigation', () => {
    expect(m.text).toBe('Lemon pasta\nBoil the pasta.\nMix ricotta.');
  });

  it('falls back to <title> and meta description', () => {
    const plain = parseHtml('<title> Hello  world </title><meta name="description" content="Desc">', 'https://a.test/');
    expect(plain.title).toBe('Hello world');
    expect(plain.description).toBe('Desc');
    expect(plain.image).toBeUndefined();
  });

  it('ignores non-http image URLs', () => {
    expect(parseHtml('<meta property="og:image" content="javascript:alert(1)">', 'https://a.test/').image).toBeUndefined();
  });

  it('survives broken JSON-LD', () => {
    expect(parseHtml('<script type="application/ld+json">{oops</script>', 'https://a.test/').recipe).toBeUndefined();
  });
});

describe('decoding', () => {
  it('decodes windows-1255 Hebrew pages', () => {
    const bytes = new Uint8Array([0xf9, 0xec, 0xe5, 0xed]); // שלום
    expect(decodeHtml(bytes, 'text/html; charset=windows-1255')).toBe('שלום');
  });

  it('finds the charset in a meta tag', () => {
    const head = new TextEncoder().encode('<meta charset="windows-1255">');
    const bytes = new Uint8Array([...head, 0xf9, 0xec, 0xe5, 0xed]);
    expect(decodeHtml(bytes, 'text/html')).toContain('שלום');
  });

  it('decodes numeric entities', () => {
    expect(decodeEntities('&#1513;&#x05DC; &bogus;')).toBe('של &bogus;');
  });

  it('caps text length', () => {
    expect(htmlToText(`<p>${'a'.repeat(100)}</p>`, 10)).toHaveLength(10);
  });
});

describe('oEmbed', () => {
  it('has endpoints for YouTube, TikTok and X; Meta needs a token', () => {
    expect(oembedEndpoint('youtube', 'https://youtube.com/watch?v=1')).toContain('youtube.com/oembed');
    expect(oembedEndpoint('tiktok', 'https://tiktok.com/@a/video/1')).toContain('tiktok.com/oembed');
    expect(oembedEndpoint('x', 'https://x.com/a/status/1')).toContain('publish.twitter.com');
    expect(oembedEndpoint('instagram', 'https://instagram.com/p/1')).toBeNull();
    expect(oembedEndpoint('instagram', 'https://instagram.com/p/1', 'tok')).toContain('access_token=tok');
    expect(oembedEndpoint('web', 'https://a.test/')).toBeNull();
  });

  it('parses title, author, thumbnail and embed text', () => {
    const m = parseOembed({
      title: 'Lemon pasta 🍋 #pasta',
      author_name: 'chef',
      provider_name: 'TikTok',
      thumbnail_url: 'https://p16.tiktokcdn.test/a.jpg',
      html: '<blockquote><p>The tweet text</p></blockquote>',
    });
    expect(m).toEqual({
      title: 'Lemon pasta 🍋 #pasta',
      author: 'chef',
      siteName: 'TikTok',
      image: 'https://p16.tiktokcdn.test/a.jpg',
      text: 'The tweet text',
    });
  });

  it('merges field by field, earlier wins', () => {
    expect(mergeMetadata({ title: 'A' }, { title: 'B', image: 'i' })).toEqual({ title: 'A', image: 'i' });
  });
});

describe('fetch safety', () => {
  it.each(['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.20.0.5', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', '::ffff:10.0.0.1'])(
    '%s is private',
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );

  it.each(['8.8.8.8', '172.32.0.1', '2a00:1450::1'])('%s is public', (ip) => expect(isPrivateAddress(ip)).toBe(false));

  it.each([
    'http://localhost/', 'http://kong:8000/', 'http://db.internal/', 'http://169.254.169.254/latest',
    'http://[::1]/', 'ftp://a.test/', 'https://user:pw@a.test/', 'https://a.test:5432/',
  ])('blocks %s', (url) => expect(isFetchableUrl(url)).toBe(false));

  it.each(['https://www.ynet.co.il/', 'http://a.test:80/x'])('allows %s', (url) => expect(isFetchableUrl(url)).toBe(true));
});
