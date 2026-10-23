/**
 * Micro-world, rung 2 of the hashing ladder: the hash ring, small enough to see every key. The
 * same twelve parcels as rung 1 sit on a circle with three servers; each parcel belongs to the
 * next server clockwise. The reader predicts how many move when server D joins (only those in
 * D's new arc), then sees why one point per server is lopsided and what virtual nodes do.
 */

import { Choice, ModelNote, Predict, Steps, useSteps, type Step } from '../kit.tsx';
import { buildRing, owner, position, RING_SIZE, shares, type Point } from '../models/ring.ts';
import { Chip, PARCELS, serverColour, serverName } from './servers.tsx';

interface State {
  servers: number;
  vnodes: number;
  /** Mark the parcels that moved when the last server joined. */
  moved: boolean;
}

const owners = (servers: number, vnodes: number) => {
  const ring = buildRing(servers, vnodes);
  return PARCELS.map((key) => owner(ring, key));
};
const movedKeys = (servers: number, vnodes: number) => {
  const before = owners(servers - 1, vnodes);
  const after = owners(servers, vnodes);
  return PARCELS.filter((_, i) => before[i] !== after[i]);
};
const percent = (share: number) => `${Math.round(share * 100)}%`;
const shareText = (servers: number, vnodes: number) =>
  shares(buildRing(servers, vnodes), servers)
    .map((share, node) => `${serverName(node)} ${percent(share)}`)
    .join(', ');

const MOVED = movedKeys(4, 1);
const ONE = shares(buildRing(3, 1), 3);
const LOADS = (vnodes: number) => [0, 1, 2].map((node) => owners(3, vnodes).filter((o) => o === node).length);
const big = ONE.indexOf(Math.max(...ONE));
const small = ONE.indexOf(Math.min(...ONE));

const STEPS: readonly Step<State>[] = [
  {
    state: { servers: 3, vnodes: 1, moved: false },
    say: (
      <>
        The same twelve parcels, now placed on a circle by their hash. The servers are hashed onto
        the same circle. A parcel belongs to the <strong>next server clockwise</strong>, so each
        server owns the coloured arc that ends at it.
      </>
    ),
  },
  {
    state: { servers: 4, vnodes: 1, moved: true },
    say: <>Server D joins. It is hashed onto the circle like the others, at one point.</>,
  },
  {
    state: { servers: 3, vnodes: 1, moved: false },
    say: (
      <>
        Fewer moves, but look at the arcs: {shareText(3, 1)}. Server {serverName(big)} owns{' '}
        {percent(ONE[big]!)} of the circle and holds {LOADS(1)[big]} of the 12 parcels; server{' '}
        {serverName(small)} owns {percent(ONE[small]!)}. One point per server lands wherever its
        hash falls.
      </>
    ),
  },
  {
    state: { servers: 3, vnodes: 4, moved: false },
    say: (
      <>
        The fix: put each server on the circle several times, as <strong>virtual nodes</strong>.
        With four points each, the arcs come to {shareText(3, 4)}. Twelve parcels are too few for
        the counts to even out ({LOADS(4).join(', ')}); the next widget does it with 2,000. Try
        other settings below.
      </>
    ),
  },
];

const R = 100;
const angle = (at: number) => (at / RING_SIZE) * 2 * Math.PI - Math.PI / 2;
const xy = (at: number, r = R) => [r * Math.cos(angle(at)), r * Math.sin(angle(at))] as const;

/** Each point's arc: from the previous point clockwise to it. */
function arcPath(from: number, to: number) {
  const span = (to - from + RING_SIZE) % RING_SIZE || RING_SIZE;
  if (span === RING_SIZE) return `M 0 ${-R} A ${R} ${R} 0 1 1 0 ${R} A ${R} ${R} 0 1 1 0 ${-R}`;
  const [x0, y0] = xy(from);
  const [x1, y1] = xy(to);
  return `M ${x0} ${y0} A ${R} ${R} 0 ${span > RING_SIZE / 2 ? 1 : 0} 1 ${x1} ${y1}`;
}

function Ring({ servers, vnodes, moved }: State) {
  const ring: Point[] = buildRing(servers, vnodes);
  const own = owners(servers, vnodes);
  const shifted = new Set(moved ? movedKeys(servers, vnodes) : []);
  const newcomer = moved ? servers - 1 : -1;
  return (
    <div className="okfw-columns okfw-ringrow">
      <svg
        className="okfw-ring okfw-ring-big"
        viewBox="-135 -135 270 270"
        role="img"
        aria-label={`A ring with ${servers} servers and ${PARCELS.length} parcels`}
      >
        {ring.map((point, i) => (
          <path
            key={`arc-${i}`}
            d={arcPath(ring[(i - 1 + ring.length) % ring.length]!.at, point.at)}
            className="okfw-arc"
            data-focus={point.node === newcomer || undefined}
            stroke={serverColour(point.node)}
          />
        ))}
        {PARCELS.map((key, i) => {
          const [x, y] = xy(position(key), R - 18);
          return (
            <circle
              key={key}
              cx={x}
              cy={y}
              r={4.5}
              className="okfw-keydot"
              data-moved={shifted.has(key) || undefined}
              fill={serverColour(own[i]!)}
            >
              <title>{key}</title>
            </circle>
          );
        })}
        {ring.map((point, i) => {
          const [x, y] = xy(point.at);
          const [lx, ly] = xy(point.at, R + 20);
          return (
            <g key={`pt-${i}`}>
              <circle cx={x} cy={y} r={6} fill={serverColour(point.node)} className="okfw-serverdot" />
              {vnodes === 1 && (
                <text x={lx} y={ly} className="okfw-ring-label" textAnchor="middle" dominantBaseline="middle">
                  {serverName(point.node)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="okfw-servers okfw-servers-list">
        {Array.from({ length: servers }, (_, node) => (
          <section key={node} aria-label={`Server ${serverName(node)}`}>
            <h4>
              <span className="okfw-swatch" style={{ background: serverColour(node) }} /> Server{' '}
              {serverName(node)}{' '}
              <small className="okfw-muted">{percent(shares(ring, servers)[node]!)} of the circle</small>
            </h4>
            <div className="okfw-chips">
              {PARCELS.filter((_, i) => own[i] === node).map((key) => (
                <Chip
                  key={key}
                  label={key}
                  node={node}
                  moved={shifted.has(key)}
                  from={shifted.has(key) ? owners(servers - 1, vnodes)[PARCELS.indexOf(key)] : undefined}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function HashRing() {
  const walk = useSteps(STEPS);
  const state = walk.state;
  const predicting = walk.step !== null && walk.index === 1;
  const free = walk.step === null || walk.index === walk.count - 1;

  return (
    <div>
      <Ring {...(predicting ? { servers: 3, vnodes: 1, moved: false } : state)} />
      <p className="okfw-reason">Small dots are parcels; large dots are servers. Each arc's colour is the server that owns it.</p>
      <Steps walk={walk} />
      {predicting && (
        <Predict
          question="How many of the 12 parcels now belong to a different server?"
          options={[
            { id: 'few', label: 'About 3 (a quarter)' },
            { id: 'half', label: 'About 6 (half)' },
            { id: 'most', label: 'About 9 (most)' },
          ]}
          answer="few"
          why={
            <>
              {MOVED.length} of 12 moved ({MOVED.join(', ')}), and every one of them went to D. D
              took over one arc; nothing moved between A, B and C. With <code>hash % servers</code>{' '}
              most of them moved.
            </>
          }
        >
          <Ring {...state} />
        </Predict>
      )}
      {free && (
        <div className="okfw-columns">
          <Choice
            label="Servers"
            options={[2, 3, 4, 5].map((n) => ({ id: String(n), label: `${n} servers` }))}
            value={String(state.servers)}
            onChange={(id) => walk.set({ servers: Number(id), moved: true })}
          />
          <Choice
            label="Points per server"
            options={[1, 2, 4, 8].map((n) => ({ id: String(n), label: n === 1 ? '1 point each' : `${n} points each` }))}
            value={String(state.vnodes)}
            onChange={(id) => walk.set({ vnodes: Number(id) })}
          />
        </div>
      )}
      {walk.step === null && state.moved && (
        <p className="okfw-answer" data-seen="false" data-testid="ring-moved">
          When server {serverName(state.servers - 1)} joined, <strong>{movedKeys(state.servers, state.vnodes).length} of 12</strong>{' '}
          parcels moved, all of them to it.
        </p>
      )}
      <ModelNote>
        A model: <code>models/ring.ts</code>, the same ring as the next widget, with twelve keys
        instead of 2,000 so each one can be seen.
      </ModelNote>
    </div>
  );
}
