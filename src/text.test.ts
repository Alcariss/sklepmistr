import { describe, expect, it } from 'vitest';
import { decimalFieldValue, parseDecimal } from './text';

describe('parseDecimal', () => {
  it.each([
    ['1,5', 1.5],
    ['1.5', 1.5],
    [' 0,25 ', 0.25],
    [',5', 0.5],
    ['3', 3],
    ['2,', 2],
    ['1 500', 1500]
  ])('%s -> %s', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each(['', '  ', 'abc', '1,5,2', '1.2.3', '1,5 l'])('rejects %j', (input) => {
    expect(parseDecimal(input)).toBeNull();
  });
});

describe('decimalFieldValue', () => {
  it('shows a decimal with a comma', () => {
    expect(decimalFieldValue(1.5)).toBe('1,5');
  });

  it('leaves an empty value empty', () => {
    expect(decimalFieldValue(null)).toBe('');
  });
});
