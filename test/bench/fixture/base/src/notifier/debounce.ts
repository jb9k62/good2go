export const DEBOUNCE_MS = 30_000;

/** True when enough time has passed since the last message for this parcel. */
export function shouldSend(lastSentAt: number | undefined, now: number): boolean {
  return lastSentAt === undefined || now - lastSentAt >= DEBOUNCE_MS;
}
