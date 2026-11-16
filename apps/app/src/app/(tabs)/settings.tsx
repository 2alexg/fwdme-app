import {
  countScrapsNotIn,
  defaultVisibility,
  setAllScrapsVisibility,
  signOut,
  updateMyProfile,
  type AccountType,
  type Locale,
  type Visibility,
} from '@fwdme/core';
import { useState } from 'react';
import { View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Languages, LogOut, ShieldCheck, UserRound } from 'lucide-react-native';
import { forgetShareToken } from '@/lib/share-token';
import { supabase } from '@/lib/supabase';
import { Body, Button, Card, CardTitle, Loading, Message, Screen, Segmented, space, usePalette } from '@/ui/components';

export default function SettingsScreen() {
  const { profile, setProfile } = useSession();
  const { t, plural, errorText } = useI18n();
  const c = usePalette();
  const [error, setError] = useState<string | null>(null);
  // Kept as data, not text, so it follows a language switch.
  const [notice, setNotice] = useState<{ saved: true } | { bulkDone: number } | null>(null);
  // Offered after the account type changes; existing scraps only change if accepted.
  const [suggestion, setSuggestion] = useState<{ target: Visibility; count: number } | null>(null);
  const [applying, setApplying] = useState(false);

  if (!profile) return <Loading />;

  async function update(patch: { account_type?: AccountType; locale?: Locale }): Promise<boolean> {
    setError(null);
    setNotice(null);
    try {
      setProfile(await updateMyProfile(supabase, profile!.id, patch));
      setNotice({ saved: true });
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  }

  async function changeAccountType(accountType: AccountType) {
    if (accountType === profile!.account_type) return;
    setSuggestion(null);
    if (!(await update({ account_type: accountType }))) return;
    const target = defaultVisibility(accountType);
    try {
      const count = await countScrapsNotIn(supabase, profile!.id, target);
      if (count > 0) setSuggestion({ target, count });
    } catch {
      // The account change itself succeeded; the suggestion is optional.
    }
  }

  async function applyToAll() {
    if (!suggestion) return;
    setApplying(true);
    setError(null);
    try {
      const changed = await setAllScrapsVisibility(supabase, suggestion.target);
      setSuggestion(null);
      setNotice({ bulkDone: changed });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <Screen narrow tabbed>
      <Card>
        <CardTitle icon={UserRound}>{t('account')}</CardTitle>
        <Body>@{profile.username}</Body>
      </Card>

      <Card>
        <CardTitle icon={ShieldCheck}>{t('accountType')}</CardTitle>
        <Segmented
          value={profile.account_type}
          onChange={changeAccountType}
          options={[
            { value: 'private', label: t('vis_private') },
            { value: 'public', label: t('vis_public') },
          ]}
        />
        <Body small>{profile.account_type === 'public' ? t('accountPublic') : t('accountPrivate')}</Body>
        <Body small muted>{t('accountTypeNote')}</Body>
        {suggestion ? (
          <View
            accessibilityRole="alert"
            style={{ backgroundColor: c.chip, borderRadius: 8, padding: space.md, gap: space.md }}
          >
            <Body>{plural(suggestion.target === 'public' ? 'suggestPublic' : 'suggestPrivate', suggestion.count)}</Body>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <Button
                title={suggestion.target === 'public' ? t('makeAllPublic') : t('makeAllPrivate')}
                onPress={applyToAll}
                busy={applying}
              />
              <Button kind="secondary" title={t('keepAsIs')} onPress={() => setSuggestion(null)} disabled={applying} />
            </View>
          </View>
        ) : null}
      </Card>

      <Card>
        <CardTitle icon={Languages}>{t('language')}</CardTitle>
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
      <Message text={!notice ? null : 'bulkDone' in notice ? plural('bulkDone', notice.bulkDone) : t('changesSaved')} tone="success" />
      <Button kind="secondary" icon={LogOut} title={t('signOut')} onPress={() => forgetShareToken().then(() => signOut(supabase)).catch((e) => setError(errorText(e)))} />
    </Screen>
  );
}
