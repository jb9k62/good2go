import type { Status } from '../carriers/types.ts';
import type { Channel } from './channels.ts';
import { shouldSend } from './debounce.ts';
import { messageFor } from './templates.ts';

const lastSent = new Map<string, number>();

export function notifyChange(channel: Channel, to: string, parcelId: string, status: Status, now: number): boolean {
  if (!shouldSend(lastSent.get(parcelId), now)) return false;
  lastSent.set(parcelId, now);
  channel.send(to, messageFor(parcelId, status));
  return true;
}

export function forgetAll(): void {
  lastSent.clear();
}
