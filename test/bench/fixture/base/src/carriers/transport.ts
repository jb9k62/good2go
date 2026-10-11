import { fakeFetch } from './fake.ts';
import type { CarrierEvent } from './types.ts';

export type Fetcher = (carrier: string, tracking: string, signal: AbortSignal) => Promise<CarrierEvent>;

/** The fixture has no network: real carriers are out of scope, the fakes answer instead. */
export const defaultFetch: Fetcher = async (_carrier, tracking) => {
  if (process.env.PARCEL_FAKE_CARRIERS === '1') return fakeFetch(tracking);
  throw new Error('no carrier transport is configured');
};
