// What you see after sharing a link to Fwd:Me from another app. The link is
// saved immediately (no questions); the comment and visibility are optional
// extras, and the screen closes on its own unless you start using them.
import {
  addComment,
  getScrap,
  hostnameOf,
  saveScrap,
  setScrapVisibility,
  shareKey,
  shareToSave,
  type Visibility,
} from '@fwdme/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Text, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { usePendingShare } from '@/lib/pending-share';
import { supabase } from '@/lib/supabase';
import { Body, Button, Card, Field, Message, Screen, VisibilityPicker, space, usePalette } from '@/ui/components';

const AUTO_CLOSE_MS = 4000;

type State =
  | { kind: 'saving' }
  | { kind: 'saved'; scrapId: string; alreadySaved: boolean; host: string }
  | { kind: 'no-link' }
  | { kind: 'error'; message: string };

export default function ShareScreen() {
  const { payloads, clear } = usePendingShare();
  const { t, errorText } = useI18n();
  const c = usePalette();
  const [state, setState] = useState<State>({ kind: 'saving' });
  const [comment, setComment] = useState('');
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [touched, setTouched] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const savedKey = useRef<string | null>(null);

  const save = useCallback(async () => {
    const share = shareToSave(payloads);
    if (!share) {
      setState({ kind: 'no-link' });
      return;
    }
    setState({ kind: 'saving' });
    try {
      const result = await saveScrap(supabase, { input: share.url, sharedText: share.sharedText });
      setState({ kind: 'saved', scrapId: result.scrapId, alreadySaved: result.alreadySaved, host: hostnameOf(share.url) });
      // Show the stored visibility (account default, or what it already had).
      getScrap(supabase, result.scrapId)
        .then((scrap) => scrap && setVisibility(scrap.visibility))
        .catch(() => {});
    } catch (e) {
      setState({ kind: 'error', message: errorText(e) });
    }
  }, [payloads, errorText]);

  // Save each distinct share once, as soon as it arrives.
  useEffect(() => {
    if (payloads.length === 0) return;
    const key = shareKey(payloads);
    if (savedKey.current === key) return;
    savedKey.current = key;
    setComment('');
    setVisibility(null);
    setTouched(false);
    save();
  }, [payloads, save]);

  // Nothing pending (e.g. opened /share directly): go to the library.
  useEffect(() => {
    if (payloads.length === 0 && savedKey.current === null) router.dismissTo('/');
  }, [payloads]);

  const finish = useCallback(
    async (next: 'source-app' | 'library' | 'open-scrap') => {
      setFinishing(true);
      const scrapId = state.kind === 'saved' ? state.scrapId : null;
      if (scrapId && comment.trim()) {
        await addComment(supabase, scrapId, comment).catch(() => {});
      }
      clear();
      // The library is always underneath (the root layout's anchor), so the
      // share screen is swapped for the scrap or popped back to the library;
      // either way Back leads to the library.
      if (next === 'open-scrap' && scrapId) {
        router.replace({ pathname: '/scrap/[id]', params: { id: scrapId } });
        return;
      }
      router.dismissTo('/');
      // Android: leave the app so the user is back where they shared from.
      if (next === 'source-app' && Platform.OS === 'android') BackHandler.exitApp();
    },
    [state, comment, clear],
  );

  // Close on its own after a successful save, unless the user starts typing
  // a comment or changes visibility.
  useEffect(() => {
    if (state.kind !== 'saved' || touched || finishing) return;
    const timer = setTimeout(() => finish('source-app'), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [state, touched, finishing, finish]);

  async function changeVisibility(next: Visibility) {
    if (state.kind !== 'saved') return;
    setTouched(true);
    const prev = visibility;
    setVisibility(next);
    try {
      await setScrapVisibility(supabase, state.scrapId, next);
    } catch (e) {
      setVisibility(prev);
      setState({ kind: 'error', message: errorText(e) });
    }
  }

  return (
    <Screen noHeader narrow>
      <Card>
        {state.kind === 'saving' ? <Body>{t('shareSaving')}</Body> : null}

        {state.kind === 'saved' ? (
          <View style={{ gap: space.md }} onTouchStart={() => setTouched(true)}>
            <Text style={{ color: c.success, fontSize: 20, fontWeight: '700', textAlign: 'auto' }}>
              ✓ {state.alreadySaved ? t('shareAlreadySaved') : t('shareSaved')}
            </Text>
            <Body small muted>{state.host}</Body>
            <Field
              value={comment}
              onChangeText={(v) => {
                setTouched(true);
                setComment(v);
              }}
              onFocus={() => setTouched(true)}
              placeholder={t('addComment')}
              accessibilityLabel={t('addComment')}
              multiline
            />
            {visibility ? <VisibilityPicker value={visibility} onChange={changeVisibility} /> : null}
            {!touched ? <Body small muted>{t('shareAutoClose')}</Body> : null}
            <Button title={t('done')} onPress={() => finish('source-app')} busy={finishing} />
            <Button kind="link" title={t('openInApp')} onPress={() => finish('open-scrap')} disabled={finishing} />
            <Button kind="link" title={t('goToLibrary')} onPress={() => finish('library')} disabled={finishing} />
          </View>
        ) : null}

        {state.kind === 'no-link' ? (
          <>
            <Body>{t('shareNoLink')}</Body>
            <Button title={t('close')} onPress={() => finish('source-app')} />
          </>
        ) : null}

        {state.kind === 'error' ? (
          <>
            <Message text={state.message} />
            <Button title={t('retry')} onPress={save} />
            <Button kind="secondary" title={t('close')} onPress={() => finish('source-app')} />
            <Button kind="link" title={t('goToLibrary')} onPress={() => finish('library')} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
