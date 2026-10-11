import assert from 'node:assert/strict';
import { fakeFetch } from '../../src/carriers/fake.ts';
import { route } from '../../src/api/router.ts';
import { integration } from './support.ts';

integration('a northpost webhook agrees with what polling sees', () => {
  const polled = fakeFetch('NP123456789012');
  const res = route('POST', '/webhooks/northpost', {
    parcel: { ref: 'NP123456789012' },
    event: { code: 'OUT_FOR_DELIVERY', occurredAt: polled.at },
  });
  assert.equal(res.status, 202);
  assert.deepEqual(res.body, polled);
});
