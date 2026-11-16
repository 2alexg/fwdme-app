// The app's building blocks, styled with NativeWind (Tailwind classes). Colours
// are theme tokens (global.css, tailwind.config.js) that follow the phone's
// light/dark setting. usePalette() gives the same colours as plain values for
// the few places that need them outside className (icons, placeholders).
import type { Visibility } from '@fwdme/core';
import { Globe, Lock, Users, type LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n, type StringKey } from '@/lib/i18n';

// Same values as the CSS variables in global.css.
const light = {
  bg: '#f3f7f4',
  surface: '#ffffff',
  surface2: '#ecf3ee',
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
  surface2: '#1b2821',
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
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{
        paddingTop: space.lg + (noHeader ? insets.top : 0),
        paddingBottom: space.xl + insets.bottom,
        paddingLeft: space.lg + insets.left,
        paddingRight: space.lg + insets.right,
        alignItems: 'center',
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full gap-4" style={{ maxWidth: narrow ? 440 : MAX_WIDTH }}>
        {children}
      </View>
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View className="gap-3 rounded-card border border-border/70 bg-surface p-4" style={style}>
      {children}
    </View>
  );
}

/** A card's heading: small, bold, with an optional icon. */
export function CardTitle({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  const c = usePalette();
  return (
    <View className="flex-row items-center gap-2">
      {Icon ? <Icon size={17} color={c.muted} strokeWidth={2.2} /> : null}
      <Text className="text-[15px] font-bold text-text">{children}</Text>
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text className="text-[26px] font-extrabold leading-8 tracking-tight text-text" style={{ textAlign: 'auto' }}>{children}</Text>;
}

const LOGO = { light: require('../../assets/logo.png'), dark: require('../../assets/logo-dark.png') };

/** The Fwd:Me symbol above the app name, for the sign-in / sign-up screens. */
export function Brand() {
  const { t } = useI18n();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <View className="items-center gap-2 pt-6">
      <Image source={LOGO[scheme]} style={{ width: 88, height: 88 }} accessibilityIgnoresInvertColors />
      <Text className="text-[30px] font-extrabold tracking-tight text-text">{t('appName')}</Text>
    </View>
  );
}

export function Body({ children, muted, small }: { children: ReactNode; muted?: boolean; small?: boolean }) {
  return (
    <Text
      className={`${muted ? 'text-muted' : 'text-text'} ${small ? 'text-[13px] leading-[18px]' : 'text-[15px] leading-[22px]'}`}
      style={{ textAlign: 'auto' }}
    >
      {children}
    </Text>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label?: string; hint?: string }) {
  const c = usePalette();
  const { isRTL } = useI18n();
  const [focused, setFocused] = useState(false);
  return (
    <View className="gap-1.5">
      {label ? <Text className="text-[13px] font-semibold text-muted">{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        className={`rounded-xl border px-3.5 py-3 text-[15px] text-text ${focused ? 'border-accent bg-surface' : 'border-border/70 bg-surface-2'}`}
        style={[{ textAlign: isRTL ? 'right' : 'left' }, props.multiline && { minHeight: 84, textAlignVertical: 'top' }, props.style]}
      />
      {hint ? <Body small muted>{hint}</Body> : null}
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'link';
const BUTTON: Record<ButtonKind, { box: string; text: string }> = {
  primary: { box: 'bg-accent', text: 'text-accent-text' },
  secondary: { box: 'bg-surface-2 border border-border/70', text: 'text-text' },
  danger: { box: 'bg-danger/10', text: 'text-danger' },
  link: { box: '', text: 'text-accent' },
};

export function Button({
  title,
  onPress,
  kind = 'primary',
  busy,
  disabled,
  icon: Icon,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  busy?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
}) {
  const c = usePalette();
  const off = disabled || busy;
  const fg = kind === 'primary' ? c.accentText : kind === 'danger' ? c.danger : kind === 'link' ? c.accent : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      className={`min-h-[48px] flex-row items-center justify-center gap-2 rounded-xl px-4 ${kind === 'link' ? 'py-2' : 'py-3'} ${BUTTON[kind].box}`}
      style={({ pressed }) => ({ opacity: off ? 0.45 : pressed ? 0.75 : 1 })}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon ? <Icon size={18} color={fg} strokeWidth={2.2} /> : null}
          <Text className={`text-[15px] font-semibold ${BUTTON[kind].text}`}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Message({ text, tone = 'error' }: { text: string | null; tone?: 'error' | 'success' }) {
  if (!text) return null;
  return (
    <Text
      accessibilityRole="alert"
      className={`rounded-xl px-3 py-2 text-sm ${tone === 'error' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}
      style={{ textAlign: 'auto' }}
    >
      {text}
    </Text>
  );
}

/** iOS-style segmented control: one choice out of a few. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (value: T) => void;
}) {
  const c = usePalette();
  // Four or more choices don't fit on one line at phone width: drop the icons and allow two lines.
  const crowded = options.length > 3;
  return (
    <View className="flex-row rounded-xl bg-surface-2 p-1">
      {options.map((o) => {
        const on = o.value === value;
        const Icon = crowded ? undefined : o.icon;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            aria-checked={on}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            className={`min-h-[36px] flex-1 flex-row items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 ${on ? 'bg-surface' : ''}`}
            style={on ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : undefined}
          >
            {Icon ? <Icon size={15} color={on ? c.accent : c.muted} strokeWidth={2.2} /> : null}
            <Text
              numberOfLines={crowded ? 2 : 1}
              className={`text-center font-semibold ${crowded ? 'text-[12px] leading-[15px]' : 'text-[13px]'} ${on ? 'text-text' : 'text-muted'}`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      aria-selected={selected}
      onPress={onPress}
      className={`rounded-full border px-3.5 py-2 ${selected ? 'border-accent bg-accent' : 'border-border/70 bg-surface'}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      <Text className={`text-[13px] font-semibold ${selected ? 'text-accent-text' : 'text-text'}`}>{label}</Text>
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
export function Thumbnail({
  uri,
  source,
  rounded,
  aspectRatio = 16 / 9,
}: {
  uri: string | null;
  source: string;
  rounded?: boolean;
  aspectRatio?: number;
}) {
  // Remember which URL failed, so a new URL gets a fresh try.
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const broken = brokenUri !== null && brokenUri === uri;
  const style = { width: '100%' as const, aspectRatio, borderRadius: rounded ? 12 : 0 };
  if (uri && !broken) {
    return <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setBrokenUri(uri)} accessibilityIgnoresInvertColors />;
  }
  return (
    <View className="items-center justify-center bg-surface-2" style={style}>
      <Text style={{ fontSize: 28, opacity: 0.8 }}>{SOURCE_ICON[source] ?? '🔗'}</Text>
    </View>
  );
}

export type VisibilityChoice = Visibility | 'default';

const VISIBILITY: { value: Visibility; key: StringKey; icon: LucideIcon }[] = [
  { value: 'private', key: 'vis_private', icon: Lock },
  { value: 'followers', key: 'vis_followers', icon: Users },
  { value: 'public', key: 'vis_public', icon: Globe },
];

/** For a new scrap: includes "Account default", resolved when it is saved. */
export function NewScrapVisibilityPicker({ value, onChange }: { value: VisibilityChoice; onChange: (v: VisibilityChoice) => void }) {
  const { t } = useI18n();
  const options = [
    { value: 'default' as VisibilityChoice, label: t('vis_default') },
    ...VISIBILITY.map((v) => ({ value: v.value as VisibilityChoice, label: t(v.key), icon: v.icon })),
  ];
  return <Segmented value={value} onChange={onChange} options={options} />;
}

/** For a saved scrap, which always has its own setting. */
export function VisibilityPicker({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  const { t } = useI18n();
  return <Segmented value={value} onChange={onChange} options={VISIBILITY.map((v) => ({ value: v.value, label: t(v.key), icon: v.icon }))} />;
}

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const c = usePalette();
  const { t } = useI18n();
  const Icon = VISIBILITY.find((v) => v.value === visibility)?.icon ?? Lock;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={t(`vis_${visibility}`)}
      className="flex-row items-center gap-1 self-start rounded-full bg-chip px-2 py-0.5"
    >
      <Icon size={11} color={c.muted} strokeWidth={2.4} />
      <Text className="text-[11px] font-medium text-muted">{t(`vis_${visibility}`)}</Text>
    </View>
  );
}

/** Just the lock / people / globe, for a corner of an image (labelled for screen readers). */
export function VisibilityIcon({ visibility }: { visibility: Visibility }) {
  const { t } = useI18n();
  const Icon = VISIBILITY.find((v) => v.value === visibility)?.icon ?? Lock;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={t(`vis_${visibility}`)}
      className="h-7 w-7 items-center justify-center rounded-full bg-black/45"
    >
      <Icon size={14} color="#ffffff" strokeWidth={2.4} />
    </View>
  );
}

export function Loading() {
  const c = usePalette();
  return (
    <View className="flex-1 items-center justify-center bg-bg p-8">
      <ActivityIndicator color={c.accent} />
    </View>
  );
}
