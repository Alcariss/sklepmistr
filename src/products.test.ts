import { describe, expect, it, vi } from 'vitest';
import { isValidBarcode, lookupProduct, parseQuantity, productFromFacts } from './products';

describe('isValidBarcode', () => {
  it.each(['5449000000996', '96385074', '036000291452'])('accepts %s', (code) => {
    expect(isValidBarcode(code)).toBe(true);
  });

  it.each(['5449000000997', '123', 'abcdefghijklm', ''])('rejects %s', (code) => {
    expect(isValidBarcode(code)).toBe(false);
  });
});

describe('parseQuantity', () => {
  it.each([
    ['400 g', { amount: 400, unit: 'g' }],
    ['1,5 l', { amount: 1500, unit: 'ml' }],
    ['33 cl', { amount: 330, unit: 'ml' }],
    ['1 kg', { amount: 1000, unit: 'g' }],
    ['6 x 1,5 l', { amount: 9000, unit: 'ml' }],
    ['250ml', { amount: 250, unit: 'ml' }]
  ])('%s', (text, expected) => {
    expect(parseQuantity(text)).toEqual(expected);
  });

  it('returns null for text without a unit', () => {
    expect(parseQuantity('3 kusy')).toBeNull();
  });
});

describe('productFromFacts', () => {
  it('reads water as litres per package', () => {
    const product = {
      product_name: 'Bonaqua neperlivá',
      product_quantity: '1500',
      product_quantity_unit: 'ml',
      categories_tags: ['en:beverages', 'en:waters', 'en:spring-waters']
    };

    expect(productFromFacts(product, 'food', '5449000131805')).toEqual({
      barcode: '5449000131805', name: 'Bonaqua neperlivá', category: 'water', packageSize: 1.5
    });
  });

  it('works out the kcal in one package from kcal per 100 g', () => {
    const product = {
      product_name: 'Fazole v tomatové omáčce',
      product_quantity: 400,
      product_quantity_unit: 'g',
      nutriments: { 'energy-kcal_100g': 85 },
      categories_tags: ['en:canned-foods']
    };

    expect(productFromFacts(product, 'food', '1')).toMatchObject({ category: 'food', packageSize: 340 });
  });

  it('falls back to kJ when kcal is missing', () => {
    const product = { product_name: 'Sušenky', quantity: '100 g', nutriments: { energy_100g: 2092 } };

    expect(productFromFacts(product, 'food', '1').packageSize).toBe(500);
  });

  it('prefers the Czech name', () => {
    const product = { product_name: 'Beans', product_name_cs: 'Fazole', quantity: '400 g' };

    expect(productFromFacts(product, 'food', '1').name).toBe('Fazole');
  });

  it('leaves the size empty when the package size is unknown', () => {
    const product = { product_name: 'Rýže', nutriments: { 'energy-kcal_100g': 350 } };

    expect(productFromFacts(product, 'food', '1').packageSize).toBeNull();
  });

  it('files Open Beauty Facts products under hygiene', () => {
    expect(productFromFacts({ product_name: 'Mýdlo' }, 'beauty', '1')).toMatchObject({ category: 'hygiene', packageSize: null });
  });
});

describe('lookupProduct', () => {
  function respond(byHost: Record<string, unknown>): typeof fetch {
    return vi.fn<typeof fetch>(async (input) => {
      const host = new URL(String(input)).host;
      const body = byHost[host];
      return body === undefined ? new Response('', { status: 404 }) : new Response(JSON.stringify(body));
    });
  }

  it('asks Open Food Facts first', async () => {
    const fetchMock = respond({ 'world.openfoodfacts.org': { status: 1, product: { product_name: 'Fazole' } } });

    expect(await lookupProduct('5449000000996', fetchMock)).toMatchObject({ name: 'Fazole', category: 'food' });
  });

  it('tries Open Beauty Facts when the food database does not know the code', async () => {
    const fetchMock = respond({
      'world.openfoodfacts.org': { status: 0 },
      'world.openbeautyfacts.org': { status: 1, product: { product_name: 'Šampon' } }
    });

    expect(await lookupProduct('5449000000996', fetchMock)).toMatchObject({ name: 'Šampon', category: 'hygiene' });
  });

  it('returns null when neither database knows the code', async () => {
    const fetchMock = respond({ 'world.openfoodfacts.org': { status: 0 }, 'world.openbeautyfacts.org': { status: 0 } });

    expect(await lookupProduct('5449000000996', fetchMock)).toBeNull();
  });

  it('returns null rather than failing when offline', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await lookupProduct('5449000000996', fetchMock)).toBeNull();
  });
});
