import type { Fetcher } from '../carriers/transport.ts';
import type { Parcel } from '../carriers/types.ts';
import { retrying } from './retry.ts';
import type { ParcelStore } from './store.ts';
import { withTimeout } from './timeouts.ts';

export interface PollOptions {
  fetch: Fetcher;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls each parcel once (with retries) and writes the answer to the store. Returns the ids that failed. */
export async function pollParcels(store: ParcelStore, parcels: Parcel[], options: PollOptions): Promise<string[]> {
  const failed: string[] = [];
  for (const parcel of parcels) {
    try {
      const event = await retrying(
        () => withTimeout((signal) => options.fetch(parcel.carrier, parcel.tracking, signal)),
        options.sleep ?? realSleep,
      );
      store.update(parcel.id, event.status, event.at);
    } catch {
      failed.push(parcel.id);
    }
  }
  return failed;
}
