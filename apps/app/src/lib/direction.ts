// iOS/Android: right-to-left layout for Hebrew. React Native only changes the
// layout direction at start-up, so switching language reloads the app once.
import { reloadAppAsync } from 'expo';
import { I18nManager } from 'react-native';
import { authStorage } from '@/lib/storage';

const RELOADED_FOR = 'fwdme.directionReload';

export function applyDirection(rtl: boolean) {
  const want = rtl ? 'rtl' : 'ltr';
  try {
    if (I18nManager.isRTL === rtl) {
      authStorage.removeItem(RELOADED_FOR);
      return;
    }
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
    // Reload at most once per direction, so a build that can't switch never loops.
    if (authStorage.getItem(RELOADED_FOR) === want) return;
    authStorage.setItem(RELOADED_FOR, want);
  } catch {
    return;
  }
  reloadAppAsync('Switch text direction').catch(() => {
    // Takes effect on the next launch instead.
  });
}
