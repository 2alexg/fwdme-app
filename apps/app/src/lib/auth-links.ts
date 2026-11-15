// Web: supabase-js reads the confirmation link itself (detectSessionInUrl).
export function useAuthLinks(_onExpired: () => void): void {}

/** Where the confirmation email sends people back to. */
export function emailRedirectUrl(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.origin;
}
