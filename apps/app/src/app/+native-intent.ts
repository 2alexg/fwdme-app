import { isAuthLink } from '@fwdme/core';

// Deep links into Fwd:Me:
// - fwdme://expo-sharing: a share from another app -> the share screen
// - fwdme://#access_token=…: an email confirmation link -> the library
//   (useAuthLinks signs the user in from the same link)
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (path.includes('expo-sharing')) return '/share';
    if (isAuthLink(path)) return '/';
    return path;
  } catch {
    return '/';
  }
}
