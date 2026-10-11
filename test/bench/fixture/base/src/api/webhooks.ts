import { parseNorthpost } from '../carriers/northpost.ts';
import type { CarrierEvent } from '../carriers/types.ts';
import { parseVela } from '../carriers/vela.ts';
import { HttpError } from './errors.ts';

export const WEBHOOK_PARSERS: Record<string, (payload: any) => CarrierEvent> = {
  vela: parseVela,
  northpost: parseNorthpost,
};

export function handleWebhook(carrier: string, payload: unknown): CarrierEvent {
  const parse = WEBHOOK_PARSERS[carrier];
  if (parse === undefined) throw new HttpError(404, `no webhook for ${carrier}`);
  return parse(payload);
}
