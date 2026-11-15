import { signIn } from '@fwdme/core';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { usePendingShare } from '@/lib/pending-share';
import { supabase } from '@/lib/supabase';
import { Body, Brand, Button, Card, Field, Message, Screen, usePalette } from '@/ui/components';

export default function SignInScreen() {
  const { t, errorText } = useI18n();
  const c = usePalette();
  const { payloads } = usePendingShare();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(supabase, email, password);
      // The session listener swaps the routes; nothing else to do here.
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Screen narrow>
      <Brand />
      {payloads.length > 0 ? <Body>{t('shareSignIn')}</Body> : null}
      <Card>
        <Field
          label={t('email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
        />
        <Field
          label={t('password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          onSubmitEditing={submit}
        />
        <Message text={error} />
        <Button title={t('signIn')} onPress={submit} busy={busy} disabled={!email || !password} />
      </Card>
      <Link href="/sign-up" style={{ textAlign: 'center' }}>
        <Text style={{ color: c.accent, fontWeight: '600' }}>{t('noAccount')}</Text>
      </Link>
    </Screen>
  );
}
