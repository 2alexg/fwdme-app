// The library and the Search tab share this screen. The library browses
// everything (by category) and has the + button for saving a link; Search
// starts with an empty field and shows matches by words and by meaning.
import {
  categoryEmoji,
  categoryLabel,
  isProcessing,
  listMyScraps,
  myCategoryCounts,
  searchByMeaning,
  searchMyScraps,
  type Scrap,
} from '@fwdme/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { usePollWhile } from '@/lib/use-poll';
import { AddScrapButton } from '@/ui/add-scrap-sheet';
import { Body, Button, Chip, Message, Screen, space, useInputDirection, usePalette } from '@/ui/components';
import { ScrapGrid, ViewSwitcher, useScrapView } from '@/ui/scrap-grid';

const PAGE = 30;

export function LibraryView({ mode }: { mode: 'library' | 'search' }) {
  const searching = mode === 'search';
  const { session } = useSession();
  const { t } = useI18n();
  const userId = session!.user.id;
  const [view, setView] = useScrapView();
  const [scraps, setScraps] = useState<Scrap[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ category: string; scraps: number }[]>([]);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const { errorText } = useI18n();
  const [notice, setNotice] = useState<string | null>(null);
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
    // Each search by meaning is a paid API call: wait until typing has really stopped.
    const timer = setTimeout(() => {
      searchByMeaning(supabase, query, { category: category ?? undefined, limit: 8 }).then(
        (found) => {
          if (!cancelled) setSimilarFor({ key: `${query}\n${category ?? ''}`, scraps: found });
        },
        () => {
          // Optional extra: keyword results still show.
        },
      );
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
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
      if (searching && !query) {
        // Nothing typed yet: nothing to show.
        setScraps(null);
        setHasMore(false);
        return;
      }
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
    [userId, errorText, category, query, searching],
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

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const shown = new Set(scraps?.map((s) => s.id));
  const similarOnly = similar.filter((s) => !shown.has(s.id));

  function pickCategory(next: string | null) {
    loaded.current = 0;
    setCategory(next);
  }

  return (
    <View className="flex-1 bg-bg">
      <Screen tabbed>
        {searching ? <SearchField value={typed} onChange={setTyped} autoFocus /> : <SearchLink />}
        <Message text={notice} tone="success" />
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <CategoryChips counts={counts} value={category} onChange={pickCategory} />
          </View>
          <ViewSwitcher value={view} onChange={setView} />
        </View>
        <Message text={loadError} />
        {scraps === null ? (
          searching && !query ? <Body muted>{t('searchHint')}</Body> : null
        ) : scraps.length === 0 ? (
          query && similarOnly.length > 0 ? null : (
            <Body muted>{query ? t('noSearchResults') : category ? t('emptyCategory') : t('emptyLibrary')}</Body>
          )
        ) : (
          <ScrapGrid scraps={scraps} view={view} />
        )}
        {hasMore ? <Button kind="secondary" title={t('loadMore')} onPress={() => load(scraps?.length ?? 0)} /> : null}
        {query && similarOnly.length > 0 ? (
          <>
            <Text className="mt-2 text-[17px] font-bold text-text">{t('similarIdeas')}</Text>
            <ScrapGrid scraps={similarOnly} view={view} />
          </>
        ) : null}
        {/* Room to scroll the last cards out from under the + button. */}
        {searching ? null : <View style={{ height: 64 }} />}
      </Screen>
      {searching ? null : (
        <AddScrapButton
          onSaved={(alreadySaved) => {
            setNotice(alreadySaved ? t('alreadySaved') : t('saved'));
            load(0);
            loadCounts();
          }}
        />
      )}
    </View>
  );
}

/** On the library: looks like the search field, opens the Search tab. */
function SearchLink() {
  const { t } = useI18n();
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={t('search')}
      onPress={() => router.navigate('/search')}
      className="min-h-[48px] flex-row items-center gap-2 rounded-xl border border-border/70 bg-surface px-3.5"
    >
      <Search size={18} color={c.muted} strokeWidth={2.2} />
      <Text className="flex-1 py-3 text-[15px] text-muted">{t('searchPlaceholder')}</Text>
    </Pressable>
  );
}

function SearchField({ value, onChange, autoFocus }: { value: string; onChange: (text: string) => void; autoFocus?: boolean }) {
  const { t } = useI18n();
  const c = usePalette();
  const direction = useInputDirection(value);
  return (
    <View className="min-h-[48px] flex-row items-center gap-2 rounded-xl border border-border/70 bg-surface px-3.5">
      <Search size={18} color={c.muted} strokeWidth={2.2} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t('searchPlaceholder')}
        placeholderTextColor={c.muted}
        accessibilityLabel={t('search')}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        inputMode="search"
        className="flex-1 py-3 text-[15px] text-text"
        style={direction}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('clearSearch')}
          onPress={() => onChange('')}
          className="h-8 w-8 items-center justify-center rounded-full bg-surface-2"
        >
          <X size={16} color={c.muted} strokeWidth={2.4} />
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
