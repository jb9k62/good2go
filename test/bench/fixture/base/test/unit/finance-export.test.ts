import assert from 'node:assert/strict';
import { test } from 'node:test';
import { financeCsv } from '../../src/report/finance-export.ts';

test('one row per week', () => {
  const csv = financeCsv([{ id: 'a', carrier: 'vela', tracking: 'x', status: 'delivered', deliveredAt: '2026-10-06T10:00:00Z' }]);
  assert.equal(csv, 'week_start,delivered\n2026-10-05,1\n');
});
