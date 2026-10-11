export interface Clock {
  now(): Date;
}

export function fixedClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

export const systemClock: Clock = { now: () => new Date() };
