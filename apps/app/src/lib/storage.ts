// Web: the browser's localStorage. Guarded so a server/static render
// (no window) never crashes; sessions simply start empty there.
const memory = new Map<string, string>();

export const authStorage = {
  getItem: (key: string) =>
    typeof window === 'undefined' ? memory.get(key) ?? null : window.localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') memory.set(key, value);
    else window.localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') memory.delete(key);
    else window.localStorage.removeItem(key);
  },
};
