// Scraps in three layouts the user picks with the view switcher: a grid of
// image-first cards, one wide card per row, or a compact list. The choice is
// remembered on the device (library and boards share it).
import { categoryEmoji, categoryLabel, hostnameOf, isProcessing, scrapImageUrl, scrapTitle, type Scrap } from '@fwdme/core';
import { Link } from 'expo-router';
import { LayoutGrid, List, Rows3, type LucideIcon } from 'lucide-react-native';
import { useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useI18n, type StringKey } from '@/lib/i18n';
import { authStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { MAX_WIDTH, SOURCE_ICON, Thumbnail, VisibilityBadge, VisibilityIcon, space, usePalette } from '@/ui/components';

export type ScrapView = 'grid' | 'cards' | 'list';
const VIEWS: { value: ScrapView; icon: LucideIcon; label: StringKey }[] = [
  { value: 'grid', icon: LayoutGrid, label: 'view_grid' },
  { value: 'cards', icon: Rows3, label: 'view_cards' },
  { value: 'list', icon: List, label: 'view_list' },
];
const VIEW_KEY = 'fwdme.scrapView';

function readView(): ScrapView {
  try {
    const stored = authStorage.getItem(VIEW_KEY);
    if (stored === 'grid' || stored === 'cards' || stored === 'list') return stored;
  } catch {
    // Storage unavailable: use the default.
  }
  return 'grid';
}

// One choice for every screen (the tabs stay mounted, so they all listen).
let currentView: ScrapView | null = null;
const viewListeners = new Set<() => void>();

function setScrapView(next: ScrapView) {
  currentView = next;
  try {
    authStorage.setItem(VIEW_KEY, next);
  } catch {
    // Not remembered this time; still switches.
  }
  viewListeners.forEach((listener) => listener());
}

function subscribeView(listener: () => void) {
  viewListeners.add(listener);
  return () => viewListeners.delete(listener);
}

/** The chosen layout, remembered on this device and shared by all screens. */
export function useScrapView(): [ScrapView, (view: ScrapView) => void] {
  const view = useSyncExternalStore(subscribeView, () => (currentView ??= readView()));
  return [view, setScrapView];
}

/** Three icon buttons: grid, wide cards, list. */
export function ViewSwitcher({ value, onChange }: { value: ScrapView; onChange: (view: ScrapView) => void }) {
  const c = usePalette();
  const { t } = useI18n();
  return (
    <View className="flex-row rounded-xl bg-surface-2 p-1" accessibilityRole="radiogroup">
      {VIEWS.map(({ value: v, icon: Icon, label }) => {
        const on = v === value;
        return (
          <Pressable
            key={v}
            accessibilityRole="radio"
            aria-checked={on}
            accessibilityLabel={t(label)}
            onPress={() => onChange(v)}
            className={`h-9 w-10 items-center justify-center rounded-lg ${on ? 'bg-surface' : ''}`}
            style={on ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : undefined}
          >
            <Icon size={18} color={on ? c.accent : c.muted} strokeWidth={2.2} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Content width and how many columns fit (1 on phones, up to 3 on wide screens). */
export function useGridColumns() {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, MAX_WIDTH) - space.lg * 2;
  const columns = contentWidth >= 900 ? 3 : contentWidth >= 560 ? 2 : 1;
  return { columns, contentWidth, cardWidth: (contentWidth - space.lg * (columns - 1)) / columns };
}

function columnsFor(view: ScrapView, contentWidth: number): number {
  if (view === 'grid') return contentWidth >= 900 ? 4 : contentWidth >= 560 ? 3 : 2;
  if (view === 'cards') return contentWidth >= 900 ? 3 : contentWidth >= 560 ? 2 : 1;
  return contentWidth >= 900 ? 2 : 1;
}

export function ScrapGrid({ scraps, view = 'grid' }: { scraps: Scrap[]; view?: ScrapView }) {
  const { contentWidth } = useGridColumns();
  const columns = columnsFor(view, contentWidth);
  const gap = view === 'list' ? space.sm : view === 'grid' ? space.md : space.lg;
  const width = (contentWidth - gap * (columns - 1)) / columns;
  const Item = view === 'grid' ? GridCard : view === 'cards' ? WideCard : ListRow;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {scraps.map((s) => (
        <View key={s.id} style={{ width }}>
          <Item scrap={s} />
        </View>
      ))}
    </View>
  );
}

/** A compact list (small image + title), for "related" suggestions. */
export function ScrapList({ scraps }: { scraps: Scrap[] }) {
  return (
    <View style={{ gap: space.sm }}>
      {scraps.map((s) => (
        <ListRow key={s.id} scrap={s} flat />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The three cards
// ---------------------------------------------------------------------------

function ScrapLink({ scrap, children, className }: { scrap: Scrap; children: ReactNode; className?: string }) {
  return (
    <Link href={{ pathname: '/scrap/[id]', params: { id: scrap.id } }} asChild>
      <Pressable className={className} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        {/* Layout lives on an inner view: on web the link wrapper drops flexDirection. */}
        {children}
      </Pressable>
    </Link>
  );
}

function CategoryLine({ scrap }: { scrap: Scrap }) {
  const { locale } = useI18n();
  const label = categoryLabel(scrap.category, locale);
  if (!label) return null;
  return (
    <Text numberOfLines={1} className="text-[12px] font-semibold text-accent">
      {categoryEmoji(scrap.category)} {label}
    </Text>
  );
}

/** "Organizing…" or "Couldn't read this link", when either applies. */
function Status({ scrap }: { scrap: Scrap }) {
  const c = usePalette();
  const { t } = useI18n();
  if (scrap.item.status === 'failed') return <Text className="text-[12px] text-danger">{t('failed')}</Text>;
  if (!isProcessing(scrap)) return null;
  return (
    <View className="flex-row items-center gap-1">
      <ActivityIndicator size="small" color={c.muted} />
      <Text className="text-[12px] text-muted">{t('processing')}</Text>
    </View>
  );
}

function Source({ scrap }: { scrap: Scrap }) {
  return (
    <Text numberOfLines={1} className="shrink text-[12px] text-muted">
      {SOURCE_ICON[scrap.item.source] ?? '🔗'} {hostnameOf(scrap.original_url)}
    </Text>
  );
}

/** Grid: image first, then category, title and the owner's first comment. */
function GridCard({ scrap }: { scrap: Scrap }) {
  const { locale } = useI18n();
  const firstComment = scrap.comments[0]?.body;
  return (
    <ScrapLink scrap={scrap} className="overflow-hidden rounded-card border border-border/70 bg-surface">
      <View>
        <View>
          <Thumbnail uri={scrapImageUrl(supabase, scrap)} source={scrap.item.source} aspectRatio={1} />
          <View className="absolute end-2 top-2">
            <VisibilityIcon visibility={scrap.visibility} />
          </View>
        </View>
        <View className="gap-1 p-3">
          <CategoryLine scrap={scrap} />
          <Text numberOfLines={2} className="text-[14px] font-bold leading-[19px] text-text" style={{ textAlign: 'auto' }}>
            {scrapTitle(scrap, locale)}
          </Text>
          {firstComment ? (
            <Text numberOfLines={2} className="text-[12px] leading-4 text-muted" style={{ textAlign: 'auto' }}>
              “{firstComment}”
            </Text>
          ) : null}
          <Status scrap={scrap} />
        </View>
      </View>
    </ScrapLink>
  );
}

/** Wide card: big image, title, the owner's first comment, source and visibility. */
function WideCard({ scrap }: { scrap: Scrap }) {
  const { locale } = useI18n();
  const firstComment = scrap.comments[0]?.body;
  return (
    <ScrapLink scrap={scrap} className="overflow-hidden rounded-card border border-border/70 bg-surface">
      <View>
        <Thumbnail uri={scrapImageUrl(supabase, scrap)} source={scrap.item.source} />
        <View className="gap-2 p-4">
          <CategoryLine scrap={scrap} />
          <Text numberOfLines={2} className="text-[17px] font-bold leading-[22px] text-text" style={{ textAlign: 'auto' }}>
            {scrapTitle(scrap, locale)}
          </Text>
          {firstComment ? (
            <Text numberOfLines={3} className="text-[14px] leading-5 text-text/80" style={{ textAlign: 'auto' }}>
              “{firstComment}”
            </Text>
          ) : null}
          <View className="flex-row flex-wrap items-center gap-2">
            <Source scrap={scrap} />
            <VisibilityBadge visibility={scrap.visibility} />
            <Status scrap={scrap} />
          </View>
        </View>
      </View>
    </ScrapLink>
  );
}

/** Compact row: thumbnail beside title, category, source and the first comment. */
function ListRow({ scrap, flat }: { scrap: Scrap; flat?: boolean }) {
  const { locale } = useI18n();
  const firstComment = scrap.comments[0]?.body;
  return (
    <ScrapLink scrap={scrap} className={flat ? '' : 'rounded-2xl border border-border/70 bg-surface p-2'}>
      <View className="flex-row items-center gap-3">
        <View className="w-20 overflow-hidden rounded-xl">
          <Thumbnail uri={scrapImageUrl(supabase, scrap)} source={scrap.item.source} aspectRatio={1} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={2} className="text-[14px] font-bold leading-[19px] text-text" style={{ textAlign: 'auto' }}>
            {scrapTitle(scrap, locale)}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <CategoryLine scrap={scrap} />
            <Source scrap={scrap} />
          </View>
          {flat ? null : <VisibilityBadge visibility={scrap.visibility} />}
          {firstComment && !flat ? (
            <Text numberOfLines={1} className="text-[13px] text-muted" style={{ textAlign: 'auto' }}>
              “{firstComment}”
            </Text>
          ) : null}
          <Status scrap={scrap} />
        </View>
      </View>
    </ScrapLink>
  );
}
