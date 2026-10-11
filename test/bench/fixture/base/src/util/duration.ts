/** Formats whole seconds as `45s`, `3m 05s` or `1h 02m`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('seconds must be a non-negative number');
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

export function toMillis(seconds: number): number {
  return Math.round(seconds * 1000);
}
