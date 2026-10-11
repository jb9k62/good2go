import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pluralise, titleCase } from '../../src/util/strings.ts';
import { sha256 } from '../../src/util/hash.ts';
import { nextId, resetIds } from '../../src/util/ids.ts';

test('title case and plurals', () => {
  assert.equal(titleCase('north POST'), 'North Post');
  assert.equal(pluralise(1, 'parcel'), '1 parcel');
  assert.equal(pluralise(3, 'parcel'), '3 parcels');
});

test('ids count up and hashes are stable', () => {
  resetIds();
  assert.equal(nextId('p'), 'p_0001');
  assert.equal(sha256('a').length, 64);
});
