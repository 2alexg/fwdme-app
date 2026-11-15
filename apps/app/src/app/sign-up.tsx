import { MIN_PASSWORD_LENGTH, USERNAME_PATTERN, signUp } from '@fwdme/core';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { emailRedirectUrl } from '@/lib/auth-links';
import { supabase } from '@/lib/supabase';
import { Brand, Button, Card, Field, Message, Screen, Segmented, Title, usePalette } from '@/ui/components';

export default function SignUpScreen() {
  const { t, errorText, locale, setLocale } = useI18n();
  const c = usePalette();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handle = username.trim().toLowerCase();
  const valid = email.includes('@') && USERNAME_PATTERN.test(handle) && password.length >= MIN_PASSWORD_LENGTH;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { session } = await signUp(supabase, {
        email,
        password,
        username: handle,
        locale,
        emailRedirectTo: emailRedirectUrl(),
      });
      // With email confirmation on (production), there is no session yet.
      if (!session) setNotice(t('checkEmail'));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen narrow>
      <Brand />
      <Title>{t('signUp')}</Title>
      <Segmented
        value={locale}
        onChange={setLocale}
        options={[
          { value: 'he', label: 'עברית' },
          { value: 'en', label: 'English' },
        ]}
      />
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
          label={t('username')}
          hint={t('usernameHint')}
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase())}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          maxLength={30}
        />
        <Field
          label={t('password')}
          hint={t('passwordHint')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          onSubmitEditing={() => valid && submit()}
        />
        <Message text={error} />
        <Message text={notice} tone="success" />
        <Button title={t('signUp')} onPress={submit} busy={busy} disabled={!valid} />
      </Card>
      <Link href="/sign-in" style={{ textAlign: 'center' }}>
        <Text style={{ color: c.accent, fontWeight: '600' }}>{t('haveAccount')}</Text>
      </Link>
    </Screen>
  );
}
