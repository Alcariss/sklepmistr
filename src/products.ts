import type { Category } from './supplies';

/** What a barcode tells us about a product before anyone types anything. */
export type ProductDraft = {
  barcode: string;
  name: string;
  category: Category;
  /** Litres for water, kcal for food, null when unknown. */
  packageSize: number | null;
};

/** EAN-8, UPC-A, EAN-13 and GTIN-14 with a valid GS1 check digit. */
export function isValidBarcode(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) {
    return false;
  }
  const digits = [...code].map(Number);
  const check = digits.pop() as number;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

type Quantity = { amount: number; unit: 'g' | 'ml' };

const UNIT_FACTORS: Record<string, [Quantity['unit'], number]> = {
  g: ['g', 1],
  kg: ['g', 1000],
  ml: ['ml', 1],
  cl: ['ml', 10],
  dl: ['ml', 100],
  l: ['ml', 1000]
};

/** "1,5 l" -> 1500 ml, "6 x 1,5 l" -> 9000 ml, "400 g" -> 400 g. */
export function parseQuantity(text: string): Quantity | null {
  const match = /(?:(\d+)\s*[x×*]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l)\b/i.exec(text);
  if (match === null) {
    return null;
  }
  const [unit, factor] = UNIT_FACTORS[(match[3] as string).toLowerCase()] as [Quantity['unit'], number];
  const packs = match[1] ? Number(match[1]) : 1;
  return { amount: packs * Number((match[2] as string).replace(',', '.')) * factor, unit };
}

const WATER_TAGS = /^en:(waters|spring-waters|mineral-waters|natural-mineral-waters|still-waters|sparkling-waters|unflavoured-waters)$/;

function stringField(product: Record<string, unknown>, key: string): string {
  const value = product[key];
  return typeof value === 'string' ? value.trim() : '';
}

function packageQuantity(product: Record<string, unknown>): Quantity | null {
  const amount = Number(product.product_quantity);
  const unit = stringField(product, 'product_quantity_unit').toLowerCase();
  if (Number.isFinite(amount) && amount > 0 && (unit === 'g' || unit === 'ml')) {
    return { amount, unit };
  }
  return parseQuantity(stringField(product, 'quantity'));
}

function kcalPer100(product: Record<string, unknown>): number | null {
  const nutriments = (product.nutriments ?? {}) as Record<string, unknown>;
  const kcal = Number(nutriments['energy-kcal_100g']);
  if (Number.isFinite(kcal) && kcal > 0) {
    return kcal;
  }
  const kilojoules = Number(nutriments.energy_100g);
  return Number.isFinite(kilojoules) && kilojoules > 0 ? kilojoules / 4.184 : null;
}

/** Maps an Open Food Facts or Open Beauty Facts product to a Sklepmistr draft. */
export function productFromFacts(raw: unknown, database: 'food' | 'beauty', barcode: string): ProductDraft {
  const product = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const brand = stringField(product, 'brands').split(',')[0]?.trim() ?? '';
  const name = stringField(product, 'product_name_cs')
    || stringField(product, 'product_name')
    || stringField(product, 'generic_name')
    || brand;

  if (database === 'beauty') {
    return { barcode, name, category: 'hygiene', packageSize: null };
  }

  const tags = Array.isArray(product.categories_tags) ? product.categories_tags.map(String) : [];
  const quantity = packageQuantity(product);

  if (tags.some((tag) => WATER_TAGS.test(tag))) {
    return { barcode, name, category: 'water', packageSize: quantity ? quantity.amount / 1000 : null };
  }

  const kcal = kcalPer100(product);
  return {
    barcode,
    name,
    category: 'food',
    packageSize: kcal !== null && quantity !== null ? Math.round((kcal * quantity.amount) / 100) : null
  };
}

const DATABASES = [
  { database: 'food', host: 'https://world.openfoodfacts.org' },
  { database: 'beauty', host: 'https://world.openbeautyfacts.org' }
] as const;

const FIELDS = 'product_name,product_name_cs,generic_name,brands,product_quantity,product_quantity_unit,quantity,nutriments,categories_tags';

/**
 * Looks the code up in the open product databases. Returns null when no
 * database knows it, or when they cannot be reached: the form then stays
 * empty for the user to fill in, which is never worse than a failure.
 */
export async function lookupProduct(barcode: string, fetchImpl: typeof fetch = fetch): Promise<ProductDraft | null> {
  for (const { database, host } of DATABASES) {
    try {
      const response = await fetchImpl(`${host}/api/v2/product/${barcode}.json?fields=${FIELDS}`, {
        signal: AbortSignal.timeout(6000)
      });
      if (!response.ok) {
        continue;
      }
      const body = (await response.json()) as { status?: number; product?: unknown };
      if (body.status === 1 && body.product) {
        return productFromFacts(body.product, database, barcode);
      }
    } catch (error) {
      console.warn(`Sklepmistr: ${host} lookup failed`, error);
    }
  }
  return null;
}
