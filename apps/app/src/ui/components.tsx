import type { Visibility } from '@fwdme/core';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n, type StringKey } from '@/lib/i18n';

// Fwd:Me greens. Every text/background pair meets WCAG AA (4.5:1) in both
// themes; the theme follows the phone's light/dark setting.
const light = {
  bg: '#f3f7f4',
  surface: '#ffffff',
  text: '#13201a',
  muted: '#5a6b61',
  border: '#d6e3da',
  accent: '#047857',
  accentText: '#ffffff',
  danger: '#b91c1c',
  success: '#15803d',
  chip: '#e6f0e9',
};
const dark: typeof light = {
  bg: '#0d1411',
  surface: '#15201a',
  text: '#e6f0ea',
  muted: '#98aa9f',
  border: '#28392f',
  accent: '#34d399',
  accentText: '#052e1f',
  danger: '#f87171',
  success: '#4ade80',
  chip: '#1d2b23',
};
export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const MAX_WIDTH = 1080;

/**
 * The page layout for every screen. Android draws the app edge to edge, under
 * the status bar and the navigation bar, so the content keeps clear of both:
 * the bottom inset always, the top one when the screen has no header bar
 * (`noHeader`; the header already sits below the status bar).
 */
export function Screen({ children, narrow, noHeader }: { children: ReactNode; narrow?: boolean; noHeader?: boolean }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: space.lg + (noHeader ? insets.top : 0),
        paddingBottom: space.lg + insets.bottom,
        paddingLeft: space.lg + insets.left,
        paddingRight: space.lg + insets.right,
        alignItems: 'center',
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: '100%', maxWidth: narrow ? 420 : MAX_WIDTH, gap: space.lg }}>{children}</View>
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = usePalette();
  return (
    <View
      style={[
        { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: space.lg, gap: space.md },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const c = usePalette();
  return <Text style={{ color: c.text, fontSize: 24, fontWeight: '700', textAlign: 'auto' }}>{children}</Text>;
}

const LOGO = { light: require('../../assets/logo.png'), dark: require('../../assets/logo-dark.png') };

/** The Fwd:Me symbol above the app name, for the sign-in / sign-up screens. */
export function Brand() {
  const { t } = useI18n();
  const c = usePalette();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <View style={{ alignItems: 'center', gap: space.sm, paddingTop: space.xl }}>
      <Image source={LOGO[scheme]} style={{ width: 88, height: 88 }} accessibilityIgnoresInvertColors />
      <Text style={{ color: c.text, fontSize: 28, fontWeight: '800' }}>{t('appName')}</Text>
    </View>
  );
}

export function Body({ children, muted, small }: { children: ReactNode; muted?: boolean; small?: boolean }) {
  const c = usePalette();
  return (
    <Text style={{ color: muted ? c.muted : c.text, fontSize: small ? 13 : 15, lineHeight: small ? 18 : 22, textAlign: 'auto' }}>
      {children}
    </Text>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label?: string; hint?: string }) {
  const c = usePalette();
  const { isRTL } = useI18n();
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Text style={{ color: c.text, fontWeight: '600', fontSize: 14 }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[
          styles.input,
          { color: c.text, borderColor: c.border, backgroundColor: c.surface, textAlign: isRTL ? 'right' : 'left' },
          props.multiline && { minHeight: 72, textAlignVertical: 'top' },
          props.style,
        ]}
      />
      {hint ? <Body small muted>{hint}</Body> : null}
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  busy,
  disabled,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'link';
  busy?: boolean;
  disabled?: boolean;
}) {
  const c = usePalette();
  const bg = kind === 'primary' ? c.accent : 'transparent';
  const fg = kind === 'primary' ? c.accentText : kind === 'danger' ? c.danger : kind === 'link' ? c.accent : c.text;
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        kind === 'link' ? styles.link : styles.button,
        { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.8 : 1 },
        kind !== 'primary' && kind !== 'link' && { borderColor: kind === 'danger' ? c.danger : c.border, borderWidth: 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Message({ text, tone = 'error' }: { text: string | null; tone?: 'error' | 'success' }) {
  const c = usePalette();
  if (!text) return null;
  return (
    <Text accessibilityRole="alert" style={{ color: tone === 'error' ? c.danger : c.success, fontSize: 14 }}>
      {text}
    </Text>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            aria-checked={on}
            onPress={() => onChange(o.value)}
            style={[styles.chip, { backgroundColor: on ? c.accent : c.chip, borderColor: on ? c.accent : c.border }]}
          >
            <Text style={{ color: on ? c.accentText : c.text, fontSize: 13, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      aria-selected={selected}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? c.accent : c.chip, borderColor: selected ? c.accent : c.border }]}
    >
      <Text style={{ color: selected ? c.accentText : c.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export const SOURCE_ICON: Record<string, string> = {
  youtube: '▶️',
  tiktok: '🎵',
  instagram: '📷',
  facebook: '👍',
  x: '𝕏',
  web: '🔗',
};

/** Preview image, or the source's icon when there is none or it fails to load. */
export function Thumbnail({ uri, source, rounded }: { uri: string | null; source: string; rounded?: boolean }) {
  const c = usePalette();
  // Remember which URL failed, so a new URL gets a fresh try.
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const broken = brokenUri !== null && brokenUri === uri;
  const style = { width: '100%' as const, aspectRatio: 16 / 9, borderRadius: rounded ? 8 : 0 };
  if (uri && !broken) {
    return <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setBrokenUri(uri)} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[style, { backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontSize: 32 }}>{SOURCE_ICON[source] ?? '🔗'}</Text>
    </View>
  );
}

export type VisibilityChoice = Visibility | 'default';

const VISIBILITY_LABELS: [Visibility, StringKey][] = [
  ['private', 'vis_private'],
  ['followers', 'vis_followers'],
  ['public', 'vis_public'],
];

/** For a new scrap: includes "Account default", resolved when it is saved. */
export function NewScrapVisibilityPicker({ value, onChange }: { value: VisibilityChoice; onChange: (v: VisibilityChoice) => void }) {
  const { t } = useI18n();
  const keys: [VisibilityChoice, StringKey][] = [['default', 'vis_default'], ...VISIBILITY_LABELS];
  return <Segmented value={value} onChange={onChange} options={keys.map(([v, k]) => ({ value: v, label: t(k) }))} />;
}

/** For a saved scrap, which always has its own setting. */
export function VisibilityPicker({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  const { t } = useI18n();
  return <Segmented value={value} onChange={onChange} options={VISIBILITY_LABELS.map(([v, k]) => ({ value: v, label: t(k) }))} />;
}

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const c = usePalette();
  const { t } = useI18n();
  const icon = visibility === 'public' ? '🌐' : visibility === 'followers' ? '👥' : '🔒';
  return (
    <View style={[styles.badge, { backgroundColor: c.chip }]}>
      <Text style={{ color: c.muted, fontSize: 12 }}>
        {icon} {t(`vis_${visibility}`)}
      </Text>
    </View>
  );
}

export function Loading() {
  const c = usePalette();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, padding: space.xxl }}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 15 },
  button: { borderRadius: 8, paddingHorizontal: space.lg, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  link: { paddingVertical: space.sm, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: space.md, paddingVertical: 6 },
  badge: { borderRadius: 999, paddingHorizontal: space.sm, paddingVertical: 2, alignSelf: 'flex-start' },
});
