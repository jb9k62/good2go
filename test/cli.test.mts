/** The good2go command run from source: version, dispatch, argument order and exit codes. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOOD2GO = path.join(ROOT, 'src', 'good2go.mts');
const CACHE = path.join(ROOT, '.cache', 'test');
fs.mkdirSync(CACHE, { recursive: true });
const scratch = fs.mkdtempSync(path.join(CACHE, 'cli-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function g2g(args: string[], cwd = ROOT) {
  const r = spawnSync(process.execPath, [GOOD2GO, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

function bundle(name: string, files: Record<string, string>): string {
  const dir = path.join(scratch, name);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const GOOD = { 'index.md': '---\nokf_version: "0.2"\n---\n\n# T\n', 'a.md': '---\ntype: Reference\n---\n\n# A\n' };
const BAD = { 'index.md': GOOD['index.md'], 'a.md': '---\ntitle: no type\n---\n' };

describe('good2go', () => {
  it('prints the package version', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    for (const flag of ['--version', '-v', 'version']) {
      const r = g2g([flag]);
      assert.equal(r.code, 0, r.out);
      assert.equal(r.out.trim(), pkg.version, flag);
    }
  });

  it('lists the commands for --help (0) and for no command (2)', () => {
    const help = g2g(['--help']);
    assert.equal(help.code, 0);
    for (const c of ['init', 'new', 'validate', 'view', 'search', 'recheck', 'edukai', 'skills']) {
      assert.match(help.out, new RegExp(`good2go ${c}\\b`), c);
    }
    assert.equal(g2g([]).code, 2);
  });

  it('exits 2 for an unknown command, and names it', () => {
    const r = g2g(['frobnicate']);
    assert.equal(r.code, 2);
    assert.match(r.out, /unknown command "frobnicate"/);
  });

  it('validate takes the bundle first or last, and passes it to the viewer', () => {
    const dir = bundle('ok', GOOD);
    for (const args of [['validate', dir, '--strict'], ['validate', '--strict', dir]]) {
      const r = g2g(args);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /issues\s+: 0/);
    }
    // Relative to the working directory, as an npm script gives it.
    const rel = g2g(['validate', 'ok', '--strict'], scratch);
    assert.equal(rel.code, 0, rel.out);
  });

  it('keeps the tool exit codes: 1 for a broken bundle, 2 when it cannot run', () => {
    const bad = bundle('bad', BAD);
    const broken = g2g(['validate', bad, '--strict']);
    assert.equal(broken.code, 1, broken.out);
    assert.match(broken.out, /a\.md\s+\[missing-type\]/);
    assert.equal(g2g(['validate', path.join(scratch, 'nowhere')]).code, 2);
    assert.equal(g2g(['search', 'bogus-command', '--bundle', bundle('ok2', GOOD)]).code, 2);
    assert.equal(g2g(['init', '--no-such-flag']).code, 2);
  });

  it('fix writes the safe fixes, view writes viz.html, search answers', () => {
    const dir = bundle('flow', {
      ...GOOD,
      'm.md': '---\ntype: Data Model\n---\n\n# M\n\n```mermaid\nerDiagram\n    TEAM ||--o{ PLAYER : fields\n```\n',
    });
    assert.equal(g2g(['validate', dir, '--strict']).code, 1, 'the ER diagram has no key yet');
    const fixed = g2g(['fix', dir]);
    assert.equal(fixed.code, 0, fixed.out);
    assert.equal(g2g(['validate', dir, '--strict']).code, 0);
    const view = g2g(['view', dir]);
    assert.equal(view.code, 0, view.out);
    assert.ok(fs.existsSync(path.join(dir, 'viz.html')));
    const q = g2g(['search', 'search', 'player', '--bundle', dir, '--json']);
    assert.equal(q.code, 0, q.out);
    assert.ok(JSON.parse(q.out).total >= 1);
  });

  it('dispatches init, edukai, recheck and hook to their tools', () => {
    const proj = path.join(scratch, 'proj');
    const init = g2g(['init', proj, '--name', 'Proj', '--edukai']);
    assert.equal(init.code, 0, init.out);
    assert.ok(fs.existsSync(path.join(proj, 'okf', 'index.md')));
    assert.equal(g2g(['edukai', 'index'], proj).code, 0);
    assert.equal(g2g(['edukai', 'index', '--check'], proj).code, 0);
    const recheck = g2g(['recheck', '--strict'], proj);
    assert.equal(recheck.code, 0, recheck.out);
    assert.match(recheck.out, /edukai recheck/);
    assert.equal(g2g(['hook', 'brief'], proj).code, 0);
    assert.equal(g2g(['update'], proj).code, 2, 'there is no update command');
    assert.equal(g2g(['edukai', 'nonsense'], proj).code, 2);
  });
});
