import type { Status } from './types.ts';

const MAP: Record<string, Status> = {
  CREATED: 'created',
  LABEL_PRINTED: 'created',
  IN_TRANSIT: 'in_transit',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  FAILED_ATTEMPT: 'exception',
  RETURNED: 'exception',
};

export function mapStatus(raw: string): Status {
  return MAP[raw.trim().toUpperCase().replace(/[-\s]/g, '_')] ?? 'unknown';
}
