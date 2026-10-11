import { writeFileSync } from 'node:fs';
import { buildSnapshot } from '../src/carriers/snapshot.ts';

writeFileSync(new URL('../snapshots/carriers.snap.json', import.meta.url), buildSnapshot());
console.log('wrote snapshots/carriers.snap.json');
