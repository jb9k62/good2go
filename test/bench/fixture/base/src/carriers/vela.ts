import { mapStatus } from './status.ts';
import type { CarrierEvent } from './types.ts';

export interface VelaPayload {
  awb: string;
  state: string;
  ts: string;
}

export function parseVela(payload: VelaPayload): CarrierEvent {
  return { tracking: payload.awb, status: mapStatus(payload.state), at: payload.ts };
}
