import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatLocal } from '../../src/util/zones.ts';

test('formats in the given zone', () => {
  assert.equal(formatLocal('2026-06-01T12:00:00Z', 'Europe/London'), '2026-06-01 13:00');
  assert.equal(formatLocal('2026-06-01T12:00:00Z', 'UTC'), '2026-06-01 12:00');
});
