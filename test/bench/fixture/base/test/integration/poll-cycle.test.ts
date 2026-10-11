import assert from 'node:assert/strict';
import { defaultFetch } from '../../src/carriers/transport.ts';
import { pollParcels } from '../../src/poller/poll.ts';
import { ParcelStore } from '../../src/poller/store.ts';
import { integration } from './support.ts';

function seeded(): ParcelStore {
  const store = new ParcelStore();
  store.add({ id: 'p1', carrier: 'parcelhawk', tracking: 'PH123456789', status: 'created' });
  store.add({ id: 'p2', carrier: 'vela', tracking: 'VLAB12CD34', status: 'in_transit' });
  store.add({ id: 'p3', carrier: 'quickfox', tracking: 'QF12345678', status: 'in_transit' });
  return store;
}

integration('a poll cycle updates every parcel', async () => {
  const store = seeded();
  const failed = await pollParcels(store, store.all(), { fetch: defaultFetch, sleep: async () => {} });
  assert.deepEqual(failed, []);
  assert.equal(store.get('p1')?.status, 'in_transit');
  assert.equal(store.get('p2')?.status, 'delivered');
  assert.equal(store.get('p3')?.status, 'out_for_delivery');
});

integration('a delivered parcel records when', async () => {
  const store = seeded();
  await pollParcels(store, store.all(), { fetch: defaultFetch, sleep: async () => {} });
  assert.equal(store.get('p2')?.deliveredAt, '2026-10-05T09:30:00Z');
});
