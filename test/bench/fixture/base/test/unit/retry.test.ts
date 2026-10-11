import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backoffMs, retrying } from '../../src/poller/retry.ts';

test('backoff is capped', () => {
  assert.ok(backoffMs(30, () => 0.999) <= 30_000);
});

test('retries until the call succeeds', async () => {
  let calls = 0;
  const value = await retrying(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error('flaky');
      return 'ok';
    },
    async () => {},
  );
  assert.equal(value, 'ok');
  assert.equal(calls, 3);
});

test('gives up with the last error', async () => {
  await assert.rejects(
    retrying(async () => { throw new Error('down'); }, async () => {}),
    /down/,
  );
});
