// Crash reporting (Sentry) on iOS and Android. Off unless the build has
// EXPO_PUBLIC_SENTRY_DSN (set in eas.json), and off in development.
//
// Privacy: no IP address or device name (sendDefaultPii: false), no screen
// recording, no performance tracing. Reports carry the account's id (a random
// uuid) so a crash can be matched to feedback; never the email or username.
// Query strings are dropped from request breadcrumbs, since search words and
// filters travel in them.
import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const crashReportingOn = !!DSN && !__DEV__;

if (crashReportingOn) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.EXPO_PUBLIC_APP_ENV || 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeBreadcrumb(breadcrumb) {
      const url = breadcrumb.data?.url;
      if (typeof url === 'string') breadcrumb.data = { ...breadcrumb.data, url: url.split('?')[0] };
      return breadcrumb;
    },
  });
}

/** Wraps the root component so render errors and native crashes are caught. */
export function withCrashReporting(Root: ComponentType): ComponentType {
  return crashReportingOn ? Sentry.wrap(Root as ComponentType<Record<string, unknown>>) : Root;
}

/** Tags reports with who is signed in (account id only), or clears it. */
export function setCrashUser(userId: string | null) {
  if (crashReportingOn) Sentry.setUser(userId ? { id: userId } : null);
}

/** Sends a test report (long-press the version in Settings). False when reporting is off. */
export function sendTestCrashReport(): boolean {
  if (!crashReportingOn) return false;
  Sentry.captureException(new Error('Test report from Settings'));
  return true;
}
