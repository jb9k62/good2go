/** `--help` and `-h` through the good2go command: exit 0, the tool's own usage, no stale command names. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRIES = [
  ['source', path.join(ROOT, 'src', 'good2go.mts')],
  ['dist', path.join(ROOT, 'dist', 'good2go.mjs')],
] as const;

// command, a phrase its usage must contain
const COMMANDS: Array<[string[], RegExp]> = [
  [['view'], /good2go view \[bundle\]/],
  [['validate'], /good2go view \[bundle\]/],
  [['fix'], /good2go view \[bundle\]/],
  [['mermaid'], /good2go mermaid \[bundle\]/],
  [['search'], /good2go search <command>/],
  [['edukai'], /good2go edukai <command>/],
  [['hook'], /good2go hook <command>/],
  [['questions'], /good2go questions \[list\]/],
];

for (const [label, entry] of ENTRIES) {
  describe(`--help from ${label}`, { skip: !fs.existsSync(entry) && 'not built (npm run build)' }, () => {
    for (const [command, usage] of COMMANDS) {
      for (const flag of ['--help', '-h']) {
        it(`good2go ${command.join(' ')} ${flag} exits 0 and prints its usage`, () => {
          const r = spawnSync(process.execPath, [entry, ...command, flag], { cwd: ROOT, encoding: 'utf8' });
          assert.equal(r.status, 0, r.stdout + r.stderr);
          assert.match(r.stdout, usage);
          assert.doesNotMatch(r.stdout, /node scripts\/|__rewriteRelativeImportExtension/);
        });
      }
    }
  });
}
