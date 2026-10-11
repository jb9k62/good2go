// Money and order: the spending guard, the plan's worst case and the seeded shuffle.
// Pure; no I/O, so the runner's tests can pin it.

/** mulberry32: a small seeded PRNG. The same seed always gives the same sequence. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shuffled copy (Fisher-Yates); the input is left alone. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rand = prng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * `--max-budget-usd` is checked by Claude Code between turns, so a run can finish one turn past
 * its allowance. Every reservation and the dry run's worst case therefore use the allowance times
 * this margin, not the allowance itself.
 */
export const OVERSHOOT = 1.5;

/** What the runner holds back for one run: its allowance plus the margin for a last turn. */
export const reserveUsd = (perRunUsd: number): number => round(perRunUsd * OVERSHOOT);

/** What a plan could cost at most: every run spending its reservation. */
export function worstCaseUsd(runs: number, perRunUsd: number): number {
  return round(runs * reserveUsd(perRunUsd));
}

export const round = (usd: number): number => Math.round(usd * 1e6) / 1e6;

/**
 * Guards the total budget. A run may start only if what has been spent, plus every run in flight
 * at its reservation (the allowance times OVERSHOOT), plus this run's reservation, stays within the budget: so concurrency can
 * never carry the total past it.
 */
export class Budget {
  readonly totalUsd: number;
  readonly perRunUsd: number;
  spentUsd: number;
  inFlight = 0;

  constructor(totalUsd: number, perRunUsd: number, spentUsd = 0) {
    this.totalUsd = totalUsd;
    this.perRunUsd = perRunUsd;
    this.spentUsd = spentUsd;
  }

  canStart(): boolean {
    return round(this.spentUsd + (this.inFlight + 1) * reserveUsd(this.perRunUsd)) <= this.totalUsd;
  }

  start(): void {
    this.inFlight++;
  }

  finish(costUsd: number): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.spentUsd = round(this.spentUsd + costUsd);
  }

  reason(): string {
    return `budget: $${this.spentUsd.toFixed(4)} spent, $${reserveUsd(this.perRunUsd).toFixed(2)} reserved per run ($${this.perRunUsd.toFixed(2)} plus a margin for a last turn) would pass the $${this.totalUsd.toFixed(2)} total`;
  }
}
