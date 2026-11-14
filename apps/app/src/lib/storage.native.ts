// iOS/Android: an expo-sqlite-backed localStorage keeps the session across launches.
import 'expo-sqlite/localStorage/install';

export const authStorage = globalThis.localStorage;
