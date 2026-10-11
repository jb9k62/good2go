import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildSnapshot } from '../../src/carriers/snapshot.ts';

test('the carrier snapshot checksum matches', () => {
  const onDisk = readFileSync(new URL('../../snapshots/carriers.snap.json', import.meta.url), 'utf8');
  assert.equal(onDisk, buildSnapshot());
});
