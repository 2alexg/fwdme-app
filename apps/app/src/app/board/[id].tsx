import { deleteBoard, getBoard, isProcessing, listMyScraps, renameBoard, type Scrap } from '@fwdme/core';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { confirm } from '@/lib/confirm';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { usePollWhile } from '@/lib/use-poll';
import { Body, Button, Card, Field, Loading, Message, Screen, Title, space } from '@/ui/components';
import { ScrapGrid, ViewSwitcher, useScrapView } from '@/ui/scrap-grid';

const PAGE = 30;

export default function BoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { t, errorText } = useI18n();
  const userId = session!.user.id;
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [scraps, setScraps] = useState<Scrap[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [view, setView] = useScrapView();
  const loaded = useRef(0);

  const load = useCallback(
    async (offset = 0) => {
      try {
        const limit = offset === 0 ? Math.max(PAGE, loaded.current) : PAGE;
        const [board, page] = await Promise.all([
          offset === 0 ? getBoard(supabase, id) : Promise.resolve(undefined),
          listMyScraps(supabase, userId, { boardId: id, limit, offset }),
        ]);
        if (board !== undefined) setName(board?.name ?? null);
        setScraps((prev) => {
          const next = offset === 0 ? page : [...(prev ?? []), ...page];
          loaded.current = next.length;
          return next;
        });
        setHasMore(page.length === limit);
        setError(null);
      } catch (e) {
        setError(errorText(e));
        setName((prev) => (prev === undefined ? null : prev));
      }
    },
    [id, userId, errorText],
  );

  // Reload when coming back from a scrap (it may have been taken off this board).
  useFocusEffect(
    useCallback(() => {
      load(0);
    }, [load]),
  );
  usePollWhile(!!scraps?.some(isProcessing), () => load(0));

  if (name === undefined) return <Loading />;
  if (name === null) {
    return (
      <Screen>
        <Message text={error} />
        <Body muted>{t('boardNotFound')}</Body>
      </Screen>
    );
  }

  async function saveName() {
    if (renaming === null) return;
    try {
      const board = await renameBoard(supabase, id, renaming);
      setName(board.name);
      setRenaming(null);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove() {
    if (!(await confirm(t('confirmDeleteBoard'), { ok: t('delete'), cancel: t('cancel') }))) return;
    try {
      await deleteBoard(supabase, id);
      if (router.canGoBack()) router.back();
      else router.replace('/boards');
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <Screen>
        {renaming === null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Title>{name}</Title>
            </View>
            <ViewSwitcher value={view} onChange={setView} />
          </View>
        ) : (
          <Card>
            <Field value={renaming} onChangeText={setRenaming} maxLength={80} autoFocus onSubmitEditing={saveName} accessibilityLabel={t('rename')} />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title={t('save')} onPress={saveName} disabled={!renaming.trim()} />
              <Button kind="secondary" title={t('cancel')} onPress={() => setRenaming(null)} />
            </View>
          </Card>
        )}
        <Message text={error} />
        {scraps === null ? null : scraps.length === 0 ? <Body muted>{t('boardEmpty')}</Body> : <ScrapGrid scraps={scraps} view={view} />}
        {hasMore ? <Button kind="secondary" title={t('loadMore')} onPress={() => load(scraps?.length ?? 0)} /> : null}
        {renaming === null ? (
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Button kind="secondary" title={t('rename')} onPress={() => setRenaming(name)} />
            <Button kind="danger" title={t('deleteBoard')} onPress={remove} />
          </View>
        ) : null}
      </Screen>
    </>
  );
}
