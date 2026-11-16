// The four main screens, one tap apart on the tab bar. Scraps and boards open
// on top of the tabs (see the root layout).
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { House, LayoutDashboard, Search, Settings, type LucideIcon } from 'lucide-react-native';
import { useI18n } from '@/lib/i18n';
import { usePalette } from '@/ui/components';

function icon(Icon: LucideIcon) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon size={23} color={color as string} strokeWidth={focused ? 2.4 : 2} />;
  };
}

export default function TabsLayout() {
  const { t } = useI18n();
  const c = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: c.bg },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('library'), tabBarIcon: icon(House) }} />
      <Tabs.Screen name="boards" options={{ title: t('boards'), tabBarIcon: icon(LayoutDashboard) }} />
      <Tabs.Screen name="search" options={{ title: t('search'), tabBarIcon: icon(Search) }} />
      <Tabs.Screen name="settings" options={{ title: t('settings'), tabBarIcon: icon(Settings) }} />
    </Tabs>
  );
}
