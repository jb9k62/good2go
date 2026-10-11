export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function localParts(date: Date, zone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const get = (type: string): number => Number(fmt.formatToParts(date).find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** `2026-10-05 09:30` in the given zone. */
export function formatLocal(iso: string, zone: string): string {
  const p = localParts(new Date(iso), zone);
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${p.year}-${two(p.month)}-${two(p.day)} ${two(p.hour)}:${two(p.minute)}`;
}
