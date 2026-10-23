/**
 * A short row of bits, big enough to read each one and numbered underneath, for the first rungs
 * of the Bloom filter ladder (bloom-add, bloom-stranger). The full-size filter draws its own,
 * denser grid.
 */

import { positions } from '../models/bloom.ts';

export const SMALL_BITS = 16;
export const SMALL_HASHES = 3;

/** The bits `key` maps to in the small filter. */
export const bitsOf = (key: string): number[] => positions(key, SMALL_BITS, SMALL_HASHES);

/** Which keys lit each bit, after adding `keys` in order. */
export function litBy(keys: readonly string[]): string[][] {
  const by = Array.from({ length: SMALL_BITS }, () => [] as string[]);
  for (const key of keys) for (const bit of new Set(bitsOf(key))) by[bit]!.push(key);
  return by;
}

/** "3", "3 and 9", "3, 9 and 12". */
export function and(items: readonly (string | number)[]): string {
  const text = items.map(String);
  return text.length < 2 ? (text[0] ?? '') : `${text.slice(0, -1).join(', ')} and ${text.at(-1)}`;
}

export function BitRow({
  lit,
  focus = [],
  cleared = [],
  label,
}: {
  lit: readonly boolean[];
  /** Bits the current step is about: ringed. */
  focus?: readonly number[];
  /** Bits just turned off: struck through. */
  cleared?: readonly number[];
  label: string;
}) {
  const ringed = new Set(focus);
  const off = new Set(cleared);
  return (
    <ol className="okfw-bitrow" role="img" aria-label={label}>
      {lit.map((on, index) => (
        <li
          key={index}
          data-lit={on}
          data-focus={ringed.has(index) || undefined}
          data-cleared={off.has(index) || undefined}
        >
          <span>{on ? 1 : 0}</span>
          <small>{index}</small>
        </li>
      ))}
    </ol>
  );
}
