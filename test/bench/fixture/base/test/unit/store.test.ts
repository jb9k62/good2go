import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ParcelStore } from '../../src/poller/store.ts';

test('delivered updates record when', () => {
  const store = new ParcelStore();
  store.add({ id: 'p1', carrier: 'vela', tracking: 'VLAB12CD34', status: 'in_transit' });
  store.update('p1', 'delivered', '2026-10-05T09:30:00Z');
  assert.equal(store.get('p1')?.deliveredAt, '2026-10-05T09:30:00Z');
});
