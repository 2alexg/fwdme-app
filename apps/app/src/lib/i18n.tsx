import { ApiError, InvalidUrlError, type Locale } from '@scrapbook/core';
import { getLocales } from 'expo-localization';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

const en = {
  appName: 'Scrapbook',
  // auth
  signIn: 'Sign in',
  signUp: 'Create account',
  signOut: 'Sign out',
  email: 'Email',
  password: 'Password',
  username: 'Username',
  usernameHint: '3–30 characters: a–z, 0–9 or _. Always public.',
  passwordHint: 'At least 8 characters.',
  noAccount: 'New here? Create an account',
  haveAccount: 'Already have an account? Sign in',
  checkEmail: 'Check your email to confirm your account, then sign in.',
  // library
  library: 'Library',
  pasteLink: 'Paste a link…',
  addComment: 'Why are you saving it? (optional)',
  save: 'Save',
  saved: 'Saved',
  alreadySaved: 'Already in your library — your comment was added.',
  emptyLibrary: 'Nothing saved yet. Paste a link above to start your scrapbook.',
  loadMore: 'Load more',
  processing: 'Organizing…',
  failed: "Couldn't read this link",
  // scrap
  openOriginal: 'Open original',
  comments: 'Your comments',
  noComments: 'No comments yet.',
  addCommentPlaceholder: 'Add a comment…',
  add: 'Add',
  edit: 'Edit',
  edited: 'edited',
  cancel: 'Cancel',
  delete: 'Delete',
  deleteScrap: 'Delete scrap',
  confirmDeleteScrap: 'Delete this scrap and its comments?',
  notFound: "This scrap doesn't exist or isn't visible to you.",
  summaryPending: 'An AI summary and tags will appear here once organizing is switched on.',
  back: 'Back',
  // visibility
  visibility: 'Who can see this',
  vis_default: 'Account default',
  vis_private: 'Only me',
  vis_followers: 'Followers',
  vis_public: 'Public',
  // settings
  settings: 'Settings',
  account: 'Account',
  accountType: 'Account type',
  accountPublic: 'Public — new scraps are public unless you change them',
  accountPrivate: 'Private — new scraps are only visible to you',
  accountTypeNote: 'Scraps set to "Account default" follow this setting, including ones you already saved.',
  language: 'Language',
  saveChanges: 'Save changes',
  changesSaved: 'Saved',
  // errors
  err_generic: 'Something went wrong. Please try again.',
  err_invalid_url: "That doesn't look like a web link.",
  err_invalid_username: 'Usernames are 3–30 characters: a–z, 0–9 or _.',
  err_username_taken: 'That username is taken.',
  err_weak_password: 'Use at least 8 characters.',
  err_invalid_credentials: 'Wrong email or password.',
  err_email_taken: 'An account with this email already exists.',
  err_empty_comment: 'Write something first.',
};

export type StringKey = keyof typeof en;

const he: Record<StringKey, string> = {
  appName: 'Scrapbook',
  signIn: 'התחברות',
  signUp: 'יצירת חשבון',
  signOut: 'התנתקות',
  email: 'אימייל',
  password: 'סיסמה',
  username: 'שם משתמש',
  usernameHint: '3–30 תווים: a–z, 0–9 או _. תמיד ציבורי.',
  passwordHint: 'לפחות 8 תווים.',
  noAccount: 'חדשים כאן? יצירת חשבון',
  haveAccount: 'כבר יש לך חשבון? התחברות',
  checkEmail: 'בדקו את האימייל כדי לאשר את החשבון, ואז התחברו.',
  library: 'הספרייה',
  pasteLink: 'הדביקו קישור…',
  addComment: 'למה שמרת את זה? (לא חובה)',
  save: 'שמירה',
  saved: 'נשמר',
  alreadySaved: 'כבר בספרייה שלך — ההערה נוספה.',
  emptyLibrary: 'עוד לא שמרת כלום. הדביקו קישור למעלה כדי להתחיל.',
  loadMore: 'עוד',
  processing: 'מסדר…',
  failed: 'לא הצלחנו לקרוא את הקישור',
  openOriginal: 'פתיחת המקור',
  comments: 'ההערות שלך',
  noComments: 'אין הערות עדיין.',
  addCommentPlaceholder: 'הוספת הערה…',
  add: 'הוספה',
  edit: 'עריכה',
  edited: 'נערך',
  cancel: 'ביטול',
  delete: 'מחיקה',
  deleteScrap: 'מחיקת הפריט',
  confirmDeleteScrap: 'למחוק את הפריט ואת ההערות שלו?',
  notFound: 'הפריט לא קיים או שאין לך הרשאה לראות אותו.',
  summaryPending: 'סיכום ותגיות של AI יופיעו כאן כשהסידור האוטומטי יופעל.',
  back: 'חזרה',
  visibility: 'מי יכול לראות',
  vis_default: 'ברירת המחדל של החשבון',
  vis_private: 'רק אני',
  vis_followers: 'עוקבים',
  vis_public: 'ציבורי',
  settings: 'הגדרות',
  account: 'חשבון',
  accountType: 'סוג חשבון',
  accountPublic: 'ציבורי — פריטים חדשים ציבוריים אלא אם תשנו',
  accountPrivate: 'פרטי — פריטים חדשים גלויים רק לך',
  accountTypeNote: 'פריטים שמוגדרים "ברירת המחדל של החשבון" עוקבים אחרי ההגדרה הזו, כולל פריטים שכבר נשמרו.',
  language: 'שפה',
  saveChanges: 'שמירת שינויים',
  changesSaved: 'נשמר',
  err_generic: 'משהו השתבש. נסו שוב.',
  err_invalid_url: 'זה לא נראה כמו קישור.',
  err_invalid_username: 'שם משתמש: 3–30 תווים, a–z, 0–9 או _.',
  err_username_taken: 'שם המשתמש תפוס.',
  err_weak_password: 'לפחות 8 תווים.',
  err_invalid_credentials: 'אימייל או סיסמה שגויים.',
  err_email_taken: 'כבר קיים חשבון עם האימייל הזה.',
  err_empty_comment: 'כתבו משהו קודם.',
};

const dictionaries: Record<Locale, Record<StringKey, string>> = { en, he };

export function deviceLocale(): Locale {
  const tag = getLocales()[0]?.languageCode;
  return tag === 'en' ? 'en' : 'he';
}

interface I18nState {
  locale: Locale;
  isRTL: boolean;
  t: (key: StringKey) => string;
  /** Turns any thrown error into a message in the current language. */
  errorText: (error: unknown) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nState | null>(null);

export function I18nProvider({ locale: preferred, children }: { locale?: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(preferred ?? deviceLocale());

  useEffect(() => {
    if (preferred) setLocale(preferred);
  }, [preferred]);

  const isRTL = locale === 'he';

  // Web: flip the whole document. Native RTL (I18nManager + reload) lands
  // with the Hebrew/RTL polish milestone.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    }
  }, [locale, isRTL]);

  const value = useMemo<I18nState>(() => {
    const dict = dictionaries[locale];
    const t = (key: StringKey) => dict[key];
    const errorText = (error: unknown) => {
      if (error instanceof InvalidUrlError) return t('err_invalid_url');
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof ApiError ? error.code : undefined;
      const known: Record<string, StringKey> = {
        invalid_username: 'err_invalid_username',
        username_taken: 'err_username_taken',
        weak_password: 'err_weak_password',
        empty_comment: 'err_empty_comment',
        invalid_credentials: 'err_invalid_credentials',
        user_already_exists: 'err_email_taken',
        'invalid url': 'err_invalid_url',
      };
      const key = known[message] ?? (code ? known[code] : undefined);
      return key ? t(key) : t('err_generic');
    };
    return { locale, isRTL, t, errorText, setLocale };
  }, [locale, isRTL]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
