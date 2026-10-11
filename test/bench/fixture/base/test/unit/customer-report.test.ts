import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCustomerReport } from '../../src/api/customer-report.ts';

const parcels = [
  { id: 'a', carrier: 'vela', tracking: 'x', status: 'delivered' as const, deliveredAt: '2026-10-06T10:00:00Z' },
  { id: 'b', carrier: 'vela', tracking: 'y', status: 'delivered' as const, deliveredAt: '2026-09-30T10:00:00Z' },
];

test('groups parcels into weeks, oldest first', () => {
  const report = renderCustomerReport(parcels);
  assert.deepEqual(report.weeks.map((w) => w.weekStart), ['2026-09-28', '2026-10-05']);
  assert.equal(report.zone, 'UTC');
});

test('shows delivery times in the customer zone', () => {
  const report = renderCustomerReport(parcels, { zone: 'Europe/London' });
  assert.equal(report.weeks[1].parcels[0].deliveredLocal, '2026-10-06 11:00');
});
