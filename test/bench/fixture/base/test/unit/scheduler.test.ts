import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dueParcels } from '../../src/poller/scheduler.ts';

test('delivered parcels are never due', () => {
  const parcels = [{ id: 'a', carrier: 'vela', tracking: 'x', status: 'delivered' as const }];
  assert.deepEqual(dueParcels(parcels, new Map(), 1e9), []);
});

test('recently polled parcels wait', () => {
  const parcels = [{ id: 'a', carrier: 'vela', tracking: 'x', status: 'in_transit' as const }];
  assert.equal(dueParcels(parcels, new Map([['a', 1e9 - 1000]]), 1e9).length, 0);
  assert.equal(dueParcels(parcels, new Map(), 1e9).length, 1);
});
