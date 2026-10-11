// Pure statistics for the benchmark report: medians, ranges, deltas and grouping. No I/O, no
// imports beyond types, so every function here is unit-tested directly.

/** Median of the finite numbers in `values`; null when there are none. */
export function median(values: readonly (number | null | undefined)[]): number | null {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface Range {
  min: number;
  max: number;
}

/** Smallest and largest finite value; null when there are none. */
export function range(values: readonly (number | null | undefined)[]): Range | null {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (xs.length === 0) return null;
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

/** `to - from`; null when either side is missing. */
export function absDelta(from: number | null, to: number | null): number | null {
  if (from === null || to === null) return null;
  return to - from;
}

/**
 * Percent change from `from` to `to`. A zero baseline has no percent: 0 to 0 is 0, anything
 * from 0 is null (it would be infinite).
 */
export function percentDelta(from: number | null, to: number | null): number | null {
  if (from === null || to === null) return null;
  if (from === 0) return to === 0 ? 0 : null;
  return ((to - from) / Math.abs(from)) * 100;
}

/** Pass count over total; `rate` is null when there were no runs at all. */
export interface PassRate {
  passing: number;
  total: number;
  rate: number | null;
}

export function passRate(passes: readonly boolean[]): PassRate {
  const passing = passes.filter(Boolean).length;
  return { passing, total: passes.length, rate: passes.length === 0 ? null : passing / passes.length };
}

/** Groups `items` by `key`, keeping first-seen order of the keys. */
export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = groups.get(k);
    if (bucket) bucket.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/** Formats a number with a fixed number of decimals, or an en dash when it is missing. */
export function fmt(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return value.toFixed(decimals);
}

/** Formats a signed value, e.g. `+1.20` or `-0.50`; an en dash when missing. */
export function fmtSigned(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  const s = value.toFixed(decimals);
  return value > 0 ? `+${s}` : s;
}

/** Formats a percentage such as `+12.5%`; an en dash when missing. */
export function fmtPct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  const s = `${value.toFixed(decimals)}%`;
  return value > 0 ? `+${s}` : s;
}
