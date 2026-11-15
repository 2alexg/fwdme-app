// Only iOS has a share extension that needs a share token; see share-token.ios.ts.
export async function syncShareToken(_userId: string | null, _locale: string): Promise<void> {}
export async function forgetShareToken(): Promise<void> {}
