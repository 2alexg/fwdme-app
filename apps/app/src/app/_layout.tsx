import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { SessionProvider, useSession } from '@/lib/session';
import { Loading, usePalette } from '@/ui/components';

export default function RootLayout() {
  return (
    <SessionProvider>
      <LocalizedApp />
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
  if (loading) return <Loading />;
  const signedIn = !!session;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        contentStyle: { backgroundColor: c.bg },
        headerBackTitle: t('back'),
      }}
    >
      <Stack.Protected guard={signedIn} redirectTo="/sign-in">
        <Stack.Screen name="index" options={{ title: t('library') }} />
        <Stack.Screen name="scrap/[id]" options={{ title: '' }} />
        <Stack.Screen name="settings" options={{ title: t('settings') }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo="/">
        <Stack.Screen name="sign-in" options={{ title: t('signIn'), headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: t('signUp'), headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
