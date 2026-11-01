import type { RequestParams } from '@alcariss/pwa-kit';
import { CATEGORIES, type Category, type Household, type Item } from './supplies';

/** Mirrors the `sklepmistr` entry in the pwa-kit worker's `apps.ts`. */

export type ItemInput = Omit<Item, 'id'>;
export type HouseholdInput = Omit<Household, 'id'>;

function asRecord(row: unknown, what: string): Record<string, unknown> {
  if (typeof row !== 'object' || row === null) {
    throw new Error(`${what} row is not an object`);
  }
  return row as Record<string, unknown>;
}

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function numberOrNull(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function category(value: string): Category {
  return (CATEGORIES as readonly string[]).includes(value) ? (value as Category) : 'other';
}

export function toItem(row: unknown): Item {
  const record = asRecord(row, 'Item');
  const id = text(record, 'id');
  if (id === '') {
    throw new Error('Item row has no id');
  }
  return {
    id,
    name: text(record, 'name'),
    // A category typed into Grist by hand may not be one the app knows.
    category: category(text(record, 'category')),
    location: text(record, 'location'),
    quantity: numberOrNull(record, 'quantity') ?? 0,
    packageSize: numberOrNull(record, 'packageSize'),
    dailyUse: numberOrNull(record, 'dailyUse'),
    expiry: text(record, 'expiry'),
    note: text(record, 'note'),
    barcode: text(record, 'barcode')
  };
}

/** Empty optional fields are sent as '' so an edit can clear them. */
export function toItemParams(input: ItemInput): RequestParams {
  return {
    name: input.name.trim(),
    category: input.category,
    location: input.location.trim(),
    quantity: input.quantity,
    packageSize: input.packageSize ?? '',
    dailyUse: input.dailyUse ?? '',
    expiry: input.expiry,
    note: input.note.trim(),
    barcode: input.barcode
  };
}

export function toHousehold(row: unknown): Household {
  const record = asRecord(row, 'Household');
  return {
    id: text(record, 'id') || null,
    adults: numberOrNull(record, 'adults') ?? 0,
    children: numberOrNull(record, 'children') ?? 0,
    toddlers: numberOrNull(record, 'toddlers') ?? 0,
    targetDays: numberOrNull(record, 'targetDays') ?? 1
  };
}

export function toHouseholdParams(input: HouseholdInput): RequestParams {
  return {
    adults: input.adults,
    children: input.children,
    toddlers: input.toddlers,
    targetDays: input.targetDays
  };
}
