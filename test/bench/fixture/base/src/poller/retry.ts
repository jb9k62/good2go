import { BACKOFF_BASE_MS, BACKOFF_CAP_MS, RETRIES } from './config.ts';

/** Capped exponential delay with full jitter; `random` returns a number in [0, 1). */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

export async function retrying<T>(run: () => Promise<T>, sleep: (ms: number) => Promise<void>, random?: () => number): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      last = err;
      if (attempt < RETRIES) await sleep(backoffMs(attempt, random));
    }
  }
  throw last;
}
