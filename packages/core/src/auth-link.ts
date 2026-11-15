/**
 * Reads the link Supabase sends people back to after they click an email
 * confirmation (e.g. fwdme://#access_token=…&refresh_token=…&type=signup).
 * Tokens may arrive in the fragment or the query string.
 */
export type AuthLink =
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string }
  | null;

export function parseAuthLink(url: string): AuthLink {
  const params = new URLSearchParams();
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) {
    const end = hashIndex > queryIndex ? hashIndex : undefined;
    new URLSearchParams(url.slice(queryIndex + 1, end)).forEach((v, k) => params.set(k, v));
  }
  if (hashIndex !== -1) {
    new URLSearchParams(url.slice(hashIndex + 1)).forEach((v, k) => params.set(k, v));
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken };

  const error = params.get('error_description') ?? params.get('error');
  if (error) return { kind: 'error', message: error };
  return null;
}

/** True for links that belong to the email-confirmation flow, not to a screen. */
export function isAuthLink(url: string): boolean {
  return parseAuthLink(url) !== null;
}
