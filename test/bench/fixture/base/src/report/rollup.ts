import type { Parcel } from '../carriers/types.ts';
import { isoDay, weekStartUtc } from './week.ts';

export interface WeekTotal {
  weekStart: string;
  count: number;
  byCarrier: Record<string, number>;
}

/** Counts delivered parcels per week and per carrier, oldest week first. */
export function weeklyTotals(parcels: Parcel[]): WeekTotal[] {
  const weeks = new Map<string, WeekTotal>();
  for (const p of parcels) {
    if (p.deliveredAt === undefined) continue;
    const key = isoDay(weekStartUtc(new Date(p.deliveredAt)));
    const week = weeks.get(key) ?? { weekStart: key, count: 0, byCarrier: {} };
    week.count += 1;
    week.byCarrier[p.carrier] = (week.byCarrier[p.carrier] ?? 0) + 1;
    weeks.set(key, week);
  }
  return [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
