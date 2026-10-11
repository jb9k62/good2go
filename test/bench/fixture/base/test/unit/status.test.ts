import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapStatus } from '../../src/carriers/status.ts';

test('maps known statuses', () => {
  assert.equal(mapStatus('DELIVERED'), 'delivered');
  assert.equal(mapStatus(' in_transit '), 'in_transit');
});

test('anything else is unknown', () => {
  assert.equal(mapStatus('TELEPORTED'), 'unknown');
});
