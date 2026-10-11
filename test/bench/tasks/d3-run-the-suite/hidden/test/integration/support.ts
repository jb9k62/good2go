import { test } from 'node:test';

export const integration: typeof test = process.env.PARCEL_FAKE_CARRIERS === '1' ? test : (test.skip as typeof test);
