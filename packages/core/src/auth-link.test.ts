import { describe, expect, it } from 'vitest';
import { isAuthLink, parseAuthLink } from './auth-link';

describe('parseAuthLink', () => {
  it('reads tokens from the fragment', () => {
    expect(
      parseAuthLink('fwdme://#access_token=aaa&expires_in=3600&refresh_token=rrr&token_type=bearer&type=signup'),
    ).toEqual({ kind: 'session', accessToken: 'aaa', refreshToken: 'rrr' });
  });

  it('reads tokens from the query string', () => {
    expect(parseAuthLink('fwdme:///?access_token=aaa&refresh_token=rrr')).toEqual({
      kind: 'session',
      accessToken: 'aaa',
      refreshToken: 'rrr',
    });
  });

  it('reports an expired or invalid link', () => {
    expect(
      parseAuthLink('fwdme://#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'),
    ).toEqual({ kind: 'error', message: 'Email link is invalid or has expired' });
  });

  it('ignores ordinary links', () => {
    expect(parseAuthLink('fwdme://scrap/123')).toBeNull();
    expect(parseAuthLink('fwdme://expo-sharing')).toBeNull();
    expect(isAuthLink('fwdme://')).toBe(false);
  });
});
