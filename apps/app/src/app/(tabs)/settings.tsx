import {
  countScrapsNotIn,
  deleteMyAccount,
  sendFeedback,
  defaultVisibility,
  setAllScrapsVisibility,
  signOut,
  updateMyProfile,
  type AccountType,
  type Locale,
  type Visibility,
} from '@fwdme/core';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { sendTestCrashReport } from '@/lib/crash';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Languages, LogOut, MessageCircleHeart, Send, ShieldCheck, Trash2, UserRound } from 'lucide-react-native';
import { forgetShareToken } from '@/lib/share-token';
import { supabase } from '@/lib/supabase';
import { Body, Button, Card, CardTitle, Field, Loading, Message, Screen, Segmented, space, usePalette } from '@/ui/components';

export default function SettingsScreen() {
  const { profile, setProfile } = useSession();
  const { t, plural, errorText } = useI18n();
  const c = usePalette();
  const [error, setError] = useState<string | null>(null);
  // Kept as data, not text, so it follows a language switch.
  const [notice, setNotice] = useState<{ saved: true } | { bulkDone: number } | { testReport: true } | null>(null);
  // Offered after the account type changes; existing scraps only change if accepted.
  const [suggestion, setSuggestion] = useState<{ target: Visibility; count: number } | null>(null);
  const [applying, setApplying] = useState(false);
  // Delete account: opened, then the username typed to confirm.
  const [feedback, setFeedback] = useState('');
  const [feedbackState, setFeedbackState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ typed: string; busy: boolean } | null>(null);

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

  const usernameTyped =
    !!deleting && deleting.typed.trim().replace(/^@/, '').toLowerCase() === profile.username.toLowerCase();

  async function submitFeedback() {
    setFeedbackState('sending');
    setFeedbackError(null);
    try {
      await sendFeedback(supabase, feedback, {
        appVersion: Constants.expoConfig?.version,
        platform: Platform.OS,
        osVersion: String(Platform.Version ?? ''),
        locale: profile!.locale,
      });
      setFeedback('');
      setFeedbackState('sent');
    } catch (e) {
      setFeedbackError(errorText(e));
      setFeedbackState('idle');
    }
  }

  async function deleteAccount() {
    if (!usernameTyped) return;
    setDeleting((d) => d && { ...d, busy: true });
    setError(null);
    try {
      await deleteMyAccount(supabase);
      // The token is already gone with the account; this clears it from the device.
      await forgetShareToken();
    } catch (e) {
      setError(errorText(e));
      setDeleting((d) => d && { ...d, busy: false });
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

      <Card>
        <CardTitle icon={MessageCircleHeart}>{t('feedback')}</CardTitle>
        <Body small muted>{t('feedbackNote')}</Body>
        <Field
          multiline
          value={feedback}
          onChangeText={(text) => {
            setFeedback(text);
            if (feedbackState === 'sent') setFeedbackState('idle');
          }}
          placeholder={t('feedbackPlaceholder')}
          maxLength={5000}
          editable={feedbackState !== 'sending'}
        />
        <Message text={feedbackError} />
        <Message text={feedbackState === 'sent' ? t('feedbackSent') : null} tone="success" />
        <Button
          icon={Send}
          title={t('feedbackSend')}
          onPress={submitFeedback}
          disabled={!feedback.trim()}
          busy={feedbackState === 'sending'}
        />
      </Card>

      <Message text={error} />
      <Message text={!notice ? null : 'bulkDone' in notice ? plural('bulkDone', notice.bulkDone) : 'testReport' in notice ? t('testReportSent') : t('changesSaved')} tone="success" />
      <Button kind="secondary" icon={LogOut} title={t('signOut')} onPress={() => forgetShareToken().then(() => signOut(supabase)).catch((e) => setError(errorText(e)))} />

      <Card>
        <CardTitle icon={Trash2}>{t('deleteAccount')}</CardTitle>
        <Body small muted>{t('deleteAccountNote')}</Body>
        {deleting ? (
          <>
            <Field
              label={t('deleteAccountType')}
              placeholder={profile.username}
              ltr
              value={deleting.typed}
              onChangeText={(typed) => setDeleting({ ...deleting, typed })}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!deleting.busy}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <Button
                kind="danger"
                icon={Trash2}
                title={t('deleteAccountForever')}
                onPress={deleteAccount}
                disabled={!usernameTyped}
                busy={deleting.busy}
              />
              <Button kind="secondary" title={t('cancel')} onPress={() => setDeleting(null)} disabled={deleting.busy} />
            </View>
          </>
        ) : (
          <Button kind="danger" title={t('deleteAccount')} onPress={() => setDeleting({ typed: '', busy: false })} />
        )}
      </Card>

      {/* Long-press: send a test crash report (checks the setup in a real build). */}
      <Pressable
        onLongPress={() => {
          if (sendTestCrashReport()) setNotice({ testReport: true });
        }}
        delayLongPress={1500}
        style={{ alignSelf: 'center', padding: space.sm }}
      >
        <Body small muted>{t('version').replace('{v}', Constants.expoConfig?.version ?? '')}</Body>
      </Pressable>
    </Screen>
  );
}
