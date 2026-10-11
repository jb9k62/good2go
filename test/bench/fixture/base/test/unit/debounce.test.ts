import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldSend } from '../../src/notifier/debounce.ts';
import { forgetAll, notifyChange } from '../../src/notifier/notify.ts';
import { memoryChannel } from '../../src/notifier/channels.ts';

test('first message always goes', () => {
  assert.ok(shouldSend(undefined, 1000));
});

test('a second message right after is held back', () => {
  forgetAll();
  const sent: Array<{ to: string; text: string }> = [];
  const channel = memoryChannel(sent);
  assert.ok(notifyChange(channel, 'a@example.com', 'p1', 'in_transit', 1_000_000));
  assert.ok(!notifyChange(channel, 'a@example.com', 'p1', 'delivered', 1_000_500));
  assert.equal(sent.length, 1);
});
