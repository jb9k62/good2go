import { describe, expect, it } from 'vitest';
import { buildRing, keyNames, owner, place, shares } from './ring.ts';

describe('ring', () => {
  it('gives every key an owner, the same one each time', () => {
    const ring = buildRing(4, 8);
    for (const key of keyNames(50)) {
      const first = owner(ring, key);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThan(4);
      expect(owner(ring, key)).toBe(first);
    }
  });

  it('moves about 1/(n+1) of keys on the ring but most with modulo hashing', () => {
    const p = place(4, 64, 4000);
    expect(p.movedRing).toBeLessThan(0.35);
    expect(p.movedRing).toBeGreaterThan(0.1);
    expect(p.movedModulo).toBeGreaterThan(0.65);
  });

  it('only ever moves keys onto the new node', () => {
    const before = buildRing(4, 16);
    const after = buildRing(5, 16);
    for (const key of keyNames(500)) {
      const was = owner(before, key);
      const now = owner(after, key);
      expect(now === was || now === 4).toBe(true);
    }
  });

  it('balances better with more virtual nodes', () => {
    const few = place(5, 1, 5000).imbalance;
    const many = place(5, 128, 5000).imbalance;
    expect(many).toBeLessThan(few);
    expect(many).toBeLessThan(1.3);
  });

  it('splits the whole ring between the nodes, more evenly with virtual nodes', () => {
    const one = shares(buildRing(3, 1), 3);
    const four = shares(buildRing(3, 4), 3);
    expect(one.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(four.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    // The hash-ring widget quotes these: 70%, 26%, 4% with one point each; 34%, 31%, 35% with four.
    expect(one.map((s) => Math.round(s * 100))).toEqual([70, 26, 4]);
    expect(four.map((s) => Math.round(s * 100))).toEqual([34, 31, 35]);
    expect(shares(buildRing(1, 1), 1)).toEqual([1]);
  });

  it('has no owner on an empty ring', () => {
    expect(owner([], 'x')).toBe(-1);
  });
});
