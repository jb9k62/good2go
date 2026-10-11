import type { Status } from '../carriers/types.ts';

const TEXT: Record<Status, string> = {
  created: 'has been registered',
  in_transit: 'is on its way',
  out_for_delivery: 'is out for delivery today',
  delivered: 'has been delivered',
  exception: 'needs your attention',
  unknown: 'has an update',
};

export function messageFor(parcelId: string, status: Status): string {
  return `Your parcel ${parcelId} ${TEXT[status]}.`;
}
