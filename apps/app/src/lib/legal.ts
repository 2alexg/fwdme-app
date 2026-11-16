// Public legal pages: the privacy policy (/privacy) and how to delete an
// account (/delete-account). The App Store and Google Play link to both.
// Keep this in step with the data the app actually collects.

/** Shown on the policy pages and the store listings. */
export const CONTACT_EMAIL = '[CONTACT EMAIL]';
/** The publisher, as on the Apple and Google developer accounts. */
export const PUBLISHER = '[YOUR NAME]';
export const POLICY_UPDATED = { en: 'November 16, 2026', he: '16 בנובמבר 2026' };

export type LegalSection = { heading: string; paragraphs: string[] };

const privacyEn: LegalSection[] = [
  {
    heading: 'Who we are',
    paragraphs: [
      `Fwd:Me is an app for saving and organizing links, published by ${PUBLISHER} ("we"). We are responsible for the personal data described here. Questions or requests: ${CONTACT_EMAIL}.`,
    ],
  },
  {
    heading: 'What we collect',
    paragraphs: [
      'Account: your email address, the username you choose (always public), your password (stored only as a secure hash by our database provider) and your language.',
      'What you save: the links you share or paste, any text shared along with a link, your notes, boards and visibility choices.',
      'Feedback you send from Settings, with the app version, platform, operating system version and language.',
      'Crash reports from the iOS and Android apps: what went wrong in the app, the device model and operating system version, and your account id (a random number). They do not include your email, username or IP address.',
      'We do not collect your location, contacts, photos or advertising ids, and we do not track you across other apps or websites.',
    ],
  },
  {
    heading: 'How we use it',
    paragraphs: [
      'Only to run Fwd:Me: to keep your account, save your links, organize them (titles, summaries, categories and tags), let you search them, answer your feedback and fix crashes. We do not show ads and we do not sell your data.',
      'Legal basis (where GDPR applies): performing our agreement with you for the app itself, and our legitimate interest in keeping it working for crash reports and feedback.',
    ],
  },
  {
    heading: 'Who processes it for us',
    paragraphs: [
      'Supabase stores accounts and everything you save, on servers in the European Union (Ireland).',
      'Anthropic receives the content of a saved page and any text shared with the link, to write its title, summary, category and tags.',
      'Voyage AI receives page text and the words you search with, for search by meaning.',
      'Sentry receives crash reports.',
      'They process the data only on our behalf. Some are based in the United States; transfers rely on their standard contractual clauses.',
    ],
  },
  {
    heading: 'Who can see your links',
    paragraphs: [
      'Your username is public. Your saved links are private unless you mark them as visible to followers or to everyone. You can change this for each link and for your whole account in Settings.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'As long as you have an account. When you delete your account, your profile, links, notes, boards and feedback are deleted right away. A saved page that nobody else saved is deleted too. Crash reports expire from Sentry automatically after its retention period.',
    ],
  },
  {
    heading: 'Your rights',
    paragraphs: [
      'You can see and edit your data in the app, and delete your account at any time in Settings → Delete account (see fwdme.expo.app/delete-account). You can also ask us for a copy of your data, to correct it or to delete it by writing to us. If you are in the EU, the UK or Israel, you may also complain to your data protection authority.',
    ],
  },
  {
    heading: 'Children',
    paragraphs: ['Fwd:Me is not meant for children under 13, and we do not knowingly collect their data.'],
  },
  {
    heading: 'Changes',
    paragraphs: ['If this policy changes, we will update it here and change the date at the top. For important changes we will tell you in the app.'],
  },
];

const privacyHe: LegalSection[] = [
  {
    heading: 'מי אנחנו',
    paragraphs: [
      `Fwd:Me היא אפליקציה לשמירה וסידור של קישורים, שמפרסם ${PUBLISHER} ("אנחנו"). אנחנו אחראים למידע האישי המתואר כאן. שאלות ובקשות: ${CONTACT_EMAIL}.`,
    ],
  },
  {
    heading: 'איזה מידע אנחנו אוספים',
    paragraphs: [
      'חשבון: כתובת האימייל, שם המשתמש שבחרתם (תמיד ציבורי), הסיסמה (נשמרת אצל ספק מסד הנתונים רק כגיבוב מאובטח) והשפה.',
      'מה ששמרתם: הקישורים ששיתפתם או הדבקתם, טקסט ששותף יחד עם קישור, ההערות, הלוחות והגדרות הפרטיות שלכם.',
      'משוב ששלחתם מההגדרות, יחד עם גרסת האפליקציה, הפלטפורמה, גרסת מערכת ההפעלה והשפה.',
      'דוחות קריסה מאפליקציות iOS ו-Android: מה השתבש באפליקציה, דגם המכשיר וגרסת מערכת ההפעלה, ומזהה החשבון שלכם (מספר אקראי). הם לא כוללים את האימייל, שם המשתמש או כתובת ה-IP.',
      'אנחנו לא אוספים מיקום, אנשי קשר, תמונות או מזהי פרסום, ולא עוקבים אחריכם באפליקציות או באתרים אחרים.',
    ],
  },
  {
    heading: 'למה אנחנו משתמשים בו',
    paragraphs: [
      'רק כדי להפעיל את Fwd:Me: לנהל את החשבון, לשמור את הקישורים, לסדר אותם (כותרות, תקצירים, קטגוריות ותגיות), לאפשר חיפוש, לענות למשוב ולתקן קריסות. אין פרסומות, ואנחנו לא מוכרים את המידע שלכם.',
    ],
  },
  {
    heading: 'מי מעבד את המידע עבורנו',
    paragraphs: [
      'Supabase שומרת את החשבונות ואת כל מה ששמרתם, בשרתים באיחוד האירופי (אירלנד).',
      'Anthropic מקבלת את תוכן הדף שנשמר וטקסט ששותף עם הקישור, כדי לכתוב כותרת, תקציר, קטגוריה ותגיות.',
      'Voyage AI מקבלת את טקסט הדף ואת מילות החיפוש, לחיפוש לפי משמעות.',
      'Sentry מקבלת דוחות קריסה.',
      'הם מעבדים את המידע רק עבורנו. חלקם בארצות הברית; ההעברה נשענת על הסעיפים החוזיים התקניים שלהם.',
    ],
  },
  {
    heading: 'מי רואה את הקישורים שלכם',
    paragraphs: [
      'שם המשתמש ציבורי. הקישורים שלכם פרטיים, אלא אם סימנתם אותם כגלויים לעוקבים או לכולם. אפשר לשנות זאת לכל קישור ולכל החשבון בהגדרות.',
    ],
  },
  {
    heading: 'כמה זמן אנחנו שומרים',
    paragraphs: [
      'כל עוד יש לכם חשבון. כשמוחקים את החשבון, הפרופיל, הקישורים, ההערות, הלוחות והמשוב נמחקים מיד. גם דף שאף אחד אחר לא שמר נמחק. דוחות קריסה נמחקים מ-Sentry אוטומטית בתום תקופת השמירה שלה.',
    ],
  },
  {
    heading: 'הזכויות שלכם',
    paragraphs: [
      'אפשר לראות ולערוך את המידע באפליקציה, ולמחוק את החשבון בכל רגע בהגדרות ← מחיקת החשבון (ראו fwdme.expo.app/delete-account). אפשר גם לבקש מאיתנו עותק של המידע, תיקון או מחיקה בכתיבה אלינו, ולהגיש תלונה לרשות להגנת הפרטיות.',
    ],
  },
  {
    heading: 'ילדים',
    paragraphs: ['Fwd:Me לא מיועדת לילדים מתחת לגיל 13, ואנחנו לא אוספים ביודעין מידע עליהם.'],
  },
  {
    heading: 'שינויים',
    paragraphs: ['אם המדיניות תשתנה, נעדכן אותה כאן ונשנה את התאריך למעלה. על שינויים חשובים נודיע באפליקציה.'],
  },
];

const deleteEn: LegalSection[] = [
  {
    heading: 'In the app',
    paragraphs: ['Open Fwd:Me, go to Settings → Delete account, type your username and tap "Delete my account". It happens right away.'],
  },
  {
    heading: 'On the web',
    paragraphs: ['Sign in below, then open Settings → Delete account.'],
  },
  {
    heading: 'By email',
    paragraphs: [`Write to ${CONTACT_EMAIL} from the address you signed up with. We delete the account within 30 days and reply when it's done.`],
  },
  {
    heading: 'What is deleted',
    paragraphs: [
      'Your account, profile, saved links, notes, boards, feedback and devices linked to the iOS share sheet: all of it, immediately and permanently. Saved pages that nobody else saved are deleted too. Crash reports, which carry only a random account id, expire from our crash reporting service after its retention period.',
    ],
  },
];

const deleteHe: LegalSection[] = [
  {
    heading: 'באפליקציה',
    paragraphs: ['פתחו את Fwd:Me, עברו להגדרות ← מחיקת החשבון, הקלידו את שם המשתמש והקישו "מחיקת החשבון שלי". המחיקה מיידית.'],
  },
  {
    heading: 'באתר',
    paragraphs: ['התחברו כאן למטה, ואז פתחו את ההגדרות ← מחיקת החשבון.'],
  },
  {
    heading: 'באימייל',
    paragraphs: [`כתבו אל ${CONTACT_EMAIL} מהכתובת שאיתה נרשמתם. נמחק את החשבון תוך 30 יום ונשיב כשזה נעשה.`],
  },
  {
    heading: 'מה נמחק',
    paragraphs: [
      'החשבון, הפרופיל, הקישורים, ההערות, הלוחות, המשוב והמכשירים שמחוברים לתפריט השיתוף ב-iOS: הכול, מיד ולצמיתות. גם דפים שאף אחד אחר לא שמר נמחקים. דוחות קריסה, שכוללים רק מזהה חשבון אקראי, נמחקים משירות דוחות הקריסה בתום תקופת השמירה שלו.',
    ],
  },
];

export const privacyPolicy = { en: privacyEn, he: privacyHe };
export const deleteAccountHelp = { en: deleteEn, he: deleteHe };
