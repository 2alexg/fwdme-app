import {
  hostnameOf,
  listMyScraps,
  saveScrap,
  scrapTitle,
  type Scrap,
} from '@fwdme/core';
import { Link, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import {
  Body,
  Button,
  Card,
  Field,
  MAX_WIDTH,
  Message,
  Screen,
  VisibilityBadge,
  NewScrapVisibilityPicker,
  space,
  usePalette,
  type VisibilityChoice,
} from '@/ui/components';

const PAGE = 30;

const SOURCE_ICON: Record<string, string> = {
  youtube: '▶️',
  tiktok: '🎵',
  instagram: '📷',
  facebook: '👍',
  x: '𝕏',
  web: '🔗',
};

export default function LibraryScreen() {
  const { session } = useSession();
  const { t } = useI18n();
  const c = usePalette();
  const userId = session!.user.id;
  const [scraps, setScraps] = useState<Scrap[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { errorText } = useI18n();

  const load = useCallback(
    async (offset = 0) => {
      try {
        const page = await listMyScraps(supabase, userId, { limit: PAGE, offset });
        setScraps((prev) => (offset === 0 ? page : [...(prev ?? []), ...page]));
        setHasMore(page.length === PAGE);
        setLoadError(null);
      } catch (e) {
        setLoadError(errorText(e));
      }
    },
    [userId, errorText],
  );

  // Reload whenever the library comes back into view (after a delete, etc.).
  useFocusEffect(
    useCallback(() => {
      load(0);
    }, [load]),
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" style={{ paddingHorizontal: space.md }}>
              <Text style={{ color: c.accent, fontWeight: '600' }}>{t('settings')}</Text>
            </Link>
          ),
        }}
      />
      <Screen>
        <AddScrapForm onSaved={() => load(0)} />
        <Message text={loadError} />
        {scraps === null ? null : scraps.length === 0 ? (
          <Body muted>{t('emptyLibrary')}</Body>
        ) : (
          <ScrapGrid scraps={scraps} />
        )}
        {hasMore ? <Button kind="secondary" title={t('loadMore')} onPress={() => load(scraps?.length ?? 0)} /> : null}
      </Screen>
    </>
  );
}

function AddScrapForm({ onSaved }: { onSaved: () => void }) {
  const { t, errorText } = useI18n();
  const [link, setLink] = useState('');
  const [comment, setComment] = useState('');
  const [visibility, setVisibility] = useState<VisibilityChoice>('default');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await saveScrap(supabase, {
        input: link,
        comment,
        visibility: visibility === 'default' ? null : visibility,
      });
      setLink('');
      setComment('');
      setVisibility('default');
      setMessage({ text: result.alreadySaved ? t('alreadySaved') : t('saved'), tone: 'success' });
      onSaved();
    } catch (e) {
      setMessage({ text: errorText(e), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Field
        value={link}
        onChangeText={setLink}
        placeholder={t('pasteLink')}
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="url"
        keyboardType="url"
        onSubmitEditing={() => link.trim() && submit()}
        accessibilityLabel={t('pasteLink')}
      />
      <Field
        value={comment}
        onChangeText={setComment}
        placeholder={t('addComment')}
        multiline
        accessibilityLabel={t('addComment')}
      />
      <NewScrapVisibilityPicker value={visibility} onChange={setVisibility} />
      <Message text={message?.text ?? null} tone={message?.tone} />
      <Button title={t('save')} onPress={submit} busy={busy} disabled={!link.trim()} />
    </Card>
  );
}

function ScrapGrid({ scraps }: { scraps: Scrap[] }) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, MAX_WIDTH) - space.lg * 2;
  const columns = contentWidth >= 900 ? 3 : contentWidth >= 560 ? 2 : 1;
  const cardWidth = (contentWidth - space.lg * (columns - 1)) / columns;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.lg }}>
      {scraps.map((s) => (
        <View key={s.id} style={{ width: cardWidth }}>
          <ScrapCard scrap={s} />
        </View>
      ))}
    </View>
  );
}

function ScrapCard({ scrap }: { scrap: Scrap }) {
  const c = usePalette();
  const { t } = useI18n();
  const firstComment = scrap.comments[0]?.body;
  const status = scrap.item.status;
  return (
    <Link href={{ pathname: '/scrap/[id]', params: { id: scrap.id } }} asChild>
      <Pressable
        style={({ pressed }) => ({
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: 12,
          overflow: 'hidden',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {scrap.item.og_image ? (
          <Image source={{ uri: scrap.item.og_image }} style={{ width: '100%', aspectRatio: 16 / 9 }} resizeMode="cover" />
        ) : (
          <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 32 }}>{SOURCE_ICON[scrap.item.source] ?? '🔗'}</Text>
          </View>
        )}
        <View style={{ padding: space.md, gap: space.sm }}>
          <Text numberOfLines={2} style={{ color: c.text, fontWeight: '700', fontSize: 16, textAlign: 'auto' }}>
            {scrapTitle(scrap)}
          </Text>
          {firstComment ? (
            <Text numberOfLines={3} style={{ color: c.text, fontSize: 14, textAlign: 'auto' }}>
              {firstComment}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {SOURCE_ICON[scrap.item.source] ?? '🔗'} {hostnameOf(scrap.original_url)}
            </Text>
            <VisibilityBadge visibility={scrap.visibility} />
            {status === 'failed' ? (
              <Text style={{ color: c.danger, fontSize: 12 }}>{t('failed')}</Text>
            ) : status === 'fetching' || status === 'enriching' ? (
              <Text style={{ color: c.muted, fontSize: 12 }}>{t('processing')}</Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}
