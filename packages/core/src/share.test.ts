import { describe, expect, it } from 'vitest';
import { shareKey, shareToSave } from './share';

describe('shareToSave', () => {
  it('takes a bare URL share', () => {
    expect(shareToSave([{ shareType: 'url', value: 'https://www.instagram.com/reel/C1abc/?igsh=x' }])).toEqual({
      url: 'https://www.instagram.com/reel/C1abc/?igsh=x',
    });
  });

  it('pulls the link out of a caption and keeps the caption', () => {
    expect(
      shareToSave([{ shareType: 'text', value: 'Lemon ricotta pasta 🍋 https://vm.tiktok.com/ZMabc/ #pasta' }]),
    ).toEqual({ url: 'https://vm.tiktok.com/ZMabc/', sharedText: 'Lemon ricotta pasta 🍋 #pasta' });
  });

  it('keeps Hebrew text around the link', () => {
    expect(shareToSave([{ shareType: 'text', value: 'מתכון מעולה https://example.co.il/x' }])).toEqual({
      url: 'https://example.co.il/x',
      sharedText: 'מתכון מעולה',
    });
  });

  it('uses other text payloads as the caption', () => {
    expect(
      shareToSave([
        { shareType: 'text', value: 'Best hummus in Jaffa' },
        { shareType: 'url', value: 'https://example.com/hummus' },
      ]),
    ).toEqual({ url: 'https://example.com/hummus', sharedText: 'Best hummus in Jaffa' });
  });

  it('does not repeat the link as the caption', () => {
    expect(
      shareToSave([
        { shareType: 'text', value: 'https://example.com/a' },
        { shareType: 'url', value: 'https://example.com/a' },
      ]),
    ).toEqual({ url: 'https://example.com/a' });
  });

  it('returns null when there is no link', () => {
    expect(shareToSave([{ shareType: 'text', value: 'just some words' }])).toBeNull();
    expect(shareToSave([{ shareType: 'image', value: 'file:///cache/x.png', mimeType: 'image/png' }])).toBeNull();
    expect(shareToSave([])).toBeNull();
  });
});

describe('shareKey', () => {
  it('is stable for the same share and differs for another', () => {
    const a = [{ shareType: 'url' as const, value: 'https://a.test/' }];
    expect(shareKey(a)).toBe(shareKey([{ ...a[0]! }]));
    expect(shareKey(a)).not.toBe(shareKey([{ shareType: 'url', value: 'https://b.test/' }]));
  });
});
