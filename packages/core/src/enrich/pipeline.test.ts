import { describe, expect, it, vi } from 'vitest';
import { CATEGORY_KEYS } from '../categories.ts';
import { backoffSeconds, drainQueue, processItem, redirectTarget, TransientError, type ClaimedItem, type PipelineDeps } from './pipeline.ts';
import { buildEnrichmentPrompt, ENRICHMENT_SCHEMA, isThin, validateEnrichment, type Enrichment } from './prompt.ts';

const HTML = `<html lang="en"><head><title>Lemon pasta</title>
<meta property="og:description" content="Quick dinner"><meta property="og:image" content="https://cdn.test/p.jpg">
</head><body><p>Boil pasta.</p></body></html>`;

function response(body: BodyInit | null, init: ResponseInit & { headers?: Record<string, string> } = {}) {
  return new Response(body, init);
}

const ENRICHMENT: Enrichment = {
  titleEn: 'Lemon ricotta pasta',
  titleHe: 'פסטה לימון וריקוטה',
  category: 'recipes',
  tags: ['pasta'],
  tagLabels: { pasta: { en: 'pasta', he: 'פסטה' } },
  summaryEn: 'A 15-minute pasta.',
  summaryHe: 'פסטה ב-15 דקות.',
  contentLanguage: 'en',
  thin: false,
  sensitive: false,
  confidence: 0.9,
};

function makeDeps(routes: Record<string, () => Response | Promise<Response>>, overrides: Partial<PipelineDeps> = {}) {
  const updates: Record<string, unknown>[] = [];
  const deps: PipelineDeps = {
    fetch: vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const route = Object.keys(routes).find((k) => url.startsWith(k));
      if (!route) throw new TypeError(`no route for ${url}`);
      return routes[route]!();
    }) as unknown as typeof fetch,
    hostIsPublic: async () => true,
    enrich: vi.fn(async () => ({ kind: 'ok' as const, enrichment: ENRICHMENT, model: 'test-model' })),
    storeImage: vi.fn(async (id: string) => `items/${id}.jpg`),
    sharedTexts: async () => ['Look! https://kitchen.test/pasta'],
    update: async (_id, patch) => {
      updates.push(patch);
    },
    now: () => new Date('2026-11-15T10:00:00Z'),
    ...overrides,
  };
  return { deps, updates };
}

const item: ClaimedItem = { id: 'item-1', canonical_url: 'https://kitchen.test/pasta', source: 'web', attempts: 1 };
const jpeg = () => response(new Uint8Array(500), { headers: { 'content-type': 'image/jpeg' } });

describe('processItem', () => {
  it('fetches, copies the image, enriches and saves', async () => {
    const { deps, updates } = makeDeps({
      'https://kitchen.test/pasta': () => response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      'https://cdn.test/p.jpg': jpeg,
    });
    expect(await processItem(deps, item)).toBe('ready');

    // First an early update with page data, then the AI result.
    expect(updates[0]).toMatchObject({
      status: 'enriching', og_title: 'Lemon pasta', og_description: 'Quick dinner',
      og_image: 'https://cdn.test/p.jpg', image_path: 'items/item-1.jpg', resolved_url: null,
    });
    expect(updates[1]).toMatchObject({
      status: 'ready', ai_title: 'Lemon ricotta pasta', ai_title_he: 'פסטה לימון וריקוטה', category: 'recipes',
      tags: ['pasta'], summary_en: 'A 15-minute pasta.', enriched_at: '2026-11-15T10:00:00.000Z',
      extracted_json: { thin: false, sensitive: false, confidence: 0.9, model: 'test-model' },
    });
    const input = vi.mocked(deps.enrich!).mock.calls[0]![0];
    expect(input.metadata.text).toBe('Boil pasta.');
    expect(input.sharedTexts).toEqual(['Look! https://kitchen.test/pasta']);
  });

  it('follows redirects and records where the link ended up', async () => {
    const { deps, updates } = makeDeps({
      'https://vm.tiktok.test/abc': () => response(null, { status: 301, headers: { location: 'https://www.tiktok.com/@chef/video/1' } }),
      'https://www.tiktok.com/@chef/video/1': () => response(HTML, { headers: { 'content-type': 'text/html' } }),
      'https://www.tiktok.com/oembed': () => response(JSON.stringify({ title: 'Caption from TikTok' })),
      'https://cdn.test/p.jpg': jpeg,
    });
    await processItem(deps, { ...item, canonical_url: 'https://vm.tiktok.test/abc', source: 'tiktok' });
    expect(updates[0]).toMatchObject({ resolved_url: 'https://www.tiktok.com/@chef/video/1', og_title: 'Caption from TikTok' });
  });

  it('merges a short link into the item for the page it leads to', async () => {
    const resolveItem = vi.fn(async () => ({ mergedInto: 'item-existing' }));
    const { deps, updates } = makeDeps({
      'https://bit.test/x': () => response(null, { status: 301, headers: { location: 'https://www.kitchen.test/pasta?utm_source=sms' } }),
      'https://www.kitchen.test/pasta': () => response(HTML, { headers: { 'content-type': 'text/html' } }),
    }, { resolveItem });
    expect(await processItem(deps, { ...item, canonical_url: 'https://bit.test/x' })).toBe('merged');
    expect(resolveItem).toHaveBeenCalledWith('item-1', 'https://kitchen.test/pasta', 'web');
    expect(updates).toEqual([]); // the item is gone; nothing else to write
    expect(deps.enrich).not.toHaveBeenCalled();
  });

  it('keeps organizing a renamed item when no one had saved the page yet', async () => {
    const resolveItem = vi.fn(async () => ({ mergedInto: null }));
    const { deps, updates } = makeDeps({
      'https://bit.test/x': () => response(null, { status: 301, headers: { location: 'https://kitchen.test/pasta' } }),
      'https://kitchen.test/pasta': () => response(HTML, { headers: { 'content-type': 'text/html' } }),
      'https://cdn.test/p.jpg': jpeg,
    }, { resolveItem });
    expect(await processItem(deps, { ...item, canonical_url: 'https://bit.test/x' })).toBe('ready');
    expect(resolveItem).toHaveBeenCalledOnce();
    expect(updates.at(-1)).toMatchObject({ status: 'ready' });
  });

  it('does not merge when the link lands on an error page', async () => {
    const resolveItem = vi.fn(async () => ({ mergedInto: 'nope' }));
    const { deps } = makeDeps({
      'https://bit.test/gone': () => response(null, { status: 301, headers: { location: 'https://kitchen.test/404' } }),
      'https://kitchen.test/404': () => response('not found', { status: 404 }),
    }, { resolveItem });
    await processItem(deps, { ...item, canonical_url: 'https://bit.test/gone' });
    expect(resolveItem).not.toHaveBeenCalled();
  });

  it('refuses redirects into the private network', async () => {
    const { deps, updates } = makeDeps({
      'https://evil.test/': () => response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }),
    }, { sharedTexts: async () => [] });
    await processItem(deps, { ...item, canonical_url: 'https://evil.test/' });
    expect(vi.mocked(deps.fetch).mock.calls.map((c) => String(c[0]))).toEqual(['https://evil.test/']);
    // Nothing readable but not transient: still organized from the URL alone, as a thin result.
    expect(updates.at(-1)).toMatchObject({ status: 'ready', summary_en: null, extracted_json: { thin: true } });
  });

  it('refuses hosts that resolve to private addresses', async () => {
    const { deps } = makeDeps({}, { hostIsPublic: async (h) => h !== 'internal.test' });
    await processItem(deps, { ...item, canonical_url: 'https://internal.test/' });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('retries later when the site is down, with backoff', async () => {
    const { deps, updates } = makeDeps({ 'https://kitchen.test/pasta': () => response('busy', { status: 503 }) });
    expect(await processItem(deps, { ...item, attempts: 2 })).toBe('retry');
    expect(updates).toEqual([
      { status: 'pending', error: 'page: HTTP 503', next_attempt_at: '2026-11-15T10:02:00.000Z', locked_until: null },
    ]);
    expect(deps.enrich).not.toHaveBeenCalled();
  });

  it('gives up after the last attempt', async () => {
    const { deps, updates } = makeDeps({ 'https://kitchen.test/pasta': () => Promise.reject(new TypeError('connection reset')) });
    expect(await processItem(deps, { ...item, attempts: 4 })).toBe('failed');
    expect(updates.at(-1)).toMatchObject({ status: 'failed', error: 'page: fetch failed: connection reset' });
  });

  it('retries when the LLM is rate limited', async () => {
    const { deps, updates } = makeDeps(
      { 'https://kitchen.test/pasta': () => response(HTML, { headers: { 'content-type': 'text/html' } }), 'https://cdn.test/': jpeg },
      { enrich: async () => { throw new TransientError('llm 429'); } },
    );
    expect(await processItem(deps, item)).toBe('retry');
    expect(updates.at(-1)).toMatchObject({ status: 'pending', error: 'llm 429' });
  });

  it('fails right away on a permanent LLM error', async () => {
    const { deps, updates } = makeDeps(
      { 'https://kitchen.test/pasta': () => response(HTML, { headers: { 'content-type': 'text/html' } }), 'https://cdn.test/': jpeg },
      { enrich: async () => { throw new Error('llm: bad request'); } },
    );
    expect(await processItem(deps, item)).toBe('failed');
    expect(updates.at(-1)).toMatchObject({ status: 'failed', error: 'llm: bad request' });
  });

  it('saves page metadata only when no LLM is configured', async () => {
    const { deps, updates } = makeDeps(
      { 'https://kitchen.test/pasta': () => response(HTML, { headers: { 'content-type': 'text/html' } }), 'https://cdn.test/': jpeg },
      { enrich: null },
    );
    expect(await processItem(deps, item)).toBe('metadata-only');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: 'ready', og_title: 'Lemon pasta', image_path: 'items/item-1.jpg' });
    expect(updates[0]).not.toHaveProperty('enriched_at');
  });

  it('keeps going when the image cannot be copied', async () => {
    const { deps, updates } = makeDeps({
      'https://kitchen.test/pasta': () => response(HTML, { headers: { 'content-type': 'text/html' } }),
      'https://cdn.test/p.jpg': () => response('<html>', { headers: { 'content-type': 'text/html' } }),
    });
    expect(await processItem(deps, item)).toBe('ready');
    expect(updates[0]).not.toHaveProperty('image_path');
    expect(deps.storeImage).not.toHaveBeenCalled();
  });

  it('marks refusals as ready without AI fields', async () => {
    const { deps, updates } = makeDeps(
      { 'https://kitchen.test/pasta': () => response(HTML, { headers: { 'content-type': 'text/html' } }), 'https://cdn.test/': jpeg },
      { enrich: async () => ({ kind: 'refused', model: 'm' }) },
    );
    expect(await processItem(deps, item)).toBe('ready');
    expect(updates.at(-1)).toMatchObject({ status: 'ready', extracted_json: { refused: true } });
    expect(updates.at(-1)).not.toHaveProperty('ai_title');
  });

  it('cuts off huge pages instead of reading them whole', async () => {
    const huge = `<title>Big</title>${'x'.repeat(3_000_000)}`;
    const { deps, updates } = makeDeps(
      { 'https://kitchen.test/pasta': () => response(huge, { headers: { 'content-type': 'text/html' } }) },
      { enrich: null },
    );
    await processItem(deps, item);
    expect(updates[0]).toMatchObject({ og_title: 'Big' });
    expect(String(updates[0]!.raw_text).length).toBeLessThanOrEqual(6000);
  });
});

describe('prompt', () => {
  it('lists every category in the schema', () => {
    expect(ENRICHMENT_SCHEMA.properties.category.enum).toEqual(CATEGORY_KEYS);
  });

  it('wraps web content and strips links from shared text', () => {
    const prompt = buildEnrichmentPrompt({
      url: 'https://a.test/x', source: 'web',
      metadata: { title: 'T', text: 'Body' }, sharedTexts: ['Wow https://a.test/x', ''],
    });
    expect(prompt).toMatch(/^<content>\nurl: https:\/\/a.test\/x/);
    expect(prompt).toContain('<shared_text>\nWow\n</shared_text>');
    expect(prompt).toContain('<page_text>\nBody\n</page_text>');
    expect(prompt).not.toContain('<description>');
  });

  it('knows when there is nothing to go on', () => {
    expect(isThin({ url: 'u', source: 'web', metadata: {}, sharedTexts: ['https://a.test/'] })).toBe(true);
    expect(isThin({ url: 'u', source: 'web', metadata: { title: 'x' }, sharedTexts: [] })).toBe(false);
  });
});

describe('validateEnrichment', () => {
  const raw = {
    title_en: ' Lemon  pasta ', title_he: 'פסטה', category: 'recipes',
    tags: [{ key: 'Lemon Pasta!', en: 'lemon pasta', he: 'פסטה לימון' }, { key: 'lemon-pasta', en: 'dup', he: 'dup' }, 'junk'],
    summary_en: 's', summary_he: 'ס', content_language: 'EN', thin: false, sensitive: false, confidence: 7,
  };

  it('normalizes tags, clamps confidence, lowercases language', () => {
    expect(validateEnrichment(raw)).toEqual({
      titleEn: 'Lemon pasta', titleHe: 'פסטה', category: 'recipes',
      tags: ['lemon-pasta'], tagLabels: { 'lemon-pasta': { en: 'lemon pasta', he: 'פסטה לימון' } },
      summaryEn: 's', summaryHe: 'ס', contentLanguage: 'en', thin: false, sensitive: false, confidence: 1,
    });
  });

  it('maps unknown categories to other', () => {
    expect(validateEnrichment({ ...raw, category: 'cats' })?.category).toBe('other');
  });

  it('rejects output without titles', () => {
    expect(validateEnrichment({ ...raw, title_he: '' })).toBeNull();
    expect(validateEnrichment('nope')).toBeNull();
  });
});

describe('queue', () => {
  it('backs off 30s, 2m, 10m, 30m', () => {
    expect([1, 2, 3, 4, 9].map(backoffSeconds)).toEqual([30, 120, 600, 1800, 1800]);
  });

  it('drains until the queue is empty', async () => {
    const batches = [[item, item], [item], []];
    const claim = vi.fn(async () => batches.shift() ?? []);
    const counts = await drainQueue(claim, async () => 'ready');
    expect(counts.ready).toBe(3);
    expect(claim).toHaveBeenCalledTimes(3);
  });

  it('stops when the time budget is used up', async () => {
    let t = 0;
    const claim = vi.fn(async () => [item]);
    await drainQueue(claim, async () => { t += 60_000; return 'retry'; }, { budgetMs: 100_000, now: () => t });
    expect(claim).toHaveBeenCalledTimes(2);
  });
});

describe('redirectTarget', () => {
  const from = { canonical_url: 'https://facebook.com/share/p/1JDfNKvDgp' };
  const landed = (url: string, ok = true) => ({ metadata: {}, resolvedUrl: url, resolvedOk: ok });

  it('gives the canonical form of a real destination', () => {
    expect(redirectTarget(from, landed('https://www.facebook.com/groups/5300/permalink/2593/?rdid=x&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare'))).toEqual({
      canonicalUrl: 'https://facebook.com/groups/5300/permalink/2593', source: 'facebook',
    });
  });

  it('ignores login walls, consent screens and home pages', () => {
    for (const url of [
      'https://www.facebook.com/login/?next=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fp%2F1',
      'https://www.instagram.com/accounts/login/?next=/p/abc/',
      'https://consent.youtube.com/m?continue=https://youtube.com',
      'https://www.facebook.com/',
    ]) expect(redirectTarget(from, landed(url))).toBeNull();
  });

  it('ignores redirects that only change the spelling (www, tracking) and failed loads', () => {
    expect(redirectTarget({ canonical_url: 'https://walla.co.il/news/1' }, landed('https://www.walla.co.il/news/1?utm_source=x'))).toBeNull();
    expect(redirectTarget(from, landed('https://www.facebook.com/groups/5300/permalink/2593/', false))).toBeNull();
  });
});
