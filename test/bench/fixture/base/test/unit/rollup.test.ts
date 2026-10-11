import assert from 'node:assert/strict';
import { test } from 'node:test';
import { weeklyTotals } from '../../src/report/rollup.ts';

const parcels = [
  { id: 'a', carrier: 'vela', tracking: 'x', status: 'delivered' as const, deliveredAt: '2026-10-06T10:00:00Z' },
  { id: 'b', carrier: 'northpost', tracking: 'y', status: 'delivered' as const, deliveredAt: '2026-10-07T10:00:00Z' },
  { id: 'c', carrier: 'vela', tracking: 'z', status: 'in_transit' as const },
];

test('counts delivered parcels per week and carrier', () => {
  assert.deepEqual(weeklyTotals(parcels), [{ weekStart: '2026-10-05', count: 2, byCarrier: { vela: 1, northpost: 1 } }]);
});
