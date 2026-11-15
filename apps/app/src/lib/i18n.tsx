import { ApiError, InvalidUrlError, type Locale } from '@fwdme/core';
import { getLocales } from 'expo-localization';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

const en = {
  appName: 'Fwd:Me',
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
  emptyLibrary: 'Nothing saved yet. Paste a link above to get started.',
  loadMore: 'Load more',
  search: 'Search',
  searchPlaceholder: 'Search your library…',
  clearSearch: 'Clear search',
  noSearchResults: 'Nothing matches your search.',
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
  summaryProcessing: 'Reading the link and organizing it — this takes a few seconds.',
  failedHint: "We couldn't read this link. The site may be down or block previews.",
  emptyCategory: 'Nothing in this category yet.',
  allCategories: 'All',
  category: 'Category',
  categoryByAi: 'picked automatically',
  categoryByYou: 'set by you',
  changeCategory: 'Change',
  resetCategory: '↺ Automatic',
  back: 'Back',
  // boards
  boards: 'Boards',
  newBoard: 'New board',
  newBoardPlaceholder: 'Name a new board, e.g. "Vegan desserts"',
  create: 'Create',
  noBoards: 'No boards yet. Create one to group scraps your way.',
  boardEmpty: 'Nothing on this board yet. Open a scrap and add it here.',
  boardScraps_one: '1 scrap',
  boardScraps_other: '{n} scraps',
  addToBoard: 'Boards',
  addToBoardHint: 'Tap a board to add or remove this scrap.',
  reorder: 'Reorder',
  moveUp: 'Move up',
  moveDown: 'Move down',
  rename: 'Rename',
  deleteBoard: 'Delete board',
  confirmDeleteBoard: 'Delete this board? The scraps on it stay in your library.',
  boardNotFound: "This board doesn't exist.",
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
  accountPublic: 'Public — new scraps are public unless you choose otherwise',
  accountPrivate: 'Private — new scraps are only visible to you unless you choose otherwise',
  accountTypeNote: 'Changing this only affects scraps you save from now on.',
  suggestPublic_one: '1 of your saved scraps isn\'t public. Make all your scraps public too?',
  suggestPublic_other: '{n} of your saved scraps aren\'t public. Make all your scraps public too?',
  suggestPrivate_one: '1 of your saved scraps is visible to others. Make all your scraps private too?',
  suggestPrivate_other: '{n} of your saved scraps are visible to others. Make all your scraps private too?',
  makeAllPublic: 'Make all public',
  makeAllPrivate: 'Make all private',
  keepAsIs: 'Keep as they are',
  bulkDone_one: 'Done — 1 scrap updated.',
  bulkDone_other: 'Done — {n} scraps updated.',
  language: 'Language',
  saveChanges: 'Save changes',
  changesSaved: 'Saved',
  // share (from other apps)
  shareSaving: 'Saving…',
  shareSaved: 'Saved to Fwd:Me',
  shareAlreadySaved: 'Already in your library',
  shareNoLink: "There's no link in what you shared. Fwd:Me saves links for now.",
  shareAutoClose: 'Closing in a moment — tap to add a comment.',
  shareSignIn: 'Sign in to save what you shared.',
  done: 'Done',
  openInApp: 'Open in Fwd:Me',
  goToLibrary: 'Go to my library',
  retry: 'Try again',
  close: 'Close',
  // errors
  err_generic: 'Something went wrong. Please try again.',
  err_invalid_url: "That doesn't look like a web link.",
  err_invalid_username: 'Usernames are 3–30 characters: a–z, 0–9 or _.',
  err_username_taken: 'That username is taken.',
  err_weak_password: 'Use at least 8 characters.',
  err_invalid_credentials: 'Wrong email or password.',
  err_email_taken: 'An account with this email already exists.',
  err_empty_comment: 'Write something first.',
  err_board_name_taken: 'You already have a board with this name.',
  err_empty_board_name: 'Give the board a name.',
  err_board_name_too_long: 'Board names can be up to 80 characters.',
  err_link_expired: 'This email link has expired or was already used. Sign in with your email and password.',
};

export type StringKey = keyof typeof en;
type PluralBase = StringKey extends infer K ? (K extends `${infer B}_one` ? B : never) : never;

const he: Record<StringKey, string> = {
  appName: 'Fwd:Me',
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
  search: 'חיפוש',
  searchPlaceholder: 'חיפוש בספרייה…',
  clearSearch: 'ניקוי החיפוש',
  noSearchResults: 'לא נמצא שום דבר שמתאים לחיפוש.',
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
  summaryProcessing: 'קוראים את הקישור ומסדרים אותו — זה לוקח כמה שניות.',
  failedHint: 'לא הצלחנו לקרוא את הקישור. ייתכן שהאתר לא זמין או חוסם תצוגה מקדימה.',
  emptyCategory: 'אין עדיין פריטים בקטגוריה הזו.',
  allCategories: 'הכול',
  category: 'קטגוריה',
  categoryByAi: 'נבחרה אוטומטית',
  categoryByYou: 'נקבעה על ידך',
  changeCategory: 'שינוי',
  resetCategory: '↺ אוטומטי',
  back: 'חזרה',
  // boards
  boards: 'לוחות',
  newBoard: 'לוח חדש',
  newBoardPlaceholder: 'שם ללוח חדש, למשל "קינוחים טבעוניים"',
  create: 'יצירה',
  noBoards: 'עוד אין לוחות. צרו לוח כדי לקבץ פריטים בדרך שלכם.',
  boardEmpty: 'עוד אין כלום בלוח הזה. פתחו פריט והוסיפו אותו לכאן.',
  boardScraps_one: 'פריט אחד',
  boardScraps_other: '{n} פריטים',
  addToBoard: 'לוחות',
  addToBoardHint: 'הקישו על לוח כדי להוסיף אליו את הפריט או להסיר אותו.',
  reorder: 'סידור',
  moveUp: 'הזזה למעלה',
  moveDown: 'הזזה למטה',
  rename: 'שינוי שם',
  deleteBoard: 'מחיקת הלוח',
  confirmDeleteBoard: 'למחוק את הלוח? הפריטים שבו יישארו בספרייה שלכם.',
  boardNotFound: 'הלוח הזה לא קיים.',
  visibility: 'מי יכול לראות',
  vis_default: 'ברירת המחדל של החשבון',
  vis_private: 'רק אני',
  vis_followers: 'עוקבים',
  vis_public: 'ציבורי',
  settings: 'הגדרות',
  account: 'חשבון',
  accountType: 'סוג חשבון',
  accountPublic: 'ציבורי — פריטים חדשים יהיו ציבוריים, אלא אם תבחרו אחרת',
  accountPrivate: 'פרטי — פריטים חדשים יהיו גלויים רק לך, אלא אם תבחרו אחרת',
  accountTypeNote: 'השינוי חל רק על פריטים שתשמרו מעכשיו.',
  suggestPublic_one: 'פריט שמור אחד שלך אינו ציבורי. להפוך את כל הפריטים לציבוריים?',
  suggestPublic_other: '{n} מהפריטים השמורים שלך אינם ציבוריים. להפוך את כל הפריטים לציבוריים?',
  suggestPrivate_one: 'פריט שמור אחד שלך גלוי לאחרים. להפוך את כל הפריטים לפרטיים?',
  suggestPrivate_other: '{n} מהפריטים השמורים שלך גלויים לאחרים. להפוך את כל הפריטים לפרטיים?',
  makeAllPublic: 'להפוך הכול לציבורי',
  makeAllPrivate: 'להפוך הכול לפרטי',
  keepAsIs: 'להשאיר כמו שהם',
  bulkDone_one: 'בוצע — פריט אחד עודכן.',
  bulkDone_other: 'בוצע — {n} פריטים עודכנו.',
  language: 'שפה',
  saveChanges: 'שמירת שינויים',
  changesSaved: 'נשמר',
  shareSaving: 'שומר…',
  shareSaved: 'נשמר ב-Fwd:Me',
  shareAlreadySaved: 'כבר בספרייה שלך',
  shareNoLink: 'לא נמצא קישור במה ששיתפת. כרגע Fwd:Me שומר קישורים.',
  shareAutoClose: 'נסגר עוד רגע — הקישו כדי להוסיף הערה.',
  shareSignIn: 'התחברו כדי לשמור את מה ששיתפתם.',
  done: 'סיום',
  openInApp: 'פתיחה ב-Fwd:Me',
  goToLibrary: 'מעבר לספרייה שלי',
  retry: 'נסו שוב',
  close: 'סגירה',
  err_generic: 'משהו השתבש. נסו שוב.',
  err_invalid_url: 'זה לא נראה כמו קישור.',
  err_invalid_username: 'שם משתמש: 3–30 תווים, a–z, 0–9 או _.',
  err_username_taken: 'שם המשתמש תפוס.',
  err_weak_password: 'לפחות 8 תווים.',
  err_invalid_credentials: 'אימייל או סיסמה שגויים.',
  err_email_taken: 'כבר קיים חשבון עם האימייל הזה.',
  err_empty_comment: 'כתבו משהו קודם.',
  err_board_name_taken: 'כבר יש לכם לוח בשם הזה.',
  err_empty_board_name: 'תנו ללוח שם.',
  err_board_name_too_long: 'שם לוח יכול להיות עד 80 תווים.',
  err_link_expired: 'הקישור באימייל פג תוקף או שכבר נעשה בו שימוש. התחברו עם האימייל והסיסמה.',
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
  /** Picks `<base>_one` or `<base>_other` and fills in {n}. */
  plural: (base: PluralBase, n: number) => string;
  /** Turns any thrown error into a message in the current language. */
  errorText: (error: unknown) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nState | null>(null);

export function I18nProvider({ locale: preferred, children }: { locale?: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(preferred ?? deviceLocale());

  // The profile's language wins whenever it loads or changes.
  const [lastPreferred, setLastPreferred] = useState(preferred);
  if (preferred !== lastPreferred) {
    setLastPreferred(preferred);
    if (preferred) setLocale(preferred);
  }

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
    const plural = (base: PluralBase, n: number) =>
      t(`${base}_${n === 1 ? 'one' : 'other'}` as StringKey).replace('{n}', String(n));
    const errorText = (error: unknown) => {
      if (error instanceof InvalidUrlError) return t('err_invalid_url');
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof ApiError ? error.code : undefined;
      const known: Record<string, StringKey> = {
        invalid_username: 'err_invalid_username',
        username_taken: 'err_username_taken',
        weak_password: 'err_weak_password',
        empty_comment: 'err_empty_comment',
        board_name_taken: 'err_board_name_taken',
        empty_board_name: 'err_empty_board_name',
        board_name_too_long: 'err_board_name_too_long',
        invalid_credentials: 'err_invalid_credentials',
        user_already_exists: 'err_email_taken',
        'invalid url': 'err_invalid_url',
      };
      const key = known[message] ?? (code ? known[code] : undefined);
      return key ? t(key) : t('err_generic');
    };
    return { locale, isRTL, t, plural, errorText, setLocale };
  }, [locale, isRTL]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
