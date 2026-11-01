import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOUSEHOLD,
  coverage,
  dailyNeeds,
  expiryStatus,
  formatDays,
  hasEssential,
  shoppingList,
  suggestExpiry,
  type Item
} from './supplies';

const TODAY = '2026-11-01';

function item(overrides: Partial<Item>): Item {
  return {
    id: '1',
    name: 'Věc',
    category: 'other',
    location: 'Sklep',
    quantity: 1,
    packageSize: null,
    dailyUse: null,
    expiry: '',
    note: '',
    ...overrides
  };
}

describe('dailyNeeds', () => {
  it('adds up the default family of three adults, a child and a toddler', () => {
    expect(dailyNeeds(DEFAULT_HOUSEHOLD)).toEqual({ waterLiters: 12.5, kcal: 8900 });
  });
});

describe('coverage', () => {
  it('counts water in litres against the family\'s daily need', () => {
    const items = [
      item({ category: 'water', quantity: 6, packageSize: 1.5 }),
      item({ category: 'water', quantity: 2, packageSize: 5 })
    ];

    expect(coverage(items, DEFAULT_HOUSEHOLD, TODAY).water).toMatchObject({ amount: 19, perDay: 12.5, days: 1.52 });
  });

  it('leaves expired items out', () => {
    const items = [
      item({ category: 'water', quantity: 10, packageSize: 1.25, expiry: '2026-10-31' }),
      item({ category: 'water', quantity: 10, packageSize: 1.25, expiry: '2026-11-01' })
    ];

    expect(coverage(items, DEFAULT_HOUSEHOLD, TODAY).water.amount).toBe(12.5);
  });

  it('reports food without calories as uncounted instead of guessing', () => {
    const rice = item({ name: 'Rýže', category: 'food', quantity: 2, packageSize: 3500 });
    const beans = item({ name: 'Fazole', category: 'food', quantity: 4 });

    const food = coverage([rice, beans], DEFAULT_HOUSEHOLD, TODAY).food;

    expect(food.amount).toBe(7000);
    expect(food.uncounted).toEqual([beans]);
  });

  it('lasts as long as the item that runs out first', () => {
    const paper = item({ name: 'Toaletní papír', category: 'hygiene', quantity: 12, dailyUse: 1 });
    const wipes = item({ name: 'Vlhčené ubrousky', category: 'hygiene', quantity: 3, dailyUse: 0.5 });

    expect(coverage([paper, wipes], DEFAULT_HOUSEHOLD, TODAY).hygiene).toMatchObject({ days: 6, bottleneck: wipes });
  });

  it('has no duration for a category with nothing measurable', () => {
    const candles = item({ name: 'Svíčky', category: 'energy', quantity: 20 });

    expect(coverage([candles], DEFAULT_HOUSEHOLD, TODAY).energy).toMatchObject({ days: null, uncounted: [candles] });
  });

  it('ignores used-up items', () => {
    const empty = item({ category: 'hygiene', quantity: 0, dailyUse: 1 });

    expect(coverage([empty], DEFAULT_HOUSEHOLD, TODAY).hygiene.days).toBeNull();
  });
});

describe('expiryStatus', () => {
  it.each([
    ['2026-10-31', 'expired'],
    ['2026-11-01', 'soon'],
    ['2026-12-01', 'soon'],
    ['2026-12-02', 'upcoming'],
    ['2027-01-30', 'upcoming'],
    ['2027-01-31', 'ok'],
    ['', 'none']
  ])('%s is %s', (expiry, status) => {
    expect(expiryStatus(expiry, TODAY)).toBe(status);
  });
});

describe('suggestExpiry', () => {
  it('adds the category\'s typical shelf life', () => {
    expect(suggestExpiry('water', TODAY)).toBe('2028-11-01');
  });

  it('keeps to the last day of a shorter month', () => {
    expect(suggestExpiry('food', '2028-02-29')).toBe('2029-02-28');
  });

  it('suggests nothing where shelf life varies too much', () => {
    expect(suggestExpiry('other', TODAY)).toBe('');
  });
});

describe('shoppingList', () => {
  it('lists the water missing to reach the target days', () => {
    const items = [item({ category: 'water', quantity: 6, packageSize: 1.5 })];

    const needs = shoppingList(items, { ...DEFAULT_HOUSEHOLD, targetDays: 3 }, TODAY);

    expect(needs.find((need) => need.category === 'water')?.text).toBe('Dokoupit 29 l vody');
  });

  it('rounds packages up for daily-use items', () => {
    const paper = item({ name: 'Toaletní papír', category: 'hygiene', quantity: 2, dailyUse: 0.7 });

    const needs = shoppingList([paper], { ...DEFAULT_HOUSEHOLD, targetDays: 7 }, TODAY);

    expect(needs.find((need) => need.item === paper)?.text).toBe('Toaletní papír: dokoupit 3 ks');
  });

  it('asks to replace what has expired', () => {
    const pills = item({ name: 'Paralen', category: 'medicine', quantity: 1, expiry: '2026-09-30' });

    const needs = shoppingList([pills], DEFAULT_HOUSEHOLD, TODAY);

    expect(needs.map((need) => need.text)).toContain('Paralen: vyměnit, prošlo 30. 9. 2026');
  });

  it('asks for nothing when the target is met', () => {
    const items = [
      item({ category: 'water', quantity: 100, packageSize: 1 }),
      item({ category: 'food', quantity: 70, packageSize: 1000 })
    ];

    expect(shoppingList(items, { ...DEFAULT_HOUSEHOLD, targetDays: 7 }, TODAY)).toEqual([]);
  });
});

describe('hasEssential', () => {
  it('matches names without regard to diacritics or case', () => {
    expect(hasEssential([item({ name: 'ČELOVKA Petzl' })], ['celovk'])).toBe(true);
  });

  it('matches the start of a word, not any substring', () => {
    expect(hasEssential([item({ name: 'Kukuřice' })], ['rice'])).toBe(false);
  });
});

describe('formatDays', () => {
  it.each([
    [0.4, 'méně než den'],
    [1.9, '1 den'],
    [3, '3 dny'],
    [5.5, '5 dní'],
    [1500, '1\u00a0500 dní']
  ])('%s -> %s', (days, text) => {
    expect(formatDays(days)).toBe(text);
  });
});
