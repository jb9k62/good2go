import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isoDay, weekStartUtc } from '../../src/report/week.ts';

test('a Wednesday belongs to the Monday before it', () => {
  assert.equal(isoDay(weekStartUtc(new Date('2026-10-07T12:00:00Z'))), '2026-10-05');
});

test('Sunday evening belongs to the week ending then', () => {
  assert.equal(isoDay(weekStartUtc(new Date('2026-10-04T23:59:00Z'))), '2026-09-28');
});
