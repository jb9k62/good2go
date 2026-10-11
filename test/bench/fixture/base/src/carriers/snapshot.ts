import { WEBHOOK_PARSERS } from '../api/webhooks.ts';
import { sha256 } from '../util/hash.ts';
import { PATTERNS } from '../util/tracking.ts';
import { CARRIERS } from './registry.ts';

export function buildSnapshot(): string {
  const data = {
    carriers: [...CARRIERS].sort(),
    webhooks: Object.keys(WEBHOOK_PARSERS).sort(),
    patterns: Object.fromEntries(Object.entries(PATTERNS).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, v.source])),
  };
  const checksum = sha256(JSON.stringify(data));
  return JSON.stringify({ schema: 1, data, checksum }, null, 2) + '\n';
}
