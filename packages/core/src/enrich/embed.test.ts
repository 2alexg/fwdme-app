import { describe, expect, it, vi } from 'vitest';
import { EMBEDDING_DIMENSIONS, embeddingText, toPgVector, voyageEmbed, type EmbeddableItem } from './embed.ts';
import { TransientError } from './pipeline.ts';

const ITEM: EmbeddableItem = {
  canonical_url: 'https://food.test/lemon-pasta',
  ai_title: 'Lemon ricotta pasta',
  ai_title_he: 'פסטה לימון וריקוטה',
  og_title: 'Best Lemon Pasta Ever | Food Blog',
  og_description: 'Quick dinner',
  summary_en: 'A 15-minute pasta.',
  summary_he: 'פסטה ב-15 דקות.',
  tags: ['pasta', 'quick-meals'],
  tag_labels: { pasta: { en: 'pasta', he: 'פסטה' } },
  site_name: 'Food Blog',
  raw_text: 'Boil   the pasta.\n\n' + 'x'.repeat(5000),
};

const vector = (n: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, () => n);

describe('embeddingText', () => {
  it('includes both languages, tags with labels, and a capped slice of the page', () => {
    const text = embeddingText(ITEM);
    expect(text.split('\n').slice(0, 3)).toEqual(['Lemon ricotta pasta', 'פסטה לימון וריקוטה', 'Best Lemon Pasta Ever | Food Blog']);
    expect(text).toContain('Tags: pasta, פסטה, quick meals');
    expect(text).toContain('Boil the pasta.');
    expect(text.length).toBeLessThan(2400);
  });

  it('works with only page metadata', () => {
    const text = embeddingText({ ...ITEM, ai_title: null, ai_title_he: null, summary_en: null, summary_he: null, tags: [], raw_text: null });
    expect(text).toBe('Best Lemon Pasta Ever | Food Blog\nQuick dinner\nFood Blog');
  });

  it('falls back to the URL when there is no text at all', () => {
    const empty = { canonical_url: 'https://x.test/a', ai_title: null, ai_title_he: null, og_title: null, og_description: null,
      summary_en: null, summary_he: null, tags: null, tag_labels: null, site_name: null, raw_text: '   ' };
    expect(embeddingText(empty)).toBe('https://x.test/a');
  });
});

describe('voyageEmbed', () => {
  it('sends the texts and returns vectors in input order', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      expect(body).toMatchObject({ input: ['a', 'b'], model: 'voyage-4', input_type: 'document', output_dimension: 1024 });
      expect((init!.headers as Record<string, string>).authorization).toBe('Bearer k');
      return Response.json({
        data: [{ embedding: vector(2), index: 1 }, { embedding: vector(1), index: 0 }],
        model: 'voyage-4',
        usage: { total_tokens: 7 },
      });
    });
    const out = await voyageEmbed(['a', 'b'], 'document', { apiKey: 'k', fetch });
    expect(out.vectors.map((v) => v[0])).toEqual([1, 2]);
    expect(out.tokens).toBe(7);
  });

  it('treats rate limits, server errors and network trouble as temporary', async () => {
    for (const status of [429, 503]) {
      const fetch = vi.fn(async () => new Response('slow down', { status }));
      await expect(voyageEmbed(['a'], 'query', { apiKey: 'k', fetch })).rejects.toBeInstanceOf(TransientError);
    }
    const offline = vi.fn(async () => {
      throw new Error('connection reset');
    });
    await expect(voyageEmbed(['a'], 'query', { apiKey: 'k', fetch: offline })).rejects.toBeInstanceOf(TransientError);
  });

  it('fails for a bad key or a malformed response', async () => {
    const unauthorized = vi.fn(async () => new Response('bad key', { status: 401 }));
    const err = await voyageEmbed(['a'], 'query', { apiKey: 'k', fetch: unauthorized }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TransientError);
    const short = vi.fn(async () => Response.json({ data: [{ embedding: [1, 2], index: 0 }] }));
    await expect(voyageEmbed(['a'], 'query', { apiKey: 'k', fetch: short })).rejects.toThrow('unexpected response shape');
  });

  it('does not call the API for nothing', async () => {
    const fetch = vi.fn();
    expect((await voyageEmbed([], 'document', { apiKey: 'k', fetch })).vectors).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('toPgVector', () => {
  it('formats a vector for Postgres', () => {
    expect(toPgVector([0.5, -1, 2])).toBe('[0.5,-1,2]');
  });
});
