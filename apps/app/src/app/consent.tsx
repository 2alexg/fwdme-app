// One-time AI consent for accounts created before sign-up asked for it.
import { giveAiConsent, signOut } from '@fwdme/core';
import { Link } from 'expo-router';
import { useState } from 'react';
import { LogOut } from 'lucide-react-native';
import { Text } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { forgetShareToken } from '@/lib/share-token';
import { supabase } from '@/lib/supabase';
import { Body, Brand, Button, Card, Checkbox, Message, Screen, Title, usePalette } from '@/ui/components';

export default function ConsentScreen() {
  const { t, errorText } = useI18n();
  const { profile, setProfile } = useSession();
  const c = usePalette();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const at = await giveAiConsent(supabase);
      // The route guard opens the library once the profile has it.
      setProfile({ ...profile, ai_consent_at: at });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Screen noHeader narrow>
      <Brand />
      <Title>{t('aiConsentTitle')}</Title>
      <Card>
        <Body>{t('aiConsentIntro')}</Body>
        <Body>{t('aiConsentText')}</Body>
        <Body small muted>{t('aiConsentWaiting')}</Body>
        <Checkbox checked={agreed} onChange={setAgreed}>
          <Body>{t('aiConsentAgree')}</Body>
        </Checkbox>
        <Message text={error} />
        <Button title={t('aiConsentContinue')} onPress={submit} busy={busy} disabled={!agreed} />
      </Card>
      {/* Not agreeing means not using the app: sign out, or delete the account (see the link below). */}
      <Button
        kind="secondary"
        icon={LogOut}
        title={t('signOut')}
        onPress={() => forgetShareToken().then(() => signOut(supabase)).catch((e) => setError(errorText(e)))}
      />
      <Link href="/delete-account" style={{ textAlign: 'center' }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>{t('deleteAccountHelp')}</Text>
      </Link>
      <Link href="/privacy" style={{ textAlign: 'center' }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>{t('privacyPolicy')}</Text>
      </Link>
    </Screen>
  );
}
