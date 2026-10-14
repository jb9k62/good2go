/** good2go build-view and open: every bundle's viewer, a landing page, one bundle by name, and the exit codes. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOOD2GO = path.join(ROOT, 'src', 'good2go.mts');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'g2g-build-view-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function good2go(cwd: string, args: string[]) {
  const r = spawnSync(process.execPath, [GOOD2GO, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

let n = 0;
/** A project with the design bundle, the memory bundle and one made by `new`. */
function project(): string {
  const dir = path.join(scratch, `p${n++}`);
  fs.mkdirSync(dir);
  assert.equal(good2go(dir, ['init', '.', '--name', 'Shop', '--edukai', '--no-skills']).code, 0);
  assert.equal(good2go(dir, ['new', 'docs/ops', '--name', 'Ops', '--intent', 'Runbooks for the on-call.']).code, 0);
  return dir;
}
const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('build-view', () => {
  it('builds every listed bundle and a landing page that links them', () => {
    const p = project();
    const r = good2go(p, ['build-view']);
    assert.equal(r.code, 0, r.err);
    for (const d of ['okf', 'edukai', 'docs/ops']) assert.ok(fs.existsSync(path.join(p, d, 'viz.html')), `${d}/viz.html`);
    const landing = read(path.join(p, 'viz.html'));
    for (const d of ['okf', 'edukai', 'docs/ops']) assert.match(landing, new RegExp(`href="${d}/viz.html"`));
    assert.match(landing, /<title>Shop: bundles<\/title>/);
    assert.match(landing, /3 bundles/);
    assert.doesNotMatch(landing, /<script|https?:\/\//, 'the landing page loads nothing');
    assert.match(r.out, /file:\/\/.*\/viz\.html/);
  });

  it('builds only the bundles named, and leaves the landing page alone', () => {
    const p = project();
    const r = good2go(p, ['build-view', 'okf', 'docs/ops']);
    assert.equal(r.code, 0, r.err);
    assert.ok(fs.existsSync(path.join(p, 'okf', 'viz.html')));
    assert.ok(!fs.existsSync(path.join(p, 'edukai', 'viz.html')));
    assert.ok(!fs.existsSync(path.join(p, 'viz.html')));
  });

  it('refuses a bundle it does not know, and a project that lists none', () => {
    const p = project();
    const unknown = good2go(p, ['build-view', 'nope']);
    assert.equal(unknown.code, 2);
    assert.match(unknown.err, /no bundle "nope".*okf, edukai, docs\/ops/);
    const bare = path.join(scratch, 'bare');
    fs.mkdirSync(bare);
    const none = good2go(bare, ['build-view']);
    assert.equal(none.code, 2);
    assert.match(none.err, /no bundles to build/);
  });

  it('exits 1 under --strict when a bundle has issues, after building it', () => {
    const p = project();
    fs.writeFileSync(path.join(p, 'okf', 'broken.md'), '# no frontmatter\n');
    assert.equal(good2go(p, ['build-view']).code, 0, 'issues alone do not fail');
    const r = good2go(p, ['build-view', '--strict']);
    assert.equal(r.code, 1);
    assert.match(r.out, /okf\/viz\.html.*1 issue/);
    assert.match(read(path.join(p, 'viz.html')), /1 issue/);
  });
});

describe('open', () => {
  it('builds everything and points at the landing page', () => {
    const p = project();
    const r = good2go(p, ['open', '--no-open']);
    assert.equal(r.code, 0, r.err);
    assert.ok(fs.existsSync(path.join(p, 'viz.html')));
    assert.ok(r.out.trim().split('\n').pop()!.endsWith(`${path.basename(p)}/viz.html`), 'the landing page, not a bundle');
  });

  it('takes a bundle as a folder or as the last part of a listed one', () => {
    const p = project();
    for (const name of ['okf', 'ops', 'docs/ops']) {
      const r = good2go(p, ['open', name, '--no-open']);
      assert.equal(r.code, 0, r.err);
      const last = r.out.trim().split('\n').pop()!;
      assert.ok(last.endsWith(name === 'okf' ? '/okf/viz.html' : '/docs/ops/viz.html'), `${name}: ${last}`);
    }
    assert.ok(!fs.existsSync(path.join(p, 'viz.html')), 'a named bundle does not write the landing page');
    assert.equal(good2go(p, ['open', 'nope', '--no-open']).code, 2);
    assert.equal(good2go(p, ['open', 'okf', 'edukai', '--no-open']).code, 2);
  });
});

describe('the viewer summary', () => {
  it('writes the title and the counts as JSON', () => {
    const p = project();
    const file = path.join(p, 'summary.json');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'src', 'g2g-view.mts'), 'okf', '--validate', '--summary', file], { cwd: p, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const s = JSON.parse(read(file));
    assert.deepEqual(Object.keys(s).sort(), ['concepts', 'edges', 'issues', 'stale', 'title']);
    assert.equal(s.issues, 0);
  });
});
