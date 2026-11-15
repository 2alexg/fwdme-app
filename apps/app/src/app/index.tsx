import {
  categoryEmoji,
  categoryLabel,
  isProcessing,
  listMyScraps,
  myCategoryCounts,
  saveScrap,
  searchByMeaning,
  searchMyScraps,
  type Scrap,
} from '@fwdme/core';
import { Link, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { usePollWhile } from '@/lib/use-poll';
import {
  Body,
  Button,
  Card,
  Chip,
  Field,
  Message,
  Screen,
  NewScrapVisibilityPicker,
  space,
  usePalette,
  type VisibilityChoice,
} from '@/ui/components';
import { ScrapGrid } from '@/ui/scrap-grid';

const PAGE = 30;

export default function LibraryScreen() {
  const { session } = useSession();
  const { t } = useI18n();
  const c = usePalette();
  const userId = session!.user.id;
  const [scraps, setScraps] = useState<Scrap[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ category: string; scraps: number }[]>([]);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const { errorText } = useI18n();
  const loaded = useRef(0);
  // Only the newest request may update the list (typing fires many).
  const latest = useRef(0);

  // Search by meaning alongside the keyword search (needs a few letters).
  // Tagged with the search they answer, so older results never show for a newer search.
  const [similarFor, setSimilarFor] = useState<{ key: string; scraps: Scrap[] }>({ key: '', scraps: [] });
  const searchKey = `${query}\n${category ?? ''}`;
  const similar = similarFor.key === searchKey ? similarFor.scraps : [];
  useEffect(() => {
    let cancelled = false;
    if (query.length < 3) return;
    searchByMeaning(supabase, query, { category: category ?? undefined }).then(
      (found) => {
        if (!cancelled) setSimilarFor({ key: `${query}\n${category ?? ''}`, scraps: found });
      },
      () => {
        // Optional extra: keyword results still show.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [query, category]);

  // Search once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      loaded.current = 0;
      setQuery(typed.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const loadCounts = useCallback(async () => {
    try {
      setCounts(await myCategoryCounts(supabase));
    } catch {
      // Chips are a convenience; the list still works without them.
    }
  }, []);

  /** offset 0 reloads everything shown so far (at least one page). */
  const load = useCallback(
    async (offset = 0) => {
      const request = ++latest.current;
      try {
        let limit = offset === 0 ? Math.max(PAGE, loaded.current) : PAGE;
        const filter = { limit, offset, category: category ?? undefined };
        let page: Scrap[];
        if (query) {
          limit = filter.limit = Math.min(limit, 100); // the server's cap per search
          page = await searchMyScraps(supabase, query, filter);
        } else {
          page = await listMyScraps(supabase, userId, filter);
        }
        if (request !== latest.current) return;
        setScraps((prev) => {
          const next = offset === 0 ? page : [...(prev ?? []), ...page];
          loaded.current = next.length;
          return next;
        });
        setHasMore(page.length === limit);
        setLoadError(null);
      } catch (e) {
        setLoadError(errorText(e));
      }
    },
    [userId, errorText, category, query],
  );

  // Reload whenever the library comes back into view (after a delete, etc.).
  useFocusEffect(
    useCallback(() => {
      load(0);
      loadCounts();
    }, [load, loadCounts]),
  );

  // New links are organized in the background; refresh until they're done.
  const processing = !!scraps?.some(isProcessing);
  usePollWhile(processing, () => {
    load(0);
    loadCounts();
  });

  const shown = new Set(scraps?.map((s) => s.id));
  const similarOnly = similar.filter((s) => !shown.has(s.id));

  function pickCategory(next: string | null) {
    loaded.current = 0;
    setCategory(next);
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <Link href="/boards" style={{ paddingHorizontal: space.md }}>
                <Text style={{ color: c.accent, fontWeight: '600' }}>{t('boards')}</Text>
              </Link>
              <Link href="/settings" style={{ paddingHorizontal: space.md }}>
                <Text style={{ color: c.accent, fontWeight: '600' }}>{t('settings')}</Text>
              </Link>
            </View>
          ),
        }}
      />
      <Screen>
        <AddScrapForm
          onSaved={() => {
            load(0);
            loadCounts();
          }}
        />
        <SearchField value={typed} onChange={setTyped} />
        <CategoryChips counts={counts} value={category} onChange={pickCategory} />
        <Message text={loadError} />
        {scraps === null ? null : scraps.length === 0 ? (
          query && similarOnly.length > 0 ? null : (
            <Body muted>{query ? t('noSearchResults') : category ? t('emptyCategory') : t('emptyLibrary')}</Body>
          )
        ) : (
          <ScrapGrid scraps={scraps} />
        )}
        {hasMore ? <Button kind="secondary" title={t('loadMore')} onPress={() => load(scraps?.length ?? 0)} /> : null}
        {query && similarOnly.length > 0 ? (
          <>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{t('similarIdeas')}</Text>
            <ScrapGrid scraps={similarOnly} />
          </>
        ) : null}
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

function SearchField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const { t } = useI18n();
  const c = usePalette();
  return (
    <View style={{ justifyContent: 'center' }}>
      <Field
        value={value}
        onChangeText={onChange}
        placeholder={t('searchPlaceholder')}
        accessibilityLabel={t('search')}
        autoCorrect={false}
        returnKeyType="search"
        inputMode="search"
        style={{ paddingEnd: 44 }}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('clearSearch')}
          onPress={() => onChange('')}
          style={{ position: 'absolute', end: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: c.muted, fontSize: 16 }}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CategoryChips({
  counts,
  value,
  onChange,
}: {
  counts: { category: string; scraps: number }[];
  value: string | null;
  onChange: (category: string | null) => void;
}) {
  const { t, locale } = useI18n();
  if (counts.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
      <Chip label={t('allCategories')} selected={value === null} onPress={() => onChange(null)} />
      {counts.map((c) => (
        <Chip
          key={c.category}
          label={`${categoryEmoji(c.category)} ${categoryLabel(c.category, locale) ?? c.category} · ${c.scraps}`}
          selected={value === c.category}
          onPress={() => onChange(value === c.category ? null : c.category)}
        />
      ))}
    </ScrollView>
  );
}
