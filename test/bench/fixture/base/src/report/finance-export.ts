import type { Parcel } from '../carriers/types.ts';
import { weeklyTotals } from './rollup.ts';

export function financeCsv(parcels: Parcel[]): string {
  const rows = weeklyTotals(parcels).map((w) => `${w.weekStart},${w.count}`);
  return ['week_start,delivered', ...rows].join('\n') + '\n';
}
