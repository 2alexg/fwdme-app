// Embeddings for search by meaning and "related in your library".
// Voyage makes them (Claude doesn't offer embeddings); this module is shared by
// the enrich worker (documents) and the semantic-search function (queries).

import { TransientError } from './pipeline.ts';

export const EMBEDDING_DIMENSIONS = 1024;
export const DEFAULT_EMBED_MODEL = 'voyage-4';
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
/** Enough of the page text to say what it's about; titles and summaries carry most of it. */
const MAX_PAGE_TEXT = 2000;

export interface EmbeddableItem {
  canonical_url: string;
  ai_title: string | null;
  ai_title_he: string | null;
  og_title: string | null;
  og_description: string | null;
  summary_en: string | null;
  summary_he: string | null;
  tags: string[] | null;
  tag_labels: unknown;
  site_name: string | null;
  raw_text: string | null;
}

/**
 * The text an item's embedding describes: both languages, so Hebrew and English
 * queries both land. Never empty (Voyage refuses empty input): an item the
 * worker couldn't read falls back to its URL.
 */
export function embeddingText(item: EmbeddableItem): string {
  const labels = (item.tag_labels ?? {}) as Record<string, { en?: string; he?: string } | undefined>;
  const tags = (item.tags ?? []).flatMap((key) => [labels[key]?.en || key.replace(/-/g, ' '), labels[key]?.he ?? '']);
  const lines = [
    item.ai_title || item.og_title,
    item.ai_title_he,
    item.ai_title ? item.og_title : null,
    item.summary_en,
    item.summary_he,
    item.og_description,
    tags.filter(Boolean).length ? `Tags: ${[...new Set(tags.filter(Boolean))].join(', ')}` : null,
    item.site_name,
    item.raw_text ? item.raw_text.replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_TEXT) : null,
  ];
  const text = [...new Set(lines.map((l) => l?.trim()).filter((l): l is string => !!l))].join('\n');
  return text || item.canonical_url;
}

/** pgvector's text form, which PostgREST accepts for a vector column or argument. */
export function toPgVector(values: number[]): string {
  return `[${values.join(',')}]`;
}

export interface VoyageOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

/**
 * Embeds up to 1000 texts in one call. Network trouble, rate limits and
 * server errors throw TransientError (try again later); anything else throws Error.
 */
export async function voyageEmbed(
  texts: string[],
  inputType: 'document' | 'query',
  opts: VoyageOptions,
): Promise<{ vectors: number[][]; model: string; tokens: number }> {
  if (texts.length === 0) return { vectors: [], model: opts.model ?? DEFAULT_EMBED_MODEL, tokens: 0 };
  let res: Response;
  try {
    res = await (opts.fetch ?? fetch)(VOYAGE_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        input: texts,
        model: opts.model ?? DEFAULT_EMBED_MODEL,
        input_type: inputType,
        output_dimension: EMBEDDING_DIMENSIONS,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new TransientError(`voyage: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    const message = `voyage ${res.status}: ${detail}`;
    if (res.status === 429 || res.status >= 500) throw new TransientError(message);
    throw new Error(message);
  }
  const body = (await res.json()) as {
    data?: { embedding: number[]; index: number }[];
    model?: string;
    usage?: { total_tokens?: number };
  };
  const data = body.data ?? [];
  if (data.length !== texts.length || data.some((d) => d.embedding?.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error('voyage: unexpected response shape');
  }
  const vectors = [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  return { vectors, model: body.model ?? opts.model ?? DEFAULT_EMBED_MODEL, tokens: body.usage?.total_tokens ?? 0 };
}
