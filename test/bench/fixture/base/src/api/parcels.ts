import type { Parcel } from '../carriers/types.ts';
import { page } from './paging.ts';

export function listParcels(parcels: Parcel[], pageNumber?: number, size?: number): Parcel[] {
  return page(parcels, pageNumber, size);
}

export function findParcel(parcels: Parcel[], id: string): Parcel | undefined {
  return parcels.find((p) => p.id === id);
}
