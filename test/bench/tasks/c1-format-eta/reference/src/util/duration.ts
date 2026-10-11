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

export function formatEta(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) throw new RangeError('minutes must be a non-negative number');
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${String(rest).padStart(2, '0')} min`;
}
