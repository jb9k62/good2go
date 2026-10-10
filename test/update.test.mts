/**
 * okf-update, end to end and offline: a fake installed package (a copy of okf-update.mts beside
 * a templates/ directory and a package.json) and hand-built projects with a hand-built manifest.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'skills', 'okf-bootstrap', 'assets');
const TOOL = path.join(ASSETS, 'okf-update.mts');
const CACHE = path.join(ROOT, '.cache', 'test');
fs.mkdirSync(CACHE, { recursive: true });
const scratch = fs.mkdtempSync(path.join(CACHE, 'update-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const read = (file: string) => fs.readFileSync(file, 'utf8');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

// template -> project path, as okf-update.mts maps them
const MAP: Record<string, string> = {
  'okf/index.md': 'okf/index.md',
  'okf/log.md': 'okf/log.md',
  'edukai/index.md': 'edukai/index.md',
  'concept.md': 'okf-concept-template.md',
};

function run(file: string, args: string[], cwd: string) {
  const r = spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

/** An installed package: okf-update.mts beside a templates/ of simple files. */
function pkg(name: string, version: string, templates: Record<string, string>, pkgName = '@jb9k62/good2go'): string {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: pkgName, version }));
  fs.copyFileSync(TOOL, path.join(dir, 'okf-update.mts'));
  for (const [rel, text] of Object.entries(templates)) {
    const file = path.join(dir, 'templates', rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return path.join(dir, 'okf-update.mts');
}

const BASE: Record<string, string> = {
  'okf/index.md': '# {{PROJECT_NAME}}\n',
  'okf/log.md': '# Log\n',
  'edukai/index.md': '# Memory\n',
  'concept.md': '# Concept\n',
};

/** A project holding the BASE templates as scaffolded, with a manifest written by hand. */
function project(
  name: string,
  opts: { version?: string; legacy?: boolean; projectName?: string; omitHashes?: boolean } = {},
): string {
  const dir = path.join(scratch, name);
  const projectName = opts.projectName ?? name;
  for (const [template, dest] of Object.entries(MAP)) {
    const file = path.join(dir, dest);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, BASE[template]!.replace('{{PROJECT_NAME}}', projectName));
  }
  const templates = opts.omitHashes ? {} : Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, sha(v)]));
  const manifest = JSON.stringify({ version: opts.version ?? '1.0.0', name: projectName, templates }, null, 2);
  const where = opts.legacy ? path.join(dir, 'scripts', '.okf-bootstrap.json') : path.join(dir, '.okf-bootstrap.json');
  fs.mkdirSync(path.dirname(where), { recursive: true });
  fs.writeFileSync(where, manifest);
  return dir;
}

/** Every file in the project, by path. Shows that a report writes nothing. */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rel of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const abs = path.join(dir, rel);
    if (fs.statSync(abs).isFile()) out.set(rel, read(abs));
  }
  return out;
}

describe('okf-update', () => {
  it('says up to date when no template changed', () => {
    const tool = pkg('p-same', '1.0.0', BASE);
    const dir = project('same');
    const r = run(tool, ['--dir', dir], scratch);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^up to date/m);
  });

  it('reports a changed template and writes nothing without --write', () => {
    const tool = pkg('p-report', '1.1.0', { ...BASE, 'okf/log.md': '# Log\n\nnew line\n' });
    const dir = project('report');
    const before = snapshot(dir);
    const r = run(tool, ['--dir', dir], scratch);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /release changed\s+okf\/log\.md/);
    assert.doesNotMatch(r.out, /okf\/index\.md/);
    assert.match(r.out, /nothing was written/);
    assert.deepEqual(snapshot(dir), before);
  });

  it('uses the current directory when --dir is absent', () => {
    const tool = pkg('p-cwd', '1.1.0', { ...BASE, 'okf/log.md': '# Log\n\nnew\n' });
    const dir = project('cwd');
    const r = run(tool, [], dir);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /okf\/log\.md/);
  });

  it('--write puts the rendered copy under .okf-update/ and leaves the project and manifest alone', () => {
    const tool = pkg('p-write', '1.1.0', { ...BASE, 'okf/index.md': '# {{PROJECT_NAME}}\n\nmore\n' });
    const dir = project('write', { projectName: 'Fancy Name' });
    const before = snapshot(dir);
    const r = run(tool, ['--dir', dir, '--write'], scratch);
    assert.equal(r.code, 0, r.out);
    assert.equal(read(path.join(dir, '.okf-update', 'okf', 'index.md')), '# Fancy Name\n\nmore\n');
    assert.ok(!fs.existsSync(path.join(dir, '.okf-update', 'okf', 'log.md')), 'only the changed template');
    const after = snapshot(dir);
    for (const [rel, text] of before) assert.equal(after.get(rel), text, `${rel} untouched`);
  });

  it('does not list authored files that merely differ from an unchanged template', () => {
    const tool = pkg('p-authored', '1.0.1', BASE);
    const dir = project('authored');
    fs.appendFileSync(path.join(dir, 'okf', 'index.md'), '\n- a concept I wrote\n');
    const r = run(tool, ['--dir', dir], scratch);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^up to date/m);
  });

  it('does not list a template whose project file already is the release copy', () => {
    const tool = pkg('p-adopted', '1.1.0', { ...BASE, 'okf/log.md': '# Log\n\nnew\n' });
    const dir = project('adopted');
    fs.writeFileSync(path.join(dir, 'okf', 'log.md'), '# Log\n\nnew\n');
    assert.match(run(tool, ['--dir', dir], scratch).out, /^up to date/m);
  });

  it('skips templates the project does not have', () => {
    const tool = pkg('p-missing', '1.1.0', { ...BASE, 'concept.md': '# Concept\n\nnew\n' });
    const dir = project('missing');
    fs.rmSync(path.join(dir, 'okf-concept-template.md'));
    assert.match(run(tool, ['--dir', dir], scratch).out, /^up to date/m);
  });

  it('reads the legacy scripts/.okf-bootstrap.json', () => {
    const tool = pkg('p-legacy', '1.1.0', { ...BASE, 'okf/log.md': '# Log\n\nnew\n' });
    const dir = project('legacy', { legacy: true });
    const r = run(tool, ['--dir', dir], scratch);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /okf\/log\.md/);
  });

  it('compares with the project file when the manifest has no hashes', () => {
    const tool = pkg('p-nohash', '1.1.0', { ...BASE, 'okf/log.md': '# Log\n\nnew\n' });
    const dir = project('nohash', { omitHashes: true });
    const r = run(tool, ['--dir', dir], scratch);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /release changed, project edited\s+okf\/log\.md/);
    assert.doesNotMatch(r.out, /okf\/index\.md/);
  });

  it('finds the version of an okf-bootstrap package too, and refuses a newer manifest unless --allow-downgrade', () => {
    const tool = pkg('p-down', '1.0.0', { ...BASE, 'okf/log.md': '# Log\n\nnew\n' }, 'okf-bootstrap');
    const dir = project('down', { version: '2.0.0' });
    const refused = run(tool, ['--dir', dir], scratch);
    assert.equal(refused.code, 2, refused.out);
    assert.match(refused.out, /--allow-downgrade/);
    const allowed = run(tool, ['--dir', dir, '--allow-downgrade'], scratch);
    assert.equal(allowed.code, 0, allowed.out);
    assert.match(allowed.out, /okf\/log\.md/);
  });

  it('exits 2 when there is no manifest', () => {
    const tool = pkg('p-none', '1.0.0', BASE);
    const dir = project('none');
    fs.rmSync(path.join(dir, '.okf-bootstrap.json'));
    const r = run(tool, ['--dir', dir], scratch);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /\.okf-bootstrap\.json/);
  });

  it('exits 2 on a manifest of the wrong shape or invalid JSON', () => {
    const tool = pkg('p-bad', '1.0.0', BASE);
    const dir = project('bad');
    fs.writeFileSync(path.join(dir, '.okf-bootstrap.json'), JSON.stringify({ version: '1.0.0', files: {} }));
    const shape = run(tool, ['--dir', dir], scratch);
    assert.equal(shape.code, 2, shape.out);
    assert.match(shape.out, /does not have the shape/);
    fs.writeFileSync(path.join(dir, '.okf-bootstrap.json'), '{nope');
    assert.equal(run(tool, ['--dir', dir], scratch).code, 2);
  });

  it('exits 2 on an unknown argument', () => {
    const tool = pkg('p-arg', '1.0.0', BASE);
    const r = run(tool, ['--apply'], scratch);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /usage: good2go update/);
  });

  it('works from the real assets directory against the repo templates', () => {
    const dir = path.join(scratch, 'real');
    fs.mkdirSync(path.join(dir, 'okf'), { recursive: true });
    fs.copyFileSync(path.join(ASSETS, 'templates', 'okf', 'log.md'), path.join(dir, 'okf', 'log.md'));
    const hash = sha(read(path.join(ASSETS, 'templates', 'okf', 'log.md')));
    fs.writeFileSync(
      path.join(dir, '.okf-bootstrap.json'),
      JSON.stringify({ version: '0.0.1', name: 'real', templates: { 'okf/log.md': hash } }),
    );
    const r = run(TOOL, ['--dir', dir], scratch);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^up to date/m);
  });
});

describe('okf-update invariants', () => {
  it('imports only node built-ins, so it runs with nothing installed', () => {
    const specs = [...read(TOOL).matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    assert.ok(specs.length > 0);
    for (const spec of specs) assert.match(spec!, /^node:/, `non-builtin import ${spec}`);
  });

  it('does not use git or the network, and never touches scripts/', () => {
    const src = read(TOOL);
    assert.doesNotMatch(src, /child_process|https?:\/\/(?!claude)/);
    assert.doesNotMatch(src, /writeFileSync\([^)]*scripts/);
  });
});
