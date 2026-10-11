import type { Parcel } from '../carriers/types.ts';
import { weeklyTotals, type WeekTotal } from '../report/rollup.ts';
import { isoDay, weekStartUtc } from '../report/week.ts';
import { formatLocal } from '../util/zones.ts';

export interface CustomerWeek {
  weekStart: string;
  parcels: Array<{ id: string; deliveredLocal: string }>;
}

export interface CustomerReport {
  zone: string;
  weeks: CustomerWeek[];
  totals: WeekTotal[];
}

export function renderCustomerReport(parcels: Parcel[], options: { zone?: string } = {}): CustomerReport {
  const zone = options.zone ?? 'UTC';
  const weeks = new Map<string, CustomerWeek>();
  for (const p of parcels) {
    if (p.deliveredAt === undefined) continue;
    const key = isoDay(weekStartUtc(new Date(p.deliveredAt)));
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
