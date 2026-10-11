import assert from 'node:assert/strict';
import { test } from 'node:test';
import { messageFor } from '../../src/notifier/templates.ts';

test('names the parcel and what happened', () => {
  assert.equal(messageFor('p1', 'delivered'), 'Your parcel p1 has been delivered.');
});
