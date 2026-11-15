import { categoryEmoji, categoryLabel, hostnameOf, isProcessing, scrapImageUrl, scrapTitle, type Scrap } from '@fwdme/core';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { MAX_WIDTH, SOURCE_ICON, Thumbnail, VisibilityBadge, space, usePalette } from '@/ui/components';

/** Columns that fit the screen: 1 on phones, up to 3 on wide screens. */
export function useGridColumns() {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, MAX_WIDTH) - space.lg * 2;
  const columns = contentWidth >= 900 ? 3 : contentWidth >= 560 ? 2 : 1;
  return { columns, contentWidth, cardWidth: (contentWidth - space.lg * (columns - 1)) / columns };
}

export function ScrapGrid({ scraps }: { scraps: Scrap[] }) {
  const { cardWidth } = useGridColumns();
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
  const { t, locale } = useI18n();
  const firstComment = scrap.comments[0]?.body;
  const status = scrap.item.status;
  const category = categoryLabel(scrap.category, locale);
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
        <Thumbnail uri={scrapImageUrl(supabase, scrap)} source={scrap.item.source} />
        <View style={{ padding: space.md, gap: space.sm }}>
          {category ? (
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '600' }}>
              {categoryEmoji(scrap.category)} {category}
            </Text>
          ) : null}
          <Text numberOfLines={2} style={{ color: c.text, fontWeight: '700', fontSize: 16, textAlign: 'auto' }}>
            {scrapTitle(scrap, locale)}
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
            ) : isProcessing(scrap) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <ActivityIndicator size="small" color={c.muted} />
                <Text style={{ color: c.muted, fontSize: 12 }}>{t('processing')}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}
