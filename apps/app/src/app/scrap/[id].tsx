import {
  addComment,
  deleteComment,
  deleteScrap,
  editComment,
  getScrap,
  hostnameOf,
  scrapSummary,
  scrapTitle,
  setScrapVisibility,
  type Scrap,
  type ScrapComment,
} from '@scrapbook/core';
import * as Linking from 'expo-linking';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { confirm } from '@/lib/confirm';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import {
  Body,
  Button,
  Card,
  Field,
  Loading,
  Message,
  Screen,
  Title,
  VisibilityPicker,
  space,
  usePalette,
  type VisibilityChoice,
} from '@/ui/components';

export default function ScrapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, errorText } = useI18n();
  const c = usePalette();
  const [scrap, setScrap] = useState<Scrap | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setScrap(await getScrap(supabase, id));
    } catch (e) {
      setError(errorText(e));
      setScrap(null);
    }
  }, [id, errorText]);

  useEffect(() => {
    load();
  }, [load]);

  if (scrap === undefined) return <Loading />;
  if (scrap === null) {
    return (
      <Screen>
        <Message text={error} />
        <Body muted>{t('notFound')}</Body>
      </Screen>
    );
  }

  const summary = scrapSummary(scrap, locale);

  async function changeVisibility(choice: VisibilityChoice) {
    const next = choice === 'default' ? null : choice;
    const prev = scrap!.visibility;
    setScrap({ ...scrap!, visibility: next });
    try {
      await setScrapVisibility(supabase, scrap!.id, next);
    } catch (e) {
      setScrap({ ...scrap!, visibility: prev });
      setError(errorText(e));
    }
  }

  async function remove() {
    if (!(await confirm(t('confirmDeleteScrap'), { ok: t('delete'), cancel: t('cancel') }))) return;
    try {
      await deleteScrap(supabase, scrap!.id);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: scrapTitle(scrap) }} />
      <Screen>
        <Title>{scrapTitle(scrap)}</Title>
        <Message text={error} />

        <Comments scrapId={scrap.id} comments={scrap.comments} onChange={(comments) => setScrap({ ...scrap, comments })} />

        <Card>
          {scrap.item.og_image ? (
            <Image
              source={{ uri: scrap.item.og_image }}
              style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 8 }}
              resizeMode="cover"
            />
          ) : null}
          <Text style={{ color: c.muted, fontSize: 13 }} selectable>
            {hostnameOf(scrap.original_url)}
          </Text>
          <Button kind="secondary" title={t('openOriginal')} onPress={() => Linking.openURL(scrap.original_url)} />
          {summary ? <Body>{summary}</Body> : <Body small muted>{t('summaryPending')}</Body>}
          {scrap.item.tags.length > 0 ? <Body small muted>{scrap.item.tags.map((tag) => `#${tag}`).join('  ')}</Body> : null}
          {scrap.shared_text ? <Body small muted>{scrap.shared_text}</Body> : null}
        </Card>

        <Card>
          <Text style={{ color: c.text, fontWeight: '700' }}>{t('visibility')}</Text>
          <VisibilityPicker value={scrap.visibility ?? 'default'} onChange={changeVisibility} />
        </Card>

        <Button kind="danger" title={t('deleteScrap')} onPress={remove} />
      </Screen>
    </>
  );
}

function Comments({
  scrapId,
  comments,
  onChange,
}: {
  scrapId: string;
  comments: ScrapComment[];
  onChange: (comments: ScrapComment[]) => void;
}) {
  const { t, errorText, locale } = useI18n();
  const c = usePalette();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fmt = new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', { dateStyle: 'medium' });

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const created = await addComment(supabase, scrapId, draft);
      onChange([...comments, created]);
      setDraft('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      const updated = await editComment(supabase, editing.id, editing.body);
      onChange(comments.map((x) => (x.id === updated.id ? updated : x)));
      setEditing(null);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove(id: string) {
    try {
      await deleteComment(supabase, id);
      onChange(comments.filter((x) => x.id !== id));
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Card>
      <Text style={{ color: c.text, fontWeight: '700' }}>{t('comments')}</Text>
      {comments.length === 0 ? <Body small muted>{t('noComments')}</Body> : null}
      {comments.map((comment) =>
        editing?.id === comment.id ? (
          <View key={comment.id} style={{ gap: space.sm }}>
            <Field value={editing.body} onChangeText={(body) => setEditing({ id: comment.id, body })} multiline autoFocus />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title={t('save')} onPress={saveEdit} disabled={!editing.body.trim()} />
              <Button kind="secondary" title={t('cancel')} onPress={() => setEditing(null)} />
            </View>
          </View>
        ) : (
          <View key={comment.id} style={{ gap: space.xs, borderBottomColor: c.border, borderBottomWidth: 1, paddingBottom: space.sm }}>
            <Body>{comment.body}</Body>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Text style={{ color: c.muted, fontSize: 12 }}>
                {fmt.format(new Date(comment.created_at))}
                {comment.edited_at ? ` · ${t('edited')}` : ''}
              </Text>
              <Text accessibilityRole="button" onPress={() => setEditing({ id: comment.id, body: comment.body })} style={{ color: c.accent, fontSize: 12 }}>
                {t('edit')}
              </Text>
              <Text accessibilityRole="button" onPress={() => remove(comment.id)} style={{ color: c.danger, fontSize: 12 }}>
                {t('delete')}
              </Text>
            </View>
          </View>
        ),
      )}
      <Field value={draft} onChangeText={setDraft} placeholder={t('addCommentPlaceholder')} multiline accessibilityLabel={t('addCommentPlaceholder')} />
      <Message text={error} />
      <Button title={t('add')} onPress={add} busy={busy} disabled={!draft.trim()} />
    </Card>
  );
}
