import { estimateFoodKcal } from './estimate';
import { normalizedWords } from './text';

/**
 * Everything Sklepmistr knows about supplies, free of DOM and network so it
 * can be tested directly. Dates are local `YYYY-MM-DD` strings.
 */

export const CATEGORIES = ['water', 'food', 'hygiene', 'medicine', 'energy', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  water: 'Voda',
  food: 'Jídlo',
  hygiene: 'Hygiena',
  medicine: 'Léky a první pomoc',
  energy: 'Světlo a energie',
  other: 'Ostatní'
};

export const CATEGORY_ICONS: Record<Category, string> = {
  water: '💧',
  food: '🥫',
  hygiene: '🧻',
  medicine: '💊',
  energy: '🔦',
  other: '📦'
};

export type Item = {
  id: string;
  name: string;
  category: Category;
  location: string;
  /** Number of packages (bottles, cans, rolls…). */
  quantity: number;
  /** Litres per package for water, kcal per package for food. */
  packageSize: number | null;
  /** Packages the whole household uses per day; for everything but water and food. */
  dailyUse: number | null;
  expiry: string;
  note: string;
  /** EAN/UPC code, '' when the item was entered by hand. */
  barcode: string;
};

export type Household = {
  id: string | null;
  adults: number;
  /** Children 4–12 years. */
  children: number;
  /** Toddlers 1–3 years. */
  toddlers: number;
  targetDays: number;
};

/** 3 adults, the 11-year-old and the 3-year-old. */
export const DEFAULT_HOUSEHOLD: Household = { id: null, adults: 3, children: 1, toddlers: 1, targetDays: 7 };

/** The EU and HZS ČR recommend households cope on their own for at least 72 hours. */
export const MINIMUM_DAYS = 3;

/**
 * Drinking and cooking water and energy per person per day. Deliberately
 * modest emergency figures, not normal consumption.
 */
export const DAILY_NEEDS = {
  adult: { waterLiters: 3, kcal: 2000 },
  child: { waterLiters: 2, kcal: 1800 },
  toddler: { waterLiters: 1.5, kcal: 1100 }
} as const;

export const SOON_DAYS = 30;
const UPCOMING_DAYS = 90;

/** Typical shelf life offered as the expiry date of a new item; the package decides. */
export const SUGGESTED_SHELF_LIFE_MONTHS: Partial<Record<Category, number>> = {
  water: 24,
  food: 12,
  hygiene: 36,
  medicine: 24,
  energy: 60
};

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

function formatLocalDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from `today` to `date`; negative when `date` has passed. */
export function daysUntil(date: string, today: string): number {
  return Math.round((parseLocalDate(date).getTime() - parseLocalDate(today).getTime()) / 86_400_000);
}

export type ExpiryStatus = 'expired' | 'soon' | 'upcoming' | 'ok' | 'none';

export function expiryStatus(expiry: string, today: string): ExpiryStatus {
  if (expiry === '') {
    return 'none';
  }
  const days = daysUntil(expiry, today);
  if (days < 0) {
    return 'expired';
  }
  if (days <= SOON_DAYS) {
    return 'soon';
  }
  return days <= UPCOMING_DAYS ? 'upcoming' : 'ok';
}

/** `today` plus the category's typical shelf life, or '' when there is none. */
export function suggestExpiry(category: Category, today: string): string {
  const months = SUGGESTED_SHELF_LIFE_MONTHS[category];
  if (months === undefined) {
    return '';
  }
  const start = parseLocalDate(today);
  const target = new Date(start.getFullYear(), start.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(start.getDate(), lastDay));
  return formatLocalDate(target);
}

export function householdSize(household: Household): number {
  return household.adults + household.children + household.toddlers;
}

export function dailyNeeds(household: Household): { waterLiters: number; kcal: number } {
  const sum = (key: 'waterLiters' | 'kcal') =>
    household.adults * DAILY_NEEDS.adult[key]
    + household.children * DAILY_NEEDS.child[key]
    + household.toddlers * DAILY_NEEDS.toddler[key];
  return { waterLiters: sum('waterLiters'), kcal: sum('kcal') };
}

export type Coverage = {
  category: Category;
  /** How long the usable stock lasts; null when nothing in the category can be measured. */
  days: number | null;
  /** Litres of water or kcal of food in usable stock. */
  amount: number | null;
  /** Litres or kcal the household needs per day. */
  perDay: number | null;
  /** For daily-use categories: the item that runs out first. */
  bottleneck: Item | null;
  /** Usable items that cannot be counted: no package size, or no daily use. */
  uncounted: Item[];
  /** Food counted with calories guessed from its name. */
  estimated: Item[];
};

function isUsable(item: Item, today: string): boolean {
  return item.quantity > 0 && expiryStatus(item.expiry, today) !== 'expired';
}

/** Litres per package for water, kcal per package for food; estimated from the name for food without one. */
export function packageAmount(item: Item): { amount: number; estimated: boolean } | null {
  if (item.packageSize !== null && item.packageSize > 0) {
    return { amount: item.packageSize, estimated: false };
  }
  const estimate = item.category === 'food' ? estimateFoodKcal(item.name) : null;
  return estimate === null ? null : { amount: estimate.kcal, estimated: true };
}

function amountCoverage(category: 'water' | 'food', items: Item[], perDay: number): Coverage {
  let amount = 0;
  const counted: Item[] = [];
  const estimated: Item[] = [];
  for (const item of items) {
    const size = packageAmount(item);
    if (size !== null) {
      amount += item.quantity * size.amount;
      counted.push(item);
      if (size.estimated) {
        estimated.push(item);
      }
    }
  }
  return {
    category,
    days: counted.length === 0 || perDay === 0 ? null : amount / perDay,
    amount,
    perDay,
    bottleneck: null,
    uncounted: items.filter((item) => !counted.includes(item)),
    estimated
  };
}

function dailyUseCoverage(category: Category, items: Item[]): Coverage {
  let bottleneck: Item | null = null;
  let days: number | null = null;
  for (const item of items) {
    if (item.dailyUse !== null && item.dailyUse > 0) {
      const itemDays = item.quantity / item.dailyUse;
      if (days === null || itemDays < days) {
        days = itemDays;
        bottleneck = item;
      }
    }
  }
  return {
    category,
    days,
    amount: null,
    perDay: null,
    bottleneck,
    uncounted: items.filter((item) => item.dailyUse === null || item.dailyUse <= 0),
    estimated: []
  };
}

/**
 * How long each category lasts. Expired and used-up items do not count.
 * Water and food scale with the household; the rest last as long as the item
 * that runs out first.
 */
export function coverage(items: Item[], household: Household, today: string): Record<Category, Coverage> {
  const needs = dailyNeeds(household);
  const usable = items.filter((item) => isUsable(item, today));
  const inCategory = (category: Category) => usable.filter((item) => item.category === category);

  return {
    water: amountCoverage('water', inCategory('water'), needs.waterLiters),
    food: amountCoverage('food', inCategory('food'), needs.kcal),
    hygiene: dailyUseCoverage('hygiene', inCategory('hygiene')),
    medicine: dailyUseCoverage('medicine', inCategory('medicine')),
    energy: dailyUseCoverage('energy', inCategory('energy')),
    other: dailyUseCoverage('other', inCategory('other'))
  };
}

export type ShoppingNeed = {
  category: Category;
  text: string;
  /** For items: the item to restock or replace. */
  item: Item | null;
};

/** What to buy to last `household.targetDays`, and what to replace because it expired. */
export function shoppingList(items: Item[], household: Household, today: string): ShoppingNeed[] {
  const target = household.targetDays;
  const cover = coverage(items, household, today);
  const needs: ShoppingNeed[] = [];

  const water = cover.water;
  const missingLiters = Math.ceil(target * (water.perDay ?? 0) - (water.amount ?? 0));
  if (missingLiters > 0) {
    needs.push({ category: 'water', text: `Dokoupit ${formatNumber(missingLiters)} l vody`, item: null });
  }

  const food = cover.food;
  const missingKcal = Math.ceil(target * (food.perDay ?? 0) - (food.amount ?? 0));
  if (missingKcal > 0) {
    const days = missingKcal / (food.perDay ?? 1);
    needs.push({
      category: 'food',
      text: `Dokoupit jídlo za ${formatNumber(Math.round(missingKcal / 100) * 100)} kcal (${formatDays(days)} pro celou rodinu)`,
      item: null
    });
  }

  for (const item of items) {
    if (item.dailyUse === null || item.dailyUse <= 0 || item.category === 'water' || item.category === 'food') {
      continue;
    }
    const usableQuantity = isUsable(item, today) ? item.quantity : 0;
    const missing = Math.ceil(target * item.dailyUse - usableQuantity);
    if (missing > 0) {
      needs.push({ category: item.category, text: `${item.name}: dokoupit ${formatNumber(missing)} ks`, item });
    }
  }

  for (const item of items) {
    if (item.quantity > 0 && expiryStatus(item.expiry, today) === 'expired') {
      needs.push({ category: item.category, text: `${item.name}: vyměnit, prošlo ${formatDate(item.expiry)}`, item });
    }
  }

  return needs;
}

/** Things every blackout stock should have, matched loosely against item names. */
export const ESSENTIALS: readonly { label: string; keywords: readonly string[] }[] = [
  { label: 'Baterka nebo čelovka', keywords: ['baterk', 'celovk', 'svitiln'] },
  { label: 'Náhradní baterie', keywords: ['bateri', 'aa', 'aaa'] },
  { label: 'Rádio na baterie nebo kličku', keywords: ['radio', 'radi'] },
  { label: 'Powerbanka', keywords: ['powerbank'] },
  { label: 'Svíčky a zápalky nebo zapalovač', keywords: ['svick', 'zapalk', 'zapalovac'] },
  { label: 'Vařič a plynové kartuše', keywords: ['varic', 'kartus', 'plyn'] },
  { label: 'Lékárnička', keywords: ['lekarnick', 'naplast', 'obvaz'] },
  { label: 'Pleny a vlhčené ubrousky', keywords: ['plen', 'ubrous'] },
  { label: 'Hotovost', keywords: ['hotovost', 'penize', 'cash'] },
  { label: 'Kopie dokladů', keywords: ['doklad', 'kopie'] }
];

export function hasEssential(items: Item[], keywords: readonly string[]): boolean {
  return items.some((item) => {
    const words = normalizedWords(item.name);
    return keywords.some((keyword) => words.some((word) => word.startsWith(keyword)));
  });
}

const numberFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatDate(value: string): string {
  return value === '' ? '' : parseLocalDate(value).toLocaleDateString('cs-CZ');
}

/** Czech plural of whole days: 1 den, 2 dny, 5 dní; under one day reads as such. */
export function formatDays(days: number): string {
  if (days < 1) {
    return 'méně než den';
  }
  const whole = Math.floor(days);
  if (whole === 1) {
    return '1 den';
  }
  return whole >= 2 && whole <= 4 ? `${whole} dny` : `${formatNumber(whole)} dní`;
}
