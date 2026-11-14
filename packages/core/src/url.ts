export type Source = 'web' | 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'x';

export interface NormalizedLink {
  /** What the user shared, trimmed. Shown as the link they saved. */
  originalUrl: string;
  /** Stable key used to share one item across everyone who saves it. */
  canonicalUrl: string;
  source: Source;
}

export class InvalidUrlError extends Error {
  constructor(input: string) {
    super(`Not a web link: ${input.slice(0, 200)}`);
    this.name = 'InvalidUrlError';
  }
}

// Query parameters that only track who shared what. Removed everywhere.
const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'yclid', 'igshid', 'igsh', 'mc_cid', 'mc_eid',
  '_hsenc', '_hsmi', 'ref_src', 'ref_url', 'share_id', 'sender_device', 'is_from_webapp',
  'is_copy_url', 'mibextid', 'rdid', 'feature', 'pp',
]);
const TRACKING_PREFIXES = ['utm_', 'hsa_', 'pk_', 'mtm_'];

// Platforms whose share links carry nothing but tracking in the query
// string; their canonical form keeps the path only.
const PATH_ONLY_SOURCES: ReadonlySet<Source> = new Set(['instagram', 'tiktok', 'x']);

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"'‎‏]+/i;
const BARE_DOMAIN = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#]\S*)?$/i;

/** Pulls the first link out of shared text such as "Look at this! https://…". */
export function extractUrl(text: string): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(URL_IN_TEXT);
  if (match) return match[0].replace(/[),.!?;:\]]+$/, '');
  if (BARE_DOMAIN.test(trimmed)) return `https://${trimmed}`;
  return null;
}

export function detectSource(hostname: string): Source {
  const host = hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (is('youtube.com') || host === 'youtu.be') return 'youtube';
  if (is('tiktok.com')) return 'tiktok';
  if (is('instagram.com')) return 'instagram';
  if (is('facebook.com') || host === 'fb.watch' || host === 'fb.com') return 'facebook';
  if (is('x.com') || is('twitter.com')) return 'x';
  return 'web';
}

/**
 * Turns whatever the user shared into a stable URL so 1,000 saves of the same
 * reel share one item. Redirect-based short links (vm.tiktok.com, bit.ly) are
 * resolved later by the worker, which can follow redirects.
 */
export function normalizeLink(input: string): NormalizedLink {
  const raw = extractUrl(input);
  if (!raw) throw new InvalidUrlError(input);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidUrlError(input);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new InvalidUrlError(input);
  if (!url.hostname.includes('.')) throw new InvalidUrlError(input);

  const source = detectSource(url.hostname);
  url.protocol = 'https:';
  url.hash = '';
  url.username = '';
  url.password = '';
  url.port = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');

  if (source === 'youtube') canonicalYouTube(url);
  if (source === 'x') url.hostname = 'x.com';
  if (source !== 'web' && source !== 'youtube') {
    url.hostname = url.hostname.replace(/^(m|mobile)\./, '');
  }

  if (PATH_ONLY_SOURCES.has(source)) {
    url.search = '';
  } else {
    const kept = [...url.searchParams.entries()]
      .filter(([key]) => {
        const k = key.toLowerCase();
        return !TRACKING_PARAMS.has(k) && !TRACKING_PREFIXES.some((p) => k.startsWith(p));
      })
      .filter(([key]) => !(source === 'youtube' && key !== 'v' && key !== 'list'))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    url.search = new URLSearchParams(kept).toString();
  }

  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');

  return { originalUrl: raw, canonicalUrl: url.toString(), source };
}

function canonicalYouTube(url: URL) {
  const host = url.hostname.replace(/^(m|music)\./, '');
  let id: string | undefined;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else {
    const m = url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/);
    if (m) id = m[1];
  }
  url.hostname = 'youtube.com';
  if (id) {
    url.pathname = '/watch';
    url.search = new URLSearchParams({ v: id }).toString();
  }
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
