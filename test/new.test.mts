/** g2g-new: the scaffold validates strictly, refuses escapes, keeps authored files, and reports usage errors. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'src');
const NEW = path.join(ASSETS, 'g2g-new.mts');
const VIEW = path.join(ASSETS, 'g2g-view.mts');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'g2g-new-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

let n = 0;
function project(): string {
  const dir = path.join(scratch, `p${n++}`);
  fs.mkdirSync(dir);
  return dir;
}
function run(script: string, args: string[]) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const make = (p: string, dir: string, extra: string[] = []) =>
  run(NEW, [dir, '--name', 'Runbooks', '--intent', 'How to run it, for the on-call.', '--project-dir', p, ...extra]);

describe('g2g-new', () => {
  it('scaffolds a bundle that passes the validator in strict mode', () => {
    const p = project();
    const r = make(p, 'ops');
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /good2go validate ops/);
    assert.match(r.out, /good2go view ops/);
    const index = fs.readFileSync(path.join(p, 'ops', 'index.md'), 'utf8');
    assert.match(index, /okf_version: "0.2"/);
    assert.match(index, /Runbooks/);
    assert.match(index, /How to run it, for the on-call\./);
    const v = run(VIEW, [path.join(p, 'ops'), '--validate', '--strict']);
    assert.equal(v.code, 0, v.out + v.err);
  });

  it('refuses a path that escapes the project, and an absolute path', () => {
    const p = project();
    for (const bad of ['../out', 'a/../../out', path.join(scratch, 'abs')]) {
      const r = make(p, bad);
      assert.equal(r.code, 2, bad);
      assert.ok(r.err.includes(bad), r.err);
    }
    assert.equal(fs.existsSync(path.join(scratch, 'out')), false);
  });

  it('refuses a non-empty folder, and with --force keeps authored files', () => {
    const p = project();
    fs.mkdirSync(path.join(p, 'kb'));
    fs.writeFileSync(path.join(p, 'kb', 'index.md'), 'mine\n');
    const refused = make(p, 'kb');
    assert.equal(refused.code, 1);
    assert.match(refused.err, /kb/);
    const r = make(p, 'kb', ['--force']);
    assert.equal(r.code, 0, r.err);
    assert.equal(fs.readFileSync(path.join(p, 'kb', 'index.md'), 'utf8'), 'mine\n');
    assert.match(r.out, /kept\s+kb[\\/]index\.md/);
    assert.ok(fs.existsSync(path.join(p, 'kb', 'log.md')));
  });

  it('is a usage error without --name or --intent', () => {
    const p = project();
    assert.equal(run(NEW, ['x', '--intent', 'i', '--project-dir', p]).code, 2);
    assert.equal(run(NEW, ['x', '--name', 'N', '--project-dir', p]).code, 2);
    assert.equal(run(NEW, ['--name', 'N', '--intent', 'i', '--project-dir', p]).code, 2);
    assert.equal(fs.existsSync(path.join(p, 'x')), false);
  });
});

describe('g2g-new and the manifest', () => {
  it('adds the folder to the manifest\'s bundles, once', () => {
    const p = project();
    fs.writeFileSync(path.join(p, '.good2go.json'), JSON.stringify({ version: '1.0.0', name: 'x', designDir: 'okf' }));
    assert.equal(make(p, 'ops').code, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p, '.good2go.json'), 'utf8')).bundles, ['okf', 'ops']);
    assert.equal(make(p, 'ops', ['--force']).code, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p, '.good2go.json'), 'utf8')).bundles, ['okf', 'ops']);
  });
  it('leaves a project without a manifest alone', () => {
    const p = project();
    assert.equal(make(p, 'ops').code, 0);
    assert.ok(!fs.existsSync(path.join(p, '.good2go.json')));
  });
});
