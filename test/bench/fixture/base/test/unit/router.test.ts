import assert from 'node:assert/strict';
import { test } from 'node:test';
import { route } from '../../src/api/router.ts';

test('a vela webhook is accepted', () => {
  const res = route('POST', '/webhooks/vela', { awb: 'VLAB12CD34', state: 'DELIVERED', ts: '2026-10-05T09:30:00Z' });
  assert.equal(res.status, 202);
});

test('an unknown path is 404', () => {
  assert.equal(route('GET', '/nope').status, 404);
});
