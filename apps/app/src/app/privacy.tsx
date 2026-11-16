import { Stack } from 'expo-router';
import { useI18n } from '@/lib/i18n';
import { privacyPolicy } from '@/lib/legal';
import { LegalPage } from '@/ui/legal-page';

export default function PrivacyScreen() {
  const { t } = useI18n();
  return (
    <>
      <Stack.Screen options={{ title: t('privacyPolicy') }} />
      <LegalPage title={t('privacyPolicy')} sections={privacyPolicy} />
    </>
  );
}
