import type { Locale } from '@fwdme/core';
import type { ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { POLICY_UPDATED, type LegalSection } from '@/lib/legal';
import { useSession } from '@/lib/session';
import { Brand, Screen, Segmented } from '@/ui/components';

// Legal text follows the page language, not its first letter: a Hebrew
// paragraph that starts with "Fwd:Me" is still right to left.
const DIRECTION = {
  he: { textAlign: 'right', writingDirection: 'rtl' },
  en: { textAlign: 'left', writingDirection: 'ltr' },
} as const;

/** A public page of headed sections (privacy policy, account deletion help). */
export function LegalPage({
  title,
  sections,
  children,
}: {
  title: string;
  sections: Record<Locale, LegalSection[]>;
  children?: ReactNode;
}) {
  const { locale, setLocale } = useI18n();
  const { session } = useSession();
  const lang: Locale = locale === 'en' ? 'en' : 'he';
  return (
    <Screen narrow>
      <Brand />
      {/* Visitors on the web pick a language; signed-in people use Settings. */}
      {Platform.OS === 'web' && !session ? (
        <Segmented
          value={lang}
          onChange={setLocale}
          options={[
            { value: 'he', label: 'עברית' },
            { value: 'en', label: 'English' },
          ]}
        />
      ) : null}
      {/* The header shows the title; the date says which version this is. */}
      <Text accessibilityLabel={title} className="text-[13px] text-muted" style={DIRECTION[lang]}>
        {POLICY_UPDATED[lang]}
      </Text>
      {sections[lang].map((s) => (
        <View key={s.heading} className="gap-2">
          <Text accessibilityRole="header" className="text-[17px] font-bold text-text" style={DIRECTION[lang]}>
            {s.heading}
          </Text>
          {s.paragraphs.map((p) => (
            <Text key={p} className="text-[15px] leading-[22px] text-text" style={DIRECTION[lang]}>
              {p}
            </Text>
          ))}
        </View>
      ))}
      {children}
    </Screen>
  );
}
