import { describe, expect, it } from 'vitest';
import { estimateFoodKcal } from './estimate';

describe('estimateFoodKcal', () => {
  it.each([
    ['Rýže', 3500, 'rýže'],
    ['Těstoviny penne', 1800, 'těstoviny'],
    ['Fazole v plechovce', 360, 'fazole v konzervě'],
    ['Čočka', 1700, 'čočka, hrách, cizrna'],
    ['Olej slunečnicový', 8800, 'olej'],
    ['Sušenky Bebe', 720, 'sušenky, oplatky'],
    ['Přesnídávka jablko', 77, 'dětská výživa'],
    ['Tuňák ve vlastní šťávě', 240, 'rybí konzerva']
  ])('%s -> %s kcal (%s)', (name, kcal, label) => {
    expect(estimateFoodKcal(name)).toMatchObject({ kcal, label });
  });

  it('uses a weight written in the name instead of the typical package', () => {
    expect(estimateFoodKcal('Rýže 2 kg')).toMatchObject({ kcal: 7000, grams: 2000 });
  });

  it('tells dried milk from milk', () => {
    expect(estimateFoodKcal('Sušené mléko')?.label).toBe('sušené mléko');
    expect(estimateFoodKcal('Trvanlivé mléko')?.label).toBe('trvanlivé mléko');
  });

  it('tells biscuits from dried fruit', () => {
    expect(estimateFoodKcal('Sušené švestky')?.label).toBe('sušené ovoce');
    expect(estimateFoodKcal('Sušenky')?.label).toBe('sušenky, oplatky');
  });

  it('matches whole words, not parts of other words', () => {
    expect(estimateFoodKcal('Medvídek Haribo')?.label).not.toBe('med');
  });

  it('knows nothing about an unrecognised name', () => {
    expect(estimateFoodKcal('Babiččina specialita')).toBeNull();
  });
});
