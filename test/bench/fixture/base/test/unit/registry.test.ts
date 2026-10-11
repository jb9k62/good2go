import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARRIERS, isCarrier } from '../../src/carriers/registry.ts';

test('lists carriers without duplicates', () => {
  assert.equal(new Set(CARRIERS).size, CARRIERS.length);
});

test('isCarrier knows the list', () => {
  assert.ok(isCarrier('vela'));
  assert.ok(!isCarrier('pigeon'));
});
