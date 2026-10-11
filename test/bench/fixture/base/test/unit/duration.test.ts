import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDuration, toMillis } from '../../src/util/duration.ts';

test('formats seconds, minutes and hours', () => {
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(185), '3m 05s');
  assert.equal(formatDuration(3720), '1h 02m');
});

test('rejects negatives', () => {
  assert.throws(() => formatDuration(-1), RangeError);
});

test('converts to milliseconds', () => {
  assert.equal(toMillis(1.5), 1500);
});
