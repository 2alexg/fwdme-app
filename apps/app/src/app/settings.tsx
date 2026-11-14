import { signOut, updateMyProfile, type AccountType, type Locale } from '@scrapbook/core';
import { useState } from 'react';
import { Text } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { Body, Button, Card, Loading, Message, Screen, Segmented, usePalette } from '@/ui/components';

export default function SettingsScreen() {
  const { profile, setProfile } = useSession();
  const { t, errorText } = useI18n();
  const c = usePalette();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!profile) return <Loading />;

  async function update(patch: { account_type?: AccountType; locale?: Locale }) {
    setError(null);
    setSaved(false);
    try {
      setProfile(await updateMyProfile(supabase, profile!.id, patch));
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Screen narrow>
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('account')}</Text>
        <Body>@{profile.username}</Body>
      </Card>

      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('accountType')}</Text>
        <Segmented
          value={profile.account_type}
          onChange={(account_type) => update({ account_type })}
          options={[
            { value: 'private', label: t('vis_private') },
            { value: 'public', label: t('vis_public') },
          ]}
        />
        <Body small>{profile.account_type === 'public' ? t('accountPublic') : t('accountPrivate')}</Body>
        <Body small muted>{t('accountTypeNote')}</Body>
      </Card>

      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('language')}</Text>
        <Segmented
          value={profile.locale as Locale}
          onChange={(locale) => update({ locale })}
          options={[
            { value: 'he', label: 'עברית' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Card>

      <Message text={error} />
      <Message text={saved ? t('changesSaved') : null} tone="success" />
      <Button kind="secondary" title={t('signOut')} onPress={() => signOut(supabase).catch((e) => setError(errorText(e)))} />
    </Screen>
  );
}
