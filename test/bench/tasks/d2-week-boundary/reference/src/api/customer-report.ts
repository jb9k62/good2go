import type { Parcel } from '../carriers/types.ts';
import { weeklyTotals, type WeekTotal } from '../report/rollup.ts';
import { isoDay, weekStartUtc } from '../report/week.ts';
import { formatLocal, localParts } from '../util/zones.ts';

export interface CustomerWeek {
  weekStart: string;
  parcels: Array<{ id: string; deliveredLocal: string }>;
}

export interface CustomerReport {
  zone: string;
  weeks: CustomerWeek[];
  totals: WeekTotal[];
}

/** Monday of the week the delivery fell in on the customer's own calendar. */
function localWeekKey(deliveredAt: string, zone: string): string {
  const p = localParts(new Date(deliveredAt), zone);
  return isoDay(weekStartUtc(new Date(Date.UTC(p.year, p.month - 1, p.day))));
}

export function renderCustomerReport(parcels: Parcel[], options: { zone?: string } = {}): CustomerReport {
  const zone = options.zone ?? 'UTC';
  const weeks = new Map<string, CustomerWeek>();
  for (const p of parcels) {
    if (p.deliveredAt === undefined) continue;
    const key = localWeekKey(p.deliveredAt, zone);
    const week = weeks.get(key) ?? { weekStart: key, parcels: [] };
    week.parcels.push({ id: p.id, deliveredLocal: formatLocal(p.deliveredAt, zone) });
    weeks.set(key, week);
  }
  return {
    zone,
    weeks: [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    totals: weeklyTotals(parcels),
  };
}
