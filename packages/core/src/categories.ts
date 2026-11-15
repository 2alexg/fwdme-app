// The fixed top-level categories. Keys are stored on items and never change;
// labels are what people see. Keep this file free of imports: the enrichment
// worker (Deno) imports it directly.

export const CATEGORIES = {
  recipes: { en: 'Recipes', he: 'מתכונים', emoji: '🍳' },
  food: { en: 'Food & restaurants', he: 'אוכל ומסעדות', emoji: '🍽️' },
  travel: { en: 'Travel', he: 'טיולים', emoji: '✈️' },
  fashion: { en: 'Fashion & beauty', he: 'אופנה ויופי', emoji: '👗' },
  home: { en: 'Home & garden', he: 'בית וגינה', emoji: '🏡' },
  diy: { en: 'DIY & crafts', he: 'עשה זאת בעצמך', emoji: '🛠️' },
  fitness: { en: 'Fitness & health', he: 'כושר ובריאות', emoji: '💪' },
  sports: { en: 'Sports', he: 'ספורט', emoji: '⚽' },
  parenting: { en: 'Parenting & family', he: 'הורות ומשפחה', emoji: '👨‍👩‍👧' },
  learning: { en: 'Learning & how-to', he: 'לימוד והדרכות', emoji: '📚' },
  tech: { en: 'Tech', he: 'טכנולוגיה', emoji: '💻' },
  science: { en: 'Science & nature', he: 'מדע וטבע', emoji: '🔬' },
  money: { en: 'Money & business', he: 'כסף ועסקים', emoji: '💼' },
  news: { en: 'News & politics', he: 'חדשות ופוליטיקה', emoji: '📰' },
  culture: { en: 'Books, film & music', he: 'ספרים, סרטים ומוזיקה', emoji: '🎬' },
  art: { en: 'Art & design', he: 'אמנות ועיצוב', emoji: '🎨' },
  humor: { en: 'Humor', he: 'הומור', emoji: '😂' },
  shopping: { en: 'Shopping & deals', he: 'קניות ומבצעים', emoji: '🛍️' },
  events: { en: 'Events & places', he: 'אירועים ומקומות', emoji: '📍' },
  other: { en: 'Other', he: 'אחר', emoji: '🗂️' },
} as const;

export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATEGORIES, value);
}

export function categoryLabel(key: string | null | undefined, locale: 'he' | 'en'): string | null {
  return isCategory(key) ? CATEGORIES[key][locale] : null;
}

export function categoryEmoji(key: string | null | undefined): string {
  return isCategory(key) ? CATEGORIES[key].emoji : '🗂️';
}
