/**
 * The built package: compile with scripts/build.mts, then run dist/good2go.mjs the way a
 * project that installed it would. Node does not strip types under node_modules, so this is the
 * code that ships: plain JavaScript, with the templates beside it.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CLI = path.join(DIST, 'good2go.mjs');
const CACHE = path.join(ROOT, '.cache', 'test');
fs.mkdirSync(CACHE, { recursive: true });
const scratch = fs.mkdtempSync(path.join(CACHE, 'package-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function cli(args: string[], cwd: string) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}
const read = (file: string) => fs.readFileSync(file, 'utf8');

describe('the built package', () => {
  const project = path.join(scratch, 'consumer');

  before(() => {
    const build = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mts')], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stdout + build.stderr);
  });

  it('compiles every tool to JavaScript beside the templates and the skills', () => {
    for (const tool of ['good2go', 'g2g-init', 'g2g-view', 'g2g-search', 'g2g-rank', 'g2g-core', 'g2g-edukai', 'g2g-hook', 'g2g-new', 'g2g-build-view', 'g2g-mermaid', 'g2g-install-hooks', 'g2g-skills', 'g2g-shared']) {
      assert.ok(fs.existsSync(path.join(DIST, `${tool}.mjs`)), `${tool}.mjs`);
      assert.ok(!fs.existsSync(path.join(DIST, `${tool}.mts`)), `no TypeScript source for ${tool}`);
    }
    assert.ok(fs.existsSync(path.join(DIST, 'templates', 'okf', 'index.md')));
    assert.ok(!fs.existsSync(path.join(DIST, 'templates', 'okf-widgets', 'node_modules')));
    assert.ok(fs.existsSync(path.join(DIST, 'skills', 'good2go', 'SKILL.md')));
    assert.ok(!fs.existsSync(path.join(DIST, 'src')), 'skills ship without the tools');
    assert.match(read(CLI), /^#!\/usr\/bin\/env node/, 'a shebang, so bin works');
    assert.ok(fs.statSync(CLI).mode & 0o100, 'executable');
  });

  it('prints its own help from the compiled code, not a compiler helper', () => {
    for (const args of [['--help'], ['help']]) {
      const r = cli(args, scratch);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /^good2go:/, 'help starts with the comment, not tsc\'s helper code');
      assert.doesNotMatch(r.out, /__rewriteRelativeImportExtension/);
      assert.match(r.out, /good2go hooks /);
    }
    assert.match(cli(['hooks', '--help'], scratch).out, /^Install the memory hooks/);
  });

  it('packs without tests or sources, and with the templates, skills and pi extension', () => {
    const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const files: string[] = JSON.parse(r.stdout)[0].files.map((f: { path: string }) => f.path);
    const has = (p: string) => files.includes(p);
    assert.ok(has('dist/good2go.mjs'));
    assert.ok(has('dist/templates/okf/index.md'));
    assert.ok(has('dist/templates/pi-extension.ts'));
    assert.ok(has('dist/skills/good2go/SKILL.md'));
    assert.ok(has('package.json') && has('README.md') && has('LICENSE') && has('SECURITY.md'));
    assert.deepEqual(files.filter((f) => /^(test|scripts|src|hooks|extensions|\.claude-plugin|\.github|examples|edukai|design|vendor)\//.test(f)), []);
    assert.deepEqual(files.filter((f) => /node_modules|\.map$|\.env/.test(f)), []);
    // npm drops a file called .gitignore from a tarball, so the template ships as `gitignore`.
    assert.ok(has('dist/templates/okf-widgets/gitignore'));
  });

  it('reports the package version', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const r = cli(['--version'], scratch);
    assert.equal(r.code, 0, r.out);
    assert.equal(r.out.trim(), pkg.version);
  });

  it('init scaffolds a project from the compiled code and the shipped templates', () => {
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));
    const r = cli(['init', project, '--name', 'Consumer', '--edukai'], scratch);
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.existsSync(path.join(project, 'okf', 'index.md')));
    assert.ok(fs.existsSync(path.join(project, 'edukai', 'index.md')));
    assert.ok(!fs.existsSync(path.join(project, 'scripts')), 'no tools copied');
    assert.equal(JSON.parse(read(path.join(project, '.good2go.json'))).name, 'Consumer');
    const pkg = JSON.parse(read(path.join(project, 'package.json')));
    assert.equal(pkg.scripts['g2g:validate'], 'good2go validate okf');
    assert.ok(pkg.devDependencies['@jb9k62/good2go']);
  });

  it('validate, search and edukai work from the compiled JavaScript', () => {
    const v = cli(['validate', 'okf', '--strict'], project);
    assert.equal(v.code, 0, v.out);
    assert.match(v.out, /issues\s+: 0/);
    const q = cli(['search', 'search', 'decision', '--bundle', 'okf', '--json'], project);
    assert.equal(q.code, 0, q.out);
    assert.ok(JSON.parse(q.out).total >= 1);
    assert.equal(cli(['edukai', 'index'], project).code, 0);
    const rc = cli(['recheck', '--strict'], project);
    assert.equal(rc.code, 0, rc.out);
    assert.equal(cli(['hook', 'brief'], project).code, 0);
  });

  it('exits 1 for a broken bundle and 2 for an unknown command, from the compiled code', () => {
    const bad = path.join(scratch, 'bad');
    fs.mkdirSync(bad);
    fs.writeFileSync(path.join(bad, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# T\n');
    fs.writeFileSync(path.join(bad, 'a.md'), '---\ntitle: no type\n---\n');
    assert.equal(cli(['validate', bad, '--strict'], scratch).code, 1);
    assert.equal(cli(['nope'], scratch).code, 2);
  });

  it('view writes a self-contained viz.html', () => {
    const r = cli(['view', 'okf'], project);
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.statSync(path.join(project, 'okf', 'viz.html')).size > 10000);
  });
});
