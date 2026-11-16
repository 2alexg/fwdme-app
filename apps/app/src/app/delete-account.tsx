import { router, Stack } from 'expo-router';
import { useI18n } from '@/lib/i18n';
import { deleteAccountHelp } from '@/lib/legal';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/components';
import { LegalPage } from '@/ui/legal-page';

// Linked from Google Play: how to delete an account, with or without the app.
export default function DeleteAccountHelpScreen() {
  const { t } = useI18n();
  const { session } = useSession();
  return (
    <>
      <Stack.Screen options={{ title: t('deleteAccountHelp') }} />
      <LegalPage title={t('deleteAccountHelp')} sections={deleteAccountHelp}>
        <Button
          kind="secondary"
          title={session ? t('openSettings') : t('signIn')}
          onPress={() => router.push(session ? '/settings' : '/sign-in')}
        />
      </LegalPage>
    </>
  );
}
