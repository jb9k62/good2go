import { mapStatus } from './status.ts';
import type { CarrierEvent } from './types.ts';

export interface NorthpostPayload {
  parcel: { ref: string };
  event: { code: string; occurredAt: string };
}

export function parseNorthpost(payload: NorthpostPayload): CarrierEvent {
  return { tracking: payload.parcel.ref, status: mapStatus(payload.event.code), at: payload.event.occurredAt };
}
