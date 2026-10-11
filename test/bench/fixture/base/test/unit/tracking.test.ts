import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normaliseTracking } from '../../src/util/tracking.ts';

test('upper-cases and strips spaces and dashes', () => {
  assert.equal(normaliseTracking('parcelhawk', 'ph 123-456 789'), 'PH123456789');
});

test('rejects numbers the carrier would not accept', () => {
  assert.equal(normaliseTracking('vela', 'VL123'), null);
  assert.equal(normaliseTracking('nobody', 'X'), null);
});
