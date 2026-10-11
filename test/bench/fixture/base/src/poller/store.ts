import type { Parcel, Status } from '../carriers/types.ts';

export class ParcelStore {
  #parcels = new Map<string, Parcel>();

  add(parcel: Parcel): void {
    this.#parcels.set(parcel.id, parcel);
  }

  get(id: string): Parcel | undefined {
    return this.#parcels.get(id);
  }

  all(): Parcel[] {
    return [...this.#parcels.values()];
  }

  update(id: string, status: Status, at: string): void {
    const p = this.#parcels.get(id);
    if (p === undefined) return;
    p.status = status;
    if (status === 'delivered') p.deliveredAt = at;
  }
}
