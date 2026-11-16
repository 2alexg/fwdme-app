import { boardCoverUrls, createBoard, listMyBoards, reorderBoards, type Board } from '@fwdme/core';
import { Link, Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { Body, Button, Card, Field, Message, Screen, Thumbnail, space, usePalette } from '@/ui/components';
import { useGridColumns } from '@/ui/scrap-grid';

export default function BoardsScreen() {
  const { t, errorText } = useI18n();
  const c = usePalette();
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    try {
      setBoards(await listMyBoards(supabase));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [errorText]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function move(index: number, by: -1 | 1) {
    if (!boards) return;
    const next = [...boards];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved!);
    setBoards(next);
    try {
      await reorderBoards(supabase, next.map((b) => b.id));
    } catch (e) {
      setError(errorText(e));
      load();
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            boards && boards.length > 1 ? (
              <Text
                accessibilityRole="button"
                onPress={() => setReordering(!reordering)}
                style={{ color: c.accent, fontWeight: '600', paddingHorizontal: space.md }}
              >
                {reordering ? t('done') : t('reorder')}
              </Text>
            ) : null,
        }}
      />
      <Screen>
        {reordering ? null : <NewBoardForm onCreated={(id) => router.push({ pathname: '/board/[id]', params: { id } })} />}
        <Message text={error} />
        {boards === null ? null : boards.length === 0 ? (
          <Body muted>{t('noBoards')}</Body>
        ) : reordering ? (
          <ReorderList boards={boards} onMove={move} />
        ) : (
          <BoardGrid boards={boards} />
        )}
      </Screen>
    </>
  );
}

function NewBoardForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { t, errorText } = useI18n();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const board = await createBoard(supabase, name);
      setName('');
      onCreated(board.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Field
        value={name}
        onChangeText={setName}
        placeholder={t('newBoardPlaceholder')}
        maxLength={80}
        onSubmitEditing={() => name.trim() && submit()}
        accessibilityLabel={t('newBoard')}
      />
      <Message text={error} />
      <Button title={t('create')} onPress={submit} busy={busy} disabled={!name.trim()} />
    </Card>
  );
}

function BoardGrid({ boards }: { boards: Board[] }) {
  const { contentWidth } = useGridColumns();
  // Boards are smaller than scrap cards: two per row on phones, up to four.
  const columns = contentWidth >= 900 ? 4 : contentWidth >= 560 ? 3 : 2;
  const width = (contentWidth - space.lg * (columns - 1)) / columns;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.lg }}>
      {boards.map((b) => (
        <View key={b.id} style={{ width }}>
          <BoardCard board={b} />
        </View>
      ))}
    </View>
  );
}

function BoardCard({ board }: { board: Board }) {
  const { plural } = useI18n();
  return (
    <Link href={{ pathname: '/board/[id]', params: { id: board.id } }} asChild>
      <Pressable
        className="overflow-hidden rounded-card border border-border/70 bg-surface"
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <View>
          <BoardCover board={board} />
          <View className="gap-0.5 p-3">
            <Text numberOfLines={2} className="text-[15px] font-bold leading-5 text-text" style={{ textAlign: 'auto' }}>
              {board.name}
            </Text>
            <Text className="text-[12px] text-muted">{plural('boardScraps', board.scraps)}</Text>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

/** One image, or a 2×2 collage once there are four. */
function BoardCover({ board }: { board: Board }) {
  const c = usePalette();
  const covers = boardCoverUrls(supabase, board);
  if (covers.length === 0) {
    return (
      <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 32 }}>📌</Text>
      </View>
    );
  }
  if (covers.length < 4) return <Thumbnail uri={covers[0]!.uri} source={covers[0]!.source} />;
  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9, flexDirection: 'row', flexWrap: 'wrap' }}>
      {covers.map((cover, i) => (
        <View key={i} style={{ width: '50%', height: '50%', overflow: 'hidden' }}>
          <Thumbnail uri={cover.uri} source={cover.source} />
        </View>
      ))}
    </View>
  );
}

function ReorderList({ boards, onMove }: { boards: Board[]; onMove: (index: number, by: -1 | 1) => void }) {
  const c = usePalette();
  const { t } = useI18n();
  return (
    <Card>
      {boards.map((b, i) => (
        <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Text style={{ color: c.text, fontSize: 15, flex: 1, textAlign: 'auto' }} numberOfLines={1}>
            {b.name}
          </Text>
          <ArrowButton label={t('moveUp')} glyph="↑" disabled={i === 0} onPress={() => onMove(i, -1)} />
          <ArrowButton label={t('moveDown')} glyph="↓" disabled={i === boards.length - 1} onPress={() => onMove(i, 1)} />
        </View>
      ))}
    </Card>
  );
}

function ArrowButton({ label, glyph, disabled, onPress }: { label: string; glyph: string; disabled: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: c.border, opacity: disabled ? 0.3 : 1 }}
    >
      <Text style={{ color: c.text, fontSize: 18 }}>{glyph}</Text>
    </Pressable>
  );
}
