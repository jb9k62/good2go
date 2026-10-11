import type { CarrierEvent } from './types.ts';
import { mapStatus } from './status.ts';

const RAW: Record<string, { state: string; at: string }> = {
  PH123456789: { state: 'IN_TRANSIT', at: '2026-10-05T08:00:00Z' },
  VLAB12CD34: { state: 'DELIVERED', at: '2026-10-05T09:30:00Z' },
  NP123456789012: { state: 'OUT_FOR_DELIVERY', at: '2026-10-05T07:15:00Z' },
  QF12345678: { state: 'OUT-FOR-DELIVERY', at: '2026-10-05T07:45:00Z' },
};

export function fakeFetch(tracking: string): CarrierEvent {
  const raw = RAW[tracking];
  if (raw === undefined) return { tracking, status: 'unknown', at: '2026-10-05T00:00:00Z' };
  return { tracking, status: mapStatus(raw.state), at: raw.at };
}
