import {
  CATEGORY_KEYS,
  addComment,
  addScrapToBoard,
  createBoard,
  listMyBoards,
  removeScrapFromBoard,
  categoryEmoji,
  categoryLabel,
  deleteComment,
  deleteScrap,
  editComment,
  getScrap,
  hostnameOf,
  isProcessing,
  retryScrap,
  scrapImageUrl,
  scrapSummary,
  scrapTags,
  scrapTitle,
  setScrapCategory,
  setScrapVisibility,
  type Board,
  type Category,
  type Scrap,
  type ScrapComment,
  type Visibility,
} from '@fwdme/core';
import * as Linking from 'expo-linking';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { confirm } from '@/lib/confirm';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { usePollWhile } from '@/lib/use-poll';
import {
  Body,
  Button,
  Card,
  Chip,
  Field,
  Loading,
  Message,
  Screen,
  Thumbnail,
  Title,
  VisibilityPicker,
  space,
  usePalette,
} from '@/ui/components';

export default function ScrapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, errorText } = useI18n();
  const c = usePalette();
  const [scrap, setScrap] = useState<Scrap | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getScrap(supabase, id).then(
      (row) => {
        if (!cancelled) setScrap(row);
      },
      (e) => {
        if (cancelled) return;
        setError(errorText(e));
        setScrap(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, errorText]);

  // Keep the comments the user may be typing: only refresh the item's fields.
  const refreshItem = useCallback(async () => {
    try {
      const fresh = await getScrap(supabase, id);
      if (fresh) setScrap((prev) => (prev ? { ...prev, item: fresh.item, category: fresh.category } : fresh));
    } catch {
      // Try again on the next tick.
    }
  }, [id]);
  usePollWhile(!!scrap && isProcessing(scrap), refreshItem);

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
  const tags = scrapTags(scrap, locale);
  const title = scrapTitle(scrap, locale);
  const processing = isProcessing(scrap);

  async function retry() {
    setError(null);
    try {
      if (await retryScrap(supabase, scrap!.id)) await refreshItem();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function changeVisibility(next: Visibility) {
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
      <Stack.Screen options={{ title }} />
      <Screen>
        <Title>{title}</Title>
        <Message text={error} />

        <Comments scrapId={scrap.id} comments={scrap.comments} onChange={(comments) => setScrap({ ...scrap, comments })} />

        <Card>
          <Thumbnail uri={scrapImageUrl(supabase, scrap)} source={scrap.item.source} rounded />
          <Text style={{ color: c.muted, fontSize: 13 }} selectable>
            {[scrap.item.site_name || hostnameOf(scrap.original_url), scrap.item.author_name].filter(Boolean).join(' · ')}
          </Text>
          <Button kind="secondary" title={t('openOriginal')} onPress={() => Linking.openURL(scrap.original_url)} />
          {processing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <ActivityIndicator size="small" color={c.muted} />
              <Body small muted>{t('summaryProcessing')}</Body>
            </View>
          ) : scrap.item.status === 'failed' ? (
            <View style={{ gap: space.sm }}>
              <Body small muted>{t('failedHint')}</Body>
              <Button kind="secondary" title={t('retry')} onPress={retry} />
            </View>
          ) : null}
          {summary ? <Body>{summary}</Body> : null}
          {tags.length > 0 ? <Body small muted>{tags.map((tag) => `#${tag.label}`).join('  ')}</Body> : null}
          {scrap.shared_text ? <Body small muted>{scrap.shared_text}</Body> : null}
        </Card>

        <CategoryCard
          scrap={scrap}
          onChange={(category, override) => setScrap({ ...scrap, category, user_category_override: override })}
          onError={(e) => setError(errorText(e))}
        />

        <BoardsCard
          scrapId={scrap.id}
          onBoards={scrap.boards.map((b) => b.board_id)}
          onChange={(ids) => setScrap((prev) => (prev ? { ...prev, boards: ids.map((board_id) => ({ board_id })) } : prev))}
        />

        <Card>
          <Text style={{ color: c.text, fontWeight: '700' }}>{t('visibility')}</Text>
          <VisibilityPicker value={scrap.visibility} onChange={changeVisibility} />
        </Card>

        <Button kind="danger" title={t('deleteScrap')} onPress={remove} />
      </Screen>
    </>
  );
}

/** Which of my boards this scrap is on; tap to add or remove, or make a new board for it. */
function BoardsCard({
  scrapId,
  onBoards,
  onChange,
}: {
  scrapId: string;
  onBoards: string[];
  onChange: (boardIds: string[]) => void;
}) {
  const { t, errorText } = useI18n();
  const c = usePalette();
  const [boards, setBoards] = useState<Pick<Board, 'id' | 'name'>[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyBoards(supabase).then(setBoards, (e) => setError(errorText(e)));
  }, [errorText]);

  async function toggle(boardId: string) {
    const on = onBoards.includes(boardId);
    const before = onBoards;
    onChange(on ? onBoards.filter((id) => id !== boardId) : [...onBoards, boardId]);
    setError(null);
    try {
      if (on) await removeScrapFromBoard(supabase, scrapId, boardId);
      else await addScrapToBoard(supabase, scrapId, boardId);
    } catch (e) {
      onChange(before);
      setError(errorText(e));
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const board = await createBoard(supabase, draft);
      setBoards((prev) => [...(prev ?? []), board]);
      setDraft('');
      await addScrapToBoard(supabase, scrapId, board.id);
      onChange([...onBoards, board.id]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={{ color: c.text, fontWeight: '700' }}>{t('addToBoard')}</Text>
      {boards && boards.length > 0 ? (
        <>
          <Body small muted>{t('addToBoardHint')}</Body>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {boards.map((b) => {
              const on = onBoards.includes(b.id);
              return <Chip key={b.id} label={`${on ? '✓ ' : ''}${b.name}`} selected={on} onPress={() => toggle(b.id)} />;
            })}
          </View>
        </>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Field
            value={draft}
            onChangeText={setDraft}
            placeholder={t('newBoard')}
            maxLength={80}
            onSubmitEditing={() => draft.trim() && create()}
            accessibilityLabel={t('newBoard')}
          />
        </View>
        <Button kind="secondary" title={t('create')} onPress={create} busy={busy} disabled={!draft.trim()} />
      </View>
      <Message text={error} />
    </Card>
  );
}

function CategoryCard({
  scrap,
  onChange,
  onError,
}: {
  scrap: Scrap;
  onChange: (category: string | null, override: string | null) => void;
  onError: (e: unknown) => void;
}) {
  const { t, locale } = useI18n();
  const c = usePalette();
  const [editing, setEditing] = useState(false);
  const label = categoryLabel(scrap.category, locale);
  // Nothing to show or correct until the AI has picked one.
  if (!label && !editing) return null;

  async function pick(next: Category | null) {
    const prev = { category: scrap.category, override: scrap.user_category_override };
    onChange(next ?? scrap.item.category, next);
    setEditing(false);
    try {
      const saved = await setScrapCategory(supabase, scrap.id, next);
      onChange(saved, next);
    } catch (e) {
      onChange(prev.category, prev.override);
      onError(e);
    }
  }

  return (
    <Card>
      <Text style={{ color: c.text, fontWeight: '700' }}>{t('category')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
        <Body>
          {categoryEmoji(scrap.category)} {label}
        </Body>
        <Text style={{ color: c.muted, fontSize: 12 }}>
          {scrap.user_category_override ? t('categoryByYou') : t('categoryByAi')}
        </Text>
        <Text accessibilityRole="button" onPress={() => setEditing(!editing)} style={{ color: c.accent, fontSize: 13 }}>
          {editing ? t('cancel') : t('changeCategory')}
        </Text>
      </View>
      {editing ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {CATEGORY_KEYS.map((key) => (
            <Chip
              key={key}
              label={`${categoryEmoji(key)} ${categoryLabel(key, locale)}`}
              selected={scrap.category === key}
              onPress={() => pick(key)}
            />
          ))}
          {scrap.user_category_override && scrap.item.category ? (
            <Chip label={t('resetCategory')} selected={false} onPress={() => pick(null)} />
          ) : null}
        </View>
      ) : null}
    </Card>
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
