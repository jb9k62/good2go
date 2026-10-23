/**
 * Micro-world, rung 2 of the Bloom filter ladder: where it goes wrong, and why. The same sixteen
 * bits as rung 1, with five keys in. The reader predicts the answer for a key that was never
 * added (a false positive, and whose bits made it), then whether a key can be deleted by turning
 * its bits off (no: that erases other keys too).
 */

import { ModelNote, Predict, Steps, useSteps, type Step } from '../kit.tsx';
import { and, BitRow, bitsOf, litBy, SMALL_BITS } from './bits.tsx';

const ADDED = ['evt-1', 'evt-2', 'evt-3', 'evt-4', 'evt-5'] as const;
const BY = litBy(ADDED);
const LIT = BY.map((keys) => keys.length > 0);

/** The first key never added whose bits are all lit: a false positive. */
const STRANGER = (() => {
  for (let i = ADDED.length + 1; ; i++) {
    const key = `evt-${i}`;
    if (bitsOf(key).every((bit) => LIT[bit])) return key;
  }
})();

/** The first added key that shares a bit with another, so turning its bits off breaks that one. */
const VICTIM = ADDED.find((key) => bitsOf(key).some((bit) => BY[bit]!.length > 1))!;
const LEFT = ADDED.filter((key) => key !== VICTIM);
const AFTER = LIT.map((on, bit) => on && !bitsOf(VICTIM).includes(bit));
const LOST = LEFT.filter((key) => bitsOf(key).some((bit) => !AFTER[bit]));

interface State {
  view: 'stranger' | 'delete';
}

const STEPS: readonly Step<State>[] = [
  {
    state: { view: 'stranger' },
    say: (
      <>
        Five keys are in, <code>evt-1</code> to <code>evt-5</code>, and {LIT.filter(Boolean).length}{' '}
        of {SMALL_BITS} bits are lit. Now a key that was never added: <code>{STRANGER}</code>. Its
        bits are ringed.
      </>
    ),
  },
  {
    state: { view: 'delete' },
    say: (
      <>
        <code>{VICTIM}</code> is old and should be forgotten. The obvious way: turn its bits (
        {and(bitsOf(VICTIM))}) back to 0.
      </>
    ),
  },
];

export default function BloomStranger() {
  const walk = useSteps(STEPS);
  const { view } = walk.state;

  return (
    <div>
      {view === 'stranger' ? (
        <>
          <BitRow lit={LIT} focus={bitsOf(STRANGER)} label={`The filter after five keys; ${STRANGER}'s bits ringed`} />
          <Steps walk={walk} />
          <Predict
            key="stranger"
            question={
              <>
                <code>{STRANGER}</code> was never added. What does the filter answer?
              </>
            }
            options={[
              { id: 'no', label: 'Definitely not seen' },
              { id: 'yes', label: 'Probably seen' },
            ]}
            answer="yes"
            why={<>Every one of its bits is lit, so it looks exactly like a key that was added.</>}
          >
            <ul className="okfw-plain okfw-keylist" data-testid="stranger-bits">
              {bitsOf(STRANGER).map((bit) => (
                <li key={bit}>
                  bit {bit} was lit by {and(BY[bit]!)}
                </li>
              ))}
            </ul>
            <p className="okfw-answer" data-seen="false">
              A <strong>false positive</strong>: other keys lit its bits. The filter keeps no record
              of whose bits they were, so it cannot tell. The fuller the row, the more often this
              happens.
            </p>
          </Predict>
        </>
      ) : (
        <>
          <BitRow lit={LIT} focus={bitsOf(VICTIM)} label={`The filter after five keys; ${VICTIM}'s bits ringed`} />
          <Steps walk={walk} />
          <Predict
            key="delete"
            question={
              <>
                Turn off <code>{VICTIM}</code>'s bits, then ask about {and(LOST)}, which{' '}
                {LOST.length > 1 ? 'are' : 'is'} still meant to be in. What does the filter answer?
              </>
            }
            options={[
              { id: 'yes', label: 'Probably seen, as before' },
              { id: 'no', label: 'Definitely not seen' },
            ]}
            answer="no"
            why={
              <>
                {LOST.map((key, i) => {
                  const shared = bitsOf(key).filter((bit) => bitsOf(VICTIM).includes(bit));
                  return (
                    <span key={key}>
                      {i > 0 && ' '}
                      <code>{key}</code> shared bit {and(shared)} with it.
                    </span>
                  );
                })}
              </>
            }
          >
            <BitRow
              lit={AFTER}
              cleared={bitsOf(VICTIM)}
              focus={[...new Set(LOST.flatMap(bitsOf))]}
              label={`The filter after turning off ${VICTIM}'s bits`}
            />
            <p className="okfw-answer" data-seen="false" data-testid="delete-result">
              {and(LOST)} now {LOST.length > 1 ? 'look' : 'looks'} never added: a{' '}
              <strong>false negative</strong>, the one mistake a Bloom filter promises never to
              make. So a plain Bloom filter has no delete. To forget, rebuild it.
            </p>
          </Predict>
        </>
      )}
      <ModelNote>
        A model: the same hashing as <code>models/bloom.ts</code>, on {SMALL_BITS} bits. A real
        filter is far bigger, but it fills up the same way.
      </ModelNote>
    </div>
  );
}
