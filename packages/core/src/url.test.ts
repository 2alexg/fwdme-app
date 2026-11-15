import { describe, expect, it } from 'vitest';
import { InvalidUrlError, detectSource, extractUrl, normalizeLink } from './url';

const canon = (s: string) => normalizeLink(s).canonicalUrl;

describe('extractUrl', () => {
  it('finds a link inside shared text', () => {
    expect(extractUrl('Check this out! https://example.com/a?b=1. so good')).toBe(
      'https://example.com/a?b=1',
    );
  });
  it('accepts a bare domain', () => {
    expect(extractUrl('example.co.il/page')).toBe('https://example.co.il/page');
  });
  it('handles Hebrew text around the link', () => {
    expect(extractUrl('מתכון מעולה https://example.com/x ‏')).toBe('https://example.com/x');
  });
  it('returns null for plain words', () => {
    expect(extractUrl('lemon pasta')).toBeNull();
  });
});

describe('normalizeLink', () => {
  it('strips tracking params, fragments and www, sorts the rest', () => {
    expect(canon('http://www.Example.com/Recipe/?utm_source=ig&b=2&a=1&fbclid=x#top')).toBe(
      'https://example.com/Recipe?a=1&b=2',
    );
  });
  it('keeps the root slash', () => {
    expect(canon('https://example.com')).toBe('https://example.com/');
  });
  it('unifies YouTube link shapes', () => {
    const want = 'https://youtube.com/watch?v=dQw4w9WgXcQ';
    expect(canon('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe(want);
    expect(canon('https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&t=42')).toBe(want);
    expect(canon('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(want);
  });
  it('drops the whole query for Instagram and TikTok', () => {
    expect(canon('https://www.instagram.com/reel/C1abc/?igsh=MTc4&utm_source=ig_web')).toBe(
      'https://instagram.com/reel/C1abc',
    );
    expect(canon('https://www.tiktok.com/@chef/video/123?is_from_webapp=1&sender_device=pc')).toBe(
      'https://tiktok.com/@chef/video/123',
    );
  });
  it('maps twitter.com to x.com', () => {
    expect(canon('https://mobile.twitter.com/user/status/1?s=20')).toBe('https://x.com/user/status/1');
  });
  it('reports the source and keeps the original', () => {
    const link = normalizeLink('see https://vm.tiktok.com/ZMabc/');
    expect(link.source).toBe('tiktok');
    expect(link.originalUrl).toBe('https://vm.tiktok.com/ZMabc/');
  });
  it('rejects non-web input', () => {
    expect(() => normalizeLink('ftp://example.com/file')).toThrow(InvalidUrlError);
    expect(() => normalizeLink('just words')).toThrow(InvalidUrlError);
    expect(() => normalizeLink('http://localhost/x')).toThrow(InvalidUrlError);
  });
});

describe('normalizeLink: store links', () => {
  it('keeps only the product ID for AliExpress item pages, on any AliExpress host', () => {
    const long = 'https://he.aliexpress.com/item/1005010620866954.html?_t=gps-id%3Amsite&aff_platform=msite&spm=a2g0n.home.1';
    expect(normalizeLink(long).canonicalUrl).toBe('https://aliexpress.com/item/1005010620866954.html');
    expect(normalizeLink('https://www.aliexpress.us/item/1005010620866954.html?x=1').canonicalUrl)
      .toBe('https://aliexpress.com/item/1005010620866954.html');
  });

  it('leaves other AliExpress pages (search, stores) alone', () => {
    expect(normalizeLink('https://aliexpress.com/w/wholesale-lamp.html?SearchText=lamp').canonicalUrl)
      .toBe('https://aliexpress.com/w/wholesale-lamp.html?SearchText=lamp');
  });

  it("drops Facebook's share_url pointer", () => {
    const resolved = 'https://www.facebook.com/groups/530043800813626/permalink/2593465697804749/?rdid=cxPq&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fp%2F1JDfNKvDgp';
    expect(normalizeLink(resolved).canonicalUrl).toBe('https://facebook.com/groups/530043800813626/permalink/2593465697804749');
  });
});

describe('detectSource', () => {
  it.each([
    ['www.facebook.com', 'facebook'],
    ['fb.watch', 'facebook'],
    ['music.youtube.com', 'youtube'],
    ['ynet.co.il', 'web'],
    ['notyoutube.com', 'web'],
  ])('%s -> %s', (host, source) => {
    expect(detectSource(host)).toBe(source);
  });
});
