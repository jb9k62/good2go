import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listParcels } from '../../src/api/parcels.ts';

const many = Array.from({ length: 120 }, (_, i) => ({ id: `p${i}`, carrier: 'vela', tracking: 'x', status: 'created' as const }));

test('pages are 20 by default', () => {
  assert.equal(listParcels(many).length, 20);
});

test('second page starts after the first', () => {
  assert.equal(listParcels(many, 2, 20)[0].id, 'p20');
});
