import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { route } from '../src/api/router.ts';
import { handleWebhook, WEBHOOK_PARSERS } from '../src/api/webhooks.ts';
import { parseNorthpost } from '../src/carriers/northpost.ts';
import { CARRIERS, isCarrier } from '../src/carriers/registry.ts';
import { buildSnapshot } from '../src/carriers/snapshot.ts';
import { sha256 } from '../src/util/hash.ts';
import { normaliseTracking } from '../src/util/tracking.ts';

const payload = { parcel: { ref: 'ZP1234567890' }, event: { code: 'DELIVERED', occurredAt: '2026-10-05T09:30:00Z' } };

test('zephyr is a listed carrier', () => {
  assert.ok(CARRIERS.includes('zephyr'));
  assert.ok(isCarrier('zephyr'));
});

test('zephyr tracking numbers are normalised and validated', () => {
  assert.equal(normaliseTracking('zephyr', ' zp 1234 567890 '), 'ZP1234567890');
  assert.equal(normaliseTracking('zephyr', 'ZP12345'), null);
  assert.equal(normaliseTracking('zephyr', 'ZX1234567890'), null);
});

test('zephyr webhooks parse like northpost', () => {
  assert.equal(typeof WEBHOOK_PARSERS.zephyr, 'function');
  assert.deepEqual(handleWebhook('zephyr', payload), parseNorthpost(payload));
  assert.equal(route('POST', '/webhooks/zephyr', payload).status, 202);
});

test('the committed snapshot is the generated one and knows zephyr', () => {
  const onDisk = readFileSync(new URL('../snapshots/carriers.snap.json', import.meta.url), 'utf8');
  assert.equal(onDisk, buildSnapshot());
  const snap = JSON.parse(onDisk);
  assert.ok(snap.data.carriers.includes('zephyr'));
  assert.ok(snap.data.webhooks.includes('zephyr'));
  assert.ok('zephyr' in snap.data.patterns);
  assert.equal(snap.checksum, sha256(JSON.stringify(snap.data)));
});
