import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCustomerReport } from '../src/api/customer-report.ts';
import { financeCsv } from '../src/report/finance-export.ts';
import { weeklyTotals } from '../src/report/rollup.ts';
import { isoDay, weekStartUtc } from '../src/report/week.ts';

const parcel = (id: string, deliveredAt: string) => ({ id, carrier: 'vela', tracking: id, status: 'delivered' as const, deliveredAt });
// Mon 09:30, Sun 23:00 and Mon 00:30 in Pacific/Auckland (UTC+13 in October).
const parcels = [parcel('a', '2026-10-04T20:30:00Z'), parcel('b', '2026-10-11T10:00:00Z'), parcel('c', '2026-10-11T11:30:00Z')];
const weekOf = (report: ReturnType<typeof renderCustomerReport>, id: string): string | undefined =>
  report.weeks.find((w) => w.parcels.some((p) => p.id === id))?.weekStart;

test('an Auckland customer sees weeks in their own zone', () => {
  const report = renderCustomerReport(parcels, { zone: 'Pacific/Auckland' });
  assert.equal(weekOf(report, 'a'), '2026-10-05');
  assert.equal(weekOf(report, 'b'), '2026-10-05');
  assert.equal(weekOf(report, 'c'), '2026-10-12');
  assert.equal(report.weeks.reduce((n, w) => n + w.parcels.length, 0), 3);
});

test('other zones are unchanged', () => {
  const utc = renderCustomerReport(parcels);
  assert.equal(weekOf(utc, 'a'), '2026-09-28');
  assert.equal(weekOf(utc, 'c'), '2026-10-05');
  assert.equal(weekOf(renderCustomerReport(parcels, { zone: 'Europe/London' }), 'a'), '2026-09-28');
});

test('weekly totals stay UTC whatever the viewer zone', () => {
  const expected = [
    { weekStart: '2026-09-28', count: 1, byCarrier: { vela: 1 } },
    { weekStart: '2026-10-05', count: 2, byCarrier: { vela: 2 } },
  ];
  assert.deepEqual(weeklyTotals(parcels), expected);
  assert.deepEqual(renderCustomerReport(parcels, { zone: 'Pacific/Auckland' }).totals, expected);
  assert.equal(financeCsv(parcels), 'week_start,delivered\n2026-09-28,1\n2026-10-05,2\n');
});

test('the UTC week boundary itself is untouched', () => {
  assert.equal(isoDay(weekStartUtc(new Date('2026-10-04T20:30:00Z'))), '2026-09-28');
  assert.equal(weekStartUtc(new Date('2026-10-05T00:00:00Z')).toISOString(), '2026-10-05T00:00:00.000Z');
});
