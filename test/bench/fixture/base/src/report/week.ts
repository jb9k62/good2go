const DAY_MS = 86_400_000;

/** Monday 00:00 UTC of the week containing `date`. */
export function weekStartUtc(date: Date): Date {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const sinceMonday = (new Date(midnight).getUTCDay() + 6) % 7;
  return new Date(midnight - sinceMonday * DAY_MS);
}

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
