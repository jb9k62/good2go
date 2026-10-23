/**
 * Micro-world, rung 1 of the hashing ladder: `hash % servers`, by hand. Twelve parcels on three
 * servers, each placed by the remainder of a two-digit hash. The reader predicts how many move
 * when a fourth server joins, then sees each one that did. Rung 2 (hash-ring) is the fix, rung 3
 * (consistent-hash) runs it at scale.
 */

import { Choice, ModelNote, Predict, Steps, useSteps, type Step } from '../kit.tsx';
import { Chip, PARCELS, serverName, smallHash } from './servers.tsx';

const BEFORE = 3;
const serverOf = (key: string, servers: number) => smallHash(key) % servers;
const movedFrom = (servers: number) => PARCELS.filter((key) => serverOf(key, servers) !== serverOf(key, BEFORE));
const MOVED = movedFrom(BEFORE + 1).length;
const FIRST = PARCELS[0]!;

interface State {
  servers: number;
}

const STEPS: readonly Step<State>[] = [
  {
    state: { servers: BEFORE },
    say: (
      <>
        Twelve parcels, three cache servers. Each parcel's key is hashed to a number (two digits
        here, to keep it readable), and its server is that number <code>% 3</code>: the remainder
        after dividing by 3. <code>{FIRST}</code> hashes to {smallHash(FIRST)}, and{' '}
        {smallHash(FIRST)} % 3 = {serverOf(FIRST, 3)}, so it lives on server{' '}
        {serverName(serverOf(FIRST, 3))}.
      </>
    ),
  },
  {
    state: { servers: BEFORE + 1 },
    say: (
      <>
        A busy day is coming, so a fourth server, D, joins. The formula becomes{' '}
        <code>hash % 4</code>. Every hash stays the same.
      </>
    ),
  },
  {
    state: { servers: BEFORE + 1 },
    say: (
      <>
        {MOVED} of 12 parcels now live somewhere new. Their old servers still hold them, but
        nobody asks there any more: each is a cache miss. The trouble is that the number of
        servers is in the formula. Try other counts below.
      </>
    ),
  },
];

function Columns({ servers }: { servers: number }) {
  return (
    <div className="okfw-servers okfw-servers-grid">
      {Array.from({ length: servers }, (_, node) => (
        <section key={node} aria-label={`Server ${serverName(node)}`}>
          <h4>
            Server {serverName(node)} <small className="okfw-muted">remainder {node}</small>
          </h4>
          <div className="okfw-chips">
            {PARCELS.filter((key) => serverOf(key, servers) === node).map((key) => {
              const was = serverOf(key, BEFORE);
              return (
                <Chip
                  key={key}
                  node={node}
                  moved={servers !== BEFORE && was !== node}
                  from={was}
                  label={
                    <>
                      {key} <span className="okfw-muted">· {smallHash(key)}</span>
                    </>
                  }
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function HashModulo() {
  const walk = useSteps(STEPS);
  const { servers } = walk.state;
  const predicting = walk.step !== null && walk.index === 1;
  const moved = movedFrom(servers).length;

  return (
    <div>
      <Columns servers={predicting ? BEFORE : servers} />
      <Steps walk={walk} />
      {predicting ? (
        <Predict
          question="With hash % 4, how many of the 12 parcels are now on a different server?"
          options={[
            { id: 'few', label: 'About 3 (a quarter)' },
            { id: 'half', label: 'About 6 (half)' },
            { id: 'most', label: 'About 9 (most)' },
          ]}
          answer="most"
          why={
            <>
              {MOVED} of 12 moved. Same hash, new divisor, new remainder: a parcel only stays if its
              remainder happens to come out the same.
            </>
          }
        >
          <Columns servers={servers} />
        </Predict>
      ) : (
        servers !== BEFORE && (
          <p className="okfw-answer" data-testid="modulo-moved" data-seen="false">
            Going from 3 servers to {servers}: <strong>{moved} of 12</strong> parcels moved (marked
            “was …”).
          </p>
        )
      )}
      {walk.index === walk.count - 1 || walk.step === null ? (
        <Choice
          label="Servers"
          options={[2, 3, 4, 5, 6].map((n) => ({ id: String(n), label: `${n} servers` }))}
          value={String(servers)}
          onChange={(id) => walk.set({ servers: Number(id) })}
        />
      ) : null}
      <ModelNote>
        A model: the key's hash from <code>models/ring.ts</code>, cut to two digits so the
        remainders are easy to check. A real cache uses the whole hash; the remainders change in
        the same way.
      </ModelNote>
    </div>
  );
}
