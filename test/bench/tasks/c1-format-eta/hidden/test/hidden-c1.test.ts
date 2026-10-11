import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatEta } from '../src/util/duration.ts';

test('under an hour', () => {
  assert.equal(formatEta(0), '0 min');
  assert.equal(formatEta(45), '45 min');
  assert.equal(formatEta(59), '59 min');
});

test('an hour or more', () => {
  assert.equal(formatEta(60), '1 h');
  assert.equal(formatEta(125), '2 h 05 min');
  assert.equal(formatEta(190), '3 h 10 min');
});

test('bad input throws', () => {
  assert.throws(() => formatEta(-1), RangeError);
  assert.throws(() => formatEta(Number.NaN), RangeError);
  assert.throws(() => formatEta(Infinity), RangeError);
});
