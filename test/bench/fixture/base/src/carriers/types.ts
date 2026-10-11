export type Status = 'created' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown';

export interface CarrierEvent {
  tracking: string;
  status: Status;
  at: string;
}

export interface Parcel {
  id: string;
  carrier: string;
  tracking: string;
  status: Status;
  deliveredAt?: string;
}
