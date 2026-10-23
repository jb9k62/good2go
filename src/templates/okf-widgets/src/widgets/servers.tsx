/**
 * What the first rungs of the hashing ladder share (hash-modulo, hash-ring): twelve parcel keys,
 * servers named by letter, one colour per server, and a key drawn as a chip.
 */

import type { ReactNode } from 'react';
import { position } from '../models/ring.ts';

export const PARCELS = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);

export const serverName = (node: number) => String.fromCharCode(65 + node);

/** The same colour per server as the full-size consistent-hash widget. */
export const serverColour = (node: number) => `hsl(${(node * 137.5) % 360}, 65%, 50%)`;

/** The key's hash cut to two digits, so the reader can do the remainder in their head. */
export const smallHash = (key: string) => position(key) % 100;

export function Chip({ label, node, moved, from }: { label: ReactNode; node: number; moved?: boolean; from?: number }) {
  return (
    <span className="okfw-chip" data-moved={moved || undefined} style={{ borderColor: serverColour(node) }}>
      {label}
      {moved && from !== undefined && <small> was {serverName(from)}</small>}
    </span>
  );
}
