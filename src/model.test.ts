import { describe, expect, it } from 'vitest';
import { toHousehold, toItem, toItemParams } from './model';

describe('toItem', () => {
  it('reads a row from the worker', () => {
    const row = {
      id: '4', name: 'Voda Bonaqua', category: 'water', location: 'Sklep', quantity: 6,
      packageSize: 1.5, dailyUse: null, expiry: '2027-05-01', note: '', barcode: '8594001021505', createdAt: 'c', updatedAt: 'u'
    };

    expect(toItem(row)).toEqual({
      id: '4', name: 'Voda Bonaqua', category: 'water', location: 'Sklep', quantity: 6,
      packageSize: 1.5, dailyUse: null, expiry: '2027-05-01', note: '', barcode: '8594001021505'
    });
  });

  it('files a category typed into Grist by hand under Ostatní', () => {
    expect(toItem({ id: '1', category: 'zbraně', quantity: 1 }).category).toBe('other');
  });

  it('rejects a row without an id', () => {
    expect(() => toItem({ name: 'x' })).toThrow('no id');
  });
});

describe('toItemParams', () => {
  it('sends empty optional numbers as blanks so an edit clears them', () => {
    const params = toItemParams({
      name: ' Svíčky ', category: 'energy', location: '', quantity: 10,
      packageSize: null, dailyUse: null, expiry: '', note: '', barcode: ''
    });

    expect(params).toMatchObject({ name: 'Svíčky', packageSize: '', dailyUse: '', expiry: '' });
  });
});

describe('toHousehold', () => {
  it('reads the family settings row', () => {
    expect(toHousehold({ id: '1', adults: 2, children: 2, toddlers: 0, targetDays: 14 })).toEqual({
      id: '1', adults: 2, children: 2, toddlers: 0, targetDays: 14
    });
  });
});
