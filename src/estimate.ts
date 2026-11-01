import { parseQuantity } from './products';
import { normalizedWords } from './text';

/**
 * Rough calories for common stock foods, used when an item has no kcal of its
 * own. Values are typical per 100 g as sold (canned = drained weight plus
 * sauce), and the typical package size in g or ml. Good enough to tell
 * "3 days" from "3 weeks", not a nutrition label.
 *
 * `match` lists alternatives; each is a set of word prefixes that must all
 * occur in the name. A prefix ending in `$` must be a whole word. Earlier
 * entries win, so specific ones ("sušené mléko") come before general ones.
 */
const FOODS: readonly { label: string; kcal100: number; grams: number; match: readonly (readonly string[])[] }[] = [
  { label: 'sušené mléko', kcal100: 500, grams: 400, match: [['susen', 'mlek'], ['kojeneck'], ['formule']] },
  { label: 'instantní bramborová kaše', kcal100: 350, grams: 100, match: [['bramborov', 'kas']] },
  { label: 'sušenky, oplatky', kcal100: 480, grams: 150, match: [['susenk'], ['oplatk'], ['keks'], ['pernik']] },
  { label: 'sušené ovoce', kcal100: 300, grams: 200, match: [['susen'], ['rozink'], ['datl'], ['merunk'], ['svestk', 'susen']] },
  { label: 'dětská výživa', kcal100: 70, grams: 110, match: [['presnidavk'], ['kapsick'], ['detsk', 'vyziv']] },
  { label: 'trvanlivé mléko', kcal100: 47, grams: 1000, match: [['mlek'], ['mleko']] },
  { label: 'rýže', kcal100: 350, grams: 1000, match: [['ryz']] },
  { label: 'těstoviny', kcal100: 360, grams: 500, match: [['testovin'], ['spaget'], ['nudl'], ['makaron'], ['penne'], ['kolink'], ['vretena'], ['fleck']] },
  { label: 'mouka', kcal100: 350, grams: 1000, match: [['mouk']] },
  { label: 'cukr', kcal100: 400, grams: 1000, match: [['cukr']] },
  { label: 'ovesné vločky, müsli', kcal100: 380, grams: 500, match: [['vlock'], ['oves'], ['musli'], ['granol']] },
  { label: 'čočka, hrách, cizrna', kcal100: 340, grams: 500, match: [['cock'], ['hrach'], ['cizrn'], ['bulgur'], ['kuskus'], ['quinoa']] },
  { label: 'fazole v konzervě', kcal100: 90, grams: 400, match: [['fazol']] },
  { label: 'rybí konzerva', kcal100: 200, grams: 120, match: [['tunak'], ['sardin'], ['makrel'], ['sled'], ['losos']] },
  { label: 'paštika', kcal100: 280, grams: 120, match: [['pastik'], ['pasteta']] },
  { label: 'masová konzerva', kcal100: 250, grams: 300, match: [['lancmit'], ['luncheon'], ['vepro'], ['vepr'], ['hovez'], ['kureci'], ['maso']] },
  { label: 'hotové jídlo v konzervě', kcal100: 130, grams: 400, match: [['gulas'], ['hotov'], ['segedin'], ['rizot'], ['chili']] },
  { label: 'polévka', kcal100: 350, grams: 65, match: [['polevk'], ['bujon']] },
  { label: 'zelenina v konzervě', kcal100: 60, grams: 350, match: [['kukuric'], ['hrasek'], ['zelenin'], ['rajcat'], ['okurk'], ['zeli'], ['cervena', 'repa']] },
  { label: 'kompot', kcal100: 70, grams: 400, match: [['kompot'], ['broskv'], ['ananas'], ['mandarink'], ['ovoc']] },
  { label: 'trvanlivé pečivo', kcal100: 400, grams: 250, match: [['suchar'], ['knacke'], ['krekr'], ['chlebick'], ['trvanl', 'pecivo'], ['tortill']] },
  { label: 'chléb', kcal100: 250, grams: 1000, match: [['chleb']] },
  { label: 'čokoláda', kcal100: 540, grams: 100, match: [['cokolad']] },
  { label: 'tyčinka', kcal100: 420, grams: 40, match: [['tycink']] },
  { label: 'ořechy, semínka', kcal100: 600, grams: 200, match: [['orech'], ['mandl'], ['arasid'], ['kesu'], ['semin']] },
  { label: 'med', kcal100: 320, grams: 500, match: [['med$']] },
  { label: 'džem', kcal100: 250, grams: 340, match: [['dzem'], ['marmelad'], ['povidl']] },
  { label: 'olej', kcal100: 880, grams: 1000, match: [['olej']] },
  { label: 'sádlo, máslo', kcal100: 740, grams: 250, match: [['sadl'], ['masl'], ['ghi']] },
  { label: 'sýr', kcal100: 350, grams: 150, match: [['syr']] },
  { label: 'vejce', kcal100: 140, grams: 60, match: [['vejc'], ['vajic']] },
  { label: 'brambory', kcal100: 77, grams: 2500, match: [['brambor']] },
  { label: 'džus', kcal100: 45, grams: 1000, match: [['dzus'], ['stava']] },
  { label: 'limonáda', kcal100: 40, grams: 1500, match: [['limonad'], ['cola'], ['sirup']] },
  { label: 'káva, čaj, koření', kcal100: 0, grams: 100, match: [['kav'], ['caj'], ['koren'], ['sul$']] }
];

export type FoodEstimate = {
  /** kcal in one package. */
  kcal: number;
  label: string;
  /** Package weight the estimate assumes, from the name or the typical package. */
  grams: number;
};

function matches(words: string[], prefixes: readonly string[]): boolean {
  return prefixes.every((prefix) =>
    prefix.endsWith('$')
      ? words.includes(prefix.slice(0, -1))
      : words.some((word) => word.startsWith(prefix)));
}

/** Calories in one package of a food, guessed from its name; null when the name means nothing to us. */
export function estimateFoodKcal(name: string): FoodEstimate | null {
  const words = normalizedWords(name);
  const food = FOODS.find((entry) => entry.match.some((prefixes) => matches(words, prefixes)));
  if (food === undefined) {
    return null;
  }
  const grams = parseQuantity(name)?.amount ?? food.grams;
  return { kcal: Math.round((food.kcal100 * grams) / 100), label: food.label, grams };
}
