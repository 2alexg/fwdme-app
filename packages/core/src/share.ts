import { extractUrl } from './url.ts';

/** What the OS hands over when someone shares to the app (subset of expo-sharing's SharePayload). */
export interface IncomingShare {
  value: string;
  shareType: 'text' | 'url' | 'audio' | 'image' | 'video' | 'file';
  mimeType?: string;
}

export interface ShareToSave {
  /** The link to save. */
  url: string;
  /** Any extra text the source app sent along (often the post's caption). */
  sharedText?: string;
}

/**
 * Picks the link out of a share. Apps send it as a URL, as plain text, or
 * buried in a caption ("Check this out! https://…"). Returns null when there
 * is no web link (e.g. only an image or plain words).
 */
export function shareToSave(payloads: readonly IncomingShare[]): ShareToSave | null {
  const textual = payloads.filter((p) => p.shareType === 'url' || p.shareType === 'text');
  for (const payload of textual) {
    const url = extractUrl(payload.value);
    if (!url) continue;
    const others = textual.filter((p) => p !== payload).map((p) => p.value.trim());
    const rest = [payload.value.replace(url, ''), ...others]
      .map((s) => s.replace(/[ \t]{2,}/g, ' ').trim())
      .filter((s) => s && s !== url && extractUrl(s) !== url);
    const sharedText = rest.join('\n').trim();
    return sharedText ? { url, sharedText } : { url };
  }
  return null;
}

/** Stable key for a set of payloads, so one share is saved only once. */
export function shareKey(payloads: readonly IncomingShare[]): string {
  return payloads.map((p) => `${p.shareType}|${p.mimeType ?? ''}|${p.value}`).join('\n');
}
