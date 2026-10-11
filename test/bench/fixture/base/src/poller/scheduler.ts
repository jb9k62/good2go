import type { Parcel } from '../carriers/types.ts';
import { INTERVAL_MS } from './config.ts';

export function isActive(parcel: Parcel): boolean {
  return parcel.status !== 'delivered';
}

export function dueParcels(parcels: Parcel[], lastPolled: Map<string, number>, now: number): Parcel[] {
  return parcels.filter((p) => isActive(p) && now - (lastPolled.get(p.id) ?? 0) >= INTERVAL_MS);
}
