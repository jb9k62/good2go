/**
 * Micro-world, rung 1 of the Bloom filter ladder: the mechanism, by hand. Sixteen bits and three
 * hashes, few enough to follow every bit. The walkthrough adds four keys one at a time, then asks
 * about one that was added and one that was not; after that the reader adds and asks their own.
 * Rung 2 (bloom-stranger) shows where it goes wrong, rung 3 (bloom-filter) sizes it.
 */

import { useState } from 'react';
import { ModelNote, Steps, useSteps, type Step } from '../kit.tsx';
import { and, BitRow, bitsOf, litBy, SMALL_BITS, SMALL_HASHES } from './bits.tsx';

interface State {
  added: readonly string[];
  ask: string | null;
}

const KEYS = ['evt-1', 'evt-2', 'evt-3', 'evt-4'] as const;

function sayAdd(before: readonly string[], key: string) {
  const bits = bitsOf(key);
  const by = litBy(before);
  const shared = bits.filter((bit) => by[bit]!.length > 0);
  return (
    <>
      Add <code>{key}</code>. Its three hashes give bits {and(bits)}; set them to 1.{' '}
      {shared.length === 0
        ? 'None was lit before.'
        : `${shared.length > 1 ? 'Bits' : 'Bit'} ${and(shared)} ${shared.length > 1 ? 'were' : 'was'} already lit by ${and([...new Set(shared.flatMap((bit) => by[bit]!))])}, and ${shared.length > 1 ? 'stay' : 'stays'} lit: keys share bits.`}
    </>
  );
}

const litAfter = (keys: readonly string[]) => litBy(keys).map((by) => by.length > 0);
/** The first key that was never added and has a dark bit, so the answer is a certain "no". */
const STRANGER = (() => {
  const lit = litAfter(KEYS);
  for (let i = KEYS.length + 1; ; i++) {
    const key = `evt-${i}`;
    if (bitsOf(key).some((bit) => !lit[bit])) return key;
  }
})();
const strangerDark = bitsOf(STRANGER).filter((bit) => !litAfter(KEYS)[bit]);

const STEPS: readonly Step<State>[] = [
  {
    state: { added: [], ask: null },
    say: (
      <>
        A Bloom filter starts as a row of bits, all 0. This one has {SMALL_BITS} bits, and turns
        each key into {SMALL_HASHES} bit numbers with {SMALL_HASHES} different hashes.
      </>
    ),
  },
  ...KEYS.map((key, i) => ({
    state: { added: KEYS.slice(0, i + 1), ask: null },
    say: sayAdd(KEYS.slice(0, i), key),
  })),
  {
    state: { added: KEYS, ask: 'evt-2' },
    say: (
      <>
        Now ask: have we seen <code>evt-2</code>? Hash it the same way: bits {and(bitsOf('evt-2'))}.
        All are lit, so the answer is <strong>“probably yes”</strong>.
      </>
    ),
  },
  {
    state: { added: KEYS, ask: STRANGER },
    say: (
      <>
        Ask about <code>{STRANGER}</code>, which was never added: bits {and(bitsOf(STRANGER))}.{' '}
        {strangerDark.length > 1 ? 'Bits' : 'Bit'} {and(strangerDark)}{' '}
        {strangerDark.length > 1 ? 'are' : 'is'} dark, so the answer is{' '}
        <strong>“definitely not”</strong>. A dark bit is proof, because adding a key never turns a
        bit off.
      </>
    ),
  },
  {
    state: { added: KEYS, ask: null },
    say: (
      <>
        That is the whole mechanism: add sets bits, ask checks them. The filter never stores the
        keys themselves. Your turn: add a key or ask about one below.
      </>
    ),
  },
];

export default function BloomAdd() {
  const walk = useSteps(STEPS);
  const [draft, setDraft] = useState('evt-9');
  const { added, ask } = walk.state;
  const lit = litAfter(added);
  const focusKey = ask ?? added.at(-1) ?? null;
  const focus = focusKey ? bitsOf(focusKey) : [];
  const seen = ask !== null && bitsOf(ask).every((bit) => lit[bit]);
  const key = draft.trim();

  return (
    <div>
      <BitRow lit={lit} focus={focus} label={`${lit.filter(Boolean).length} of ${SMALL_BITS} bits set`} />
      <p className="okfw-reason">
        {focusKey
          ? `Ringed: the bits for ${focusKey}.`
          : 'Each square is one bit: 0 is dark, 1 is lit.'}
      </p>
      <Steps walk={walk} />

      {ask !== null && (
        <p data-testid="bloom-add-answer" className="okfw-answer" data-seen={seen}>
          <code>{ask}</code>:{' '}
          {seen ? (
            <strong>probably seen</strong>
          ) : (
            <strong>definitely not seen</strong>
          )}
          {added.includes(ask) ? ' (it was added)' : ' (it was never added)'}
        </p>
      )}

      <h4>Keys added</h4>
      <ul className="okfw-plain okfw-keylist">
        {added.length === 0 && <li className="okfw-muted">None yet.</li>}
        {added.map((name) => (
          <li key={name} data-focus={name === focusKey || undefined}>
            <code>{name}</code> → bits {and(bitsOf(name))}
          </li>
        ))}
      </ul>

      <div className="okfw-row okfw-try">
        <input
          type="text"
          aria-label="Key"
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
        />{' '}
        <button
          type="button"
          disabled={key === ''}
          onClick={() => walk.set({ added: added.includes(key) ? added : [...added, key], ask: null })}
        >
          Add it
        </button>{' '}
        <button type="button" disabled={key === ''} onClick={() => walk.set({ ask: key })}>
          Ask about it
        </button>
      </div>
      <ModelNote>
        A model: the same hashing as <code>models/bloom.ts</code>, on a filter far smaller than any
        real one, so every bit fits on screen.
      </ModelNote>
    </div>
  );
}
