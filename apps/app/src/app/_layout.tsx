import '../../global.css';
import { Stack, router, usePathname } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { useAuthLinks } from '@/lib/auth-links';
import { withCrashReporting } from '@/lib/crash';
import { StatusBar } from 'expo-status-bar';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { PendingShareProvider, usePendingShare } from '@/lib/pending-share';
import { SessionProvider, useSession } from '@/lib/session';
import { Loading, usePalette } from '@/ui/components';

// Keep the library underneath screens opened from outside the app (a share,
// "Open in Fwd:Me"), so there's always a way back to it.
export const unstable_settings = { anchor: '(tabs)' };

export default withCrashReporting(RootLayout);

function RootLayout() {
  return (
    <SessionProvider>
      <PendingShareProvider>
        <LocalizedApp />
      </PendingShareProvider>
    </SessionProvider>
  );
}

function LocalizedApp() {
  const { profile } = useSession();
  const locale = profile?.locale === 'en' || profile?.locale === 'he' ? profile.locale : undefined;
  return (
    <I18nProvider locale={locale}>
      <Routes />
      <StatusBar style="auto" />
    </I18nProvider>
  );
}

function Routes() {
  const { session, loading } = useSession();
  const { t } = useI18n();
  const c = usePalette();
  const onExpiredLink = useCallback(() => {
    if (Platform.OS !== 'web') Alert.alert(t('err_link_expired'));
  }, [t]);
  useAuthLinks(onExpiredLink);
  if (loading) return <Loading />;
  const signedIn = !!session;
  return (
    <>
      <ShareRedirect signedIn={signedIn} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerShadowVisible: false,
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: c.bg },
          headerBackTitle: t('back'),
        }}
      >
        <Stack.Protected guard={signedIn} redirectTo="/sign-in">
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('library') }} />
          <Stack.Screen name="scrap/[id]" options={{ title: '' }} />
          <Stack.Screen name="board/[id]" options={{ title: '' }} />
          <Stack.Screen name="share" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack.Protected>
        {/* Public pages (the stores link to them), signed in or not. */}
        <Stack.Screen name="privacy" />
        <Stack.Screen name="delete-account" />
        <Stack.Protected guard={!signedIn} redirectTo="/">
          <Stack.Screen name="sign-in" options={{ title: t('signIn'), headerShown: false }} />
          <Stack.Screen name="sign-up" options={{ title: t('signUp'), headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

// Whenever something shared from another app is waiting (including after
// signing in), open the share screen.
function ShareRedirect({ signedIn }: { signedIn: boolean }) {
  const { payloads } = usePendingShare();
  const pathname = usePathname();
  useEffect(() => {
    if (signedIn && payloads.length > 0 && pathname !== '/share') router.push('/share');
  }, [signedIn, payloads, pathname]);
  return null;
}
