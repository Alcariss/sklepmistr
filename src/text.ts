/** Lower case without diacritics: "Čelovka" -> "celovka". */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** The words of a name, normalised: "Fazole v plechovce" -> ["fazole", "v", "plechovce"]. */
export function normalizedWords(value: string): string[] {
  return normalizeText(value).split(/[^a-z0-9]+/).filter((word) => word !== '');
}

/**
 * A number typed on a Czech keyboard: "1,5" and "1.5" both mean 1.5.
 * Null for blank or non-numeric input.
 */
export function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(normalized)) {
    return null;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

/** How a decimal is shown in a Czech form field: 1.5 -> "1,5". */
export function decimalFieldValue(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}
