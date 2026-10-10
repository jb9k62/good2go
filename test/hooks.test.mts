/** good2go hooks and hook run: temp folders only, never the real home. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOOD2GO = path.join(ROOT, 'src', 'good2go.mts');
const CACHE = path.join(ROOT, '.cache', 'test');
fs.mkdirSync(CACHE, { recursive: true });
const scratch = fs.mkdtempSync(path.join(CACHE, 'hooks-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

let n = 0;
function home(): string {
  const dir = path.join(scratch, 'home' + n++);
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.pi', 'agent'), { recursive: true });
  return dir;
}
// A `good2go` on PATH, so user-scope installs are not refused. `hooks` only looks for the file.
const BIN = path.join(scratch, 'bin');
fs.mkdirSync(BIN, { recursive: true });
fs.writeFileSync(path.join(BIN, 'good2go'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
const EMPTY = path.join(scratch, 'empty-path');
fs.mkdirSync(EMPTY, { recursive: true });
const WITH_G2G = BIN + path.delimiter + (process.env.PATH ?? '');

function g2g(args: string[], opts: { cwd?: string; input?: string; env?: Record<string, string> } = {}) {
  const r = spawnSync(process.execPath, [GOOD2GO, ...args], {
    cwd: opts.cwd ?? scratch,
    encoding: 'utf8',
    input: opts.input,
    env: { ...process.env, PATH: WITH_G2G, ...opts.env },
  });
  return { code: r.status, out: r.stdout + r.stderr, stdout: r.stdout, stderr: r.stderr };
}
const settingsOf = (h: string) => path.join(h, '.claude', 'settings.json');
const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const commands = (data: any): string[] =>
  Object.values<any[]>(data.hooks ?? {}).flatMap((gs) => gs.flatMap((g: any) => g.hooks.map((h: any) => h.command)));

describe('good2go hooks (Claude Code)', () => {
  it('writes the four entries, idempotently, with the user command', () => {
    const h = home();
    assert.equal(g2g(['hooks', '--claude', '--home', h]).code, 0);
    const first = fs.readFileSync(settingsOf(h), 'utf8');
    assert.equal(g2g(['hooks', '--claude', '--home', h]).code, 0);
    assert.equal(fs.readFileSync(settingsOf(h), 'utf8'), first);
    const data = read(settingsOf(h));
    assert.deepEqual(commands(data), Array(4).fill('good2go hook run'));
    assert.equal(data.hooks.PostToolUse[0].matcher, 'Read');
    assert.equal(data.hooks.PostToolUse[1].matcher, 'Edit|Write|NotebookEdit');
    assert.equal(data.hooks.Stop[0].hooks[0].timeout, 5);
    assert.ok(first.includes('\n  "hooks"'), 'two-space indent');
  });

  it('keeps foreign entries and keys, and --remove deletes only its own', () => {
    const h = home();
    const foreign = { hooks: [{ type: 'command', command: 'echo mine' }] };
    const before = {
      theme: 'dark',
      permissions: { allow: ['Bash(ls)'] },
      hooks: { Stop: [foreign], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] }] },
    };
    fs.writeFileSync(settingsOf(h), JSON.stringify(before, null, 2));
    g2g(['hooks', '--claude', '--home', h]);
    const added = read(settingsOf(h));
    assert.equal(added.theme, 'dark');
    assert.deepEqual(added.permissions, before.permissions);
    assert.deepEqual(added.hooks.PreToolUse, before.hooks.PreToolUse);
    assert.ok(commands(added).includes('echo mine'));
    assert.equal(commands(added).filter((c) => c === 'good2go hook run').length, 4);
    assert.equal(g2g(['hooks', '--claude', '--remove', '--home', h]).code, 0);
    assert.deepEqual(read(settingsOf(h)), before);
  });

  it('--remove leaves no empty hooks key in a file it created', () => {
    const h = home();
    g2g(['hooks', '--claude', '--home', h]);
    g2g(['hooks', '--claude', '--remove', '--home', h]);
    assert.deepEqual(read(settingsOf(h)), {});
  });

  it('--dry-run writes nothing', () => {
    const h = home();
    const r = g2g(['hooks', '--dry-run', '--home', h]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /would/);
    assert.ok(!fs.existsSync(settingsOf(h)));
    assert.ok(!fs.existsSync(path.join(h, '.pi', 'agent', 'extensions')));
  });

  it('exits 2 and writes nothing on settings that are not JSON', () => {
    const h = home();
    fs.writeFileSync(settingsOf(h), '{ "theme": ');
    const r = g2g(['hooks', '--claude', '--home', h]);
    assert.equal(r.code, 2, r.out);
    assert.equal(fs.readFileSync(settingsOf(h), 'utf8'), '{ "theme": ');
    assert.ok(!fs.readdirSync(path.join(h, '.claude')).some((f) => f.endsWith('.tmp')));
  });

  it('project scope writes a guarded node command and prints the caveat', () => {
    const cwd = path.join(scratch, 'proj');
    fs.mkdirSync(cwd);
    const r = g2g(['hooks', '--project', '--claude'], { cwd });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /run its own code/);
    const cmds = commands(read(path.join(cwd, '.claude', 'settings.json')));
    assert.equal(cmds.length, 4);
    assert.equal(new Set(cmds).size, 1);
    assert.doesNotMatch(cmds[0]!, /npx/);
    assert.match(cmds[0]!, /node_modules\/@jb9k62\/good2go\/dist\/good2go\.mjs/);
  });

  it('the project command runs the project copy, and is silent when there is none', { skip: process.platform === 'win32' }, () => {
    const cwd = path.join(scratch, 'projrun');
    fs.mkdirSync(cwd);
    assert.equal(g2g(['hooks', '--project', '--claude'], { cwd }).code, 0);
    const command = commands(read(path.join(cwd, '.claude', 'settings.json')))[0]!;
    const sh = (dir: string) => spawnSync('sh', ['-c', command], { cwd: scratch, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });

    const absent = sh(cwd);
    assert.deepEqual([absent.status, absent.stdout, absent.stderr], [0, '', ''], 'no node_modules: nothing, quietly');

    const dist = path.join(cwd, 'node_modules', '@jb9k62', 'good2go', 'dist');
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'good2go.mjs'), 'console.log("ran " + process.argv.slice(2).join(" "));\n');
    const present = sh(cwd);
    assert.equal(present.status, 0, present.stderr);
    assert.equal(present.stdout.trim(), 'ran hook run');

    fs.writeFileSync(path.join(dist, 'good2go.mjs'), 'process.exit(3);\n');
    assert.equal(sh(cwd).status, 0, 'a failing project copy never shows as a hook error');
  });

  it('refuses user scope, writing nothing, when good2go is not on PATH, unless --force', () => {
    const h = home();
    const r = g2g(['hooks', '--claude', '--pi', '--home', h], { env: { PATH: EMPTY } });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /npm i -g @jb9k62\/good2go/);
    assert.ok(!fs.existsSync(settingsOf(h)));
    assert.ok(!fs.existsSync(path.join(h, '.pi', 'agent', 'extensions')));
    assert.equal(g2g(['hooks', '--claude', '--home', h, '--force'], { env: { PATH: EMPTY } }).code, 0);
    assert.ok(fs.existsSync(settingsOf(h)));
  });

  it('writes through a symlinked settings.json, keeps its mode, and leaves no temp file', { skip: process.platform === 'win32' }, () => {
    const h = home();
    const real = path.join(scratch, 'dotfiles-settings-' + n + '.json');
    fs.writeFileSync(real, JSON.stringify({ theme: 'dark' }, null, 2) + '\n', { mode: 0o600 });
    fs.chmodSync(real, 0o600);
    fs.symlinkSync(real, settingsOf(h));
    assert.equal(g2g(['hooks', '--claude', '--home', h]).code, 0);
    assert.ok(fs.lstatSync(settingsOf(h)).isSymbolicLink(), 'still a link');
    assert.equal(read(real).theme, 'dark');
    assert.equal(commands(read(real)).length, 4, 'the dotfile itself was updated');
    assert.equal(fs.statSync(real).mode & 0o777, 0o600);
    for (const dir of [path.dirname(real), path.join(h, '.claude')]) {
      assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith('.tmp')), dir);
    }
  });

  it('--check reports missing, configured and stale', () => {
    const h = home();
    assert.match(g2g(['hooks', '--claude', '--check', '--home', h]).out, /claude: missing/);
    assert.equal(g2g(['hooks', '--claude', '--check', '--home', h]).code, 1);
    g2g(['hooks', '--claude', '--home', h]);
    const ok = g2g(['hooks', '--claude', '--check', '--home', h], { env: { PATH: WITH_G2G } });
    assert.match(ok.out, /claude: configured/);
    assert.match(ok.out, /on PATH: yes/);
    const gone = g2g(['hooks', '--claude', '--check', '--home', h], { env: { PATH: EMPTY } });
    assert.match(gone.out, /claude: configured/);
    assert.match(gone.out, /on PATH: no/);
    assert.match(gone.out, /npm i -g @jb9k62\/good2go/);
    assert.equal(gone.code, 1);
    const data = read(settingsOf(h));
    data.hooks.Stop[0].hooks[0].timeout = 99;
    fs.writeFileSync(settingsOf(h), JSON.stringify(data));
    assert.match(g2g(['hooks', '--claude', '--check', '--home', h]).out, /claude: stale/);
  });
});

describe('good2go hooks (pi)', () => {
  const ext = (h: string) => path.join(h, '.pi', 'agent', 'extensions', 'edukai.ts');

  it('writes a marked extension that calls good2go from PATH, and removes it', () => {
    const h = home();
    assert.equal(g2g(['hooks', '--pi', '--home', h]).code, 0);
    const text = fs.readFileSync(ext(h), 'utf8');
    assert.match(text.split('\n')[0]!, /managed by good2go hooks/);
    assert.match(text, /^const BIN: string \| null = null;/m, 'good2go by name, from PATH');
    assert.ok(!text.includes('node_modules'), 'no project path');
    assert.ok(!text.includes(ROOT), 'no absolute path of the install that ran the command');
    assert.ok(!text.includes("new URL('../skills"));
    assert.match(g2g(['hooks', '--pi', '--check', '--home', h]).out, /pi: configured/);
    assert.equal(g2g(['hooks', '--pi', '--remove', '--home', h]).code, 0);
    assert.ok(!fs.existsSync(ext(h)));
  });

  it('user scope never points into a node_modules, even when run from a project that has one', () => {
    const h = home();
    const project = path.join(scratch, 'cloned');
    fs.mkdirSync(path.join(project, 'node_modules', '@jb9k62', 'good2go', 'dist'), { recursive: true });
    assert.equal(g2g(['hooks', '--pi', '--claude', '--home', h], { cwd: project }).code, 0);
    assert.ok(!fs.readFileSync(ext(h), 'utf8').includes('node_modules'));
    assert.ok(!fs.readFileSync(settingsOf(h), 'utf8').includes('node_modules'));
  });

  it('refuses to replace a file it did not write unless --force', () => {
    const h = home();
    fs.mkdirSync(path.dirname(ext(h)), { recursive: true });
    fs.writeFileSync(ext(h), '// mine\n');
    assert.equal(g2g(['hooks', '--pi', '--home', h]).code, 1);
    assert.equal(fs.readFileSync(ext(h), 'utf8'), '// mine\n');
    assert.equal(g2g(['hooks', '--pi', '--remove', '--home', h]).code, 1);
    assert.equal(fs.readFileSync(ext(h), 'utf8'), '// mine\n');
    assert.equal(g2g(['hooks', '--pi', '--force', '--home', h]).code, 0);
    assert.match(fs.readFileSync(ext(h), 'utf8'), /managed by good2go hooks/);
  });

  it('project scope writes .pi/extensions/edukai.ts pointing at the project copy, relative to itself', () => {
    const cwd = path.join(scratch, 'projpi');
    fs.mkdirSync(cwd);
    assert.equal(g2g(['hooks', '--project', '--pi'], { cwd }).code, 0);
    const text = fs.readFileSync(path.join(cwd, '.pi', 'extensions', 'edukai.ts'), 'utf8');
    assert.match(text, /^const BIN: string \| null = fileURLToPath\(new URL\('\.\.\/\.\.\/node_modules\/@jb9k62\/good2go\/dist\/good2go\.mjs', import\.meta\.url\)\);/m);
    assert.ok(!text.includes(ROOT), 'no absolute path');
  });
});

describe('good2go hook run', () => {
  it('is silent and exits 0 on garbage, empty and non-object input', () => {
    for (const input of ['not json', '', '[1,2]', '{"hook_event_name":"Nope"}']) {
      const r = g2g(['hook', 'run'], { input });
      assert.equal(r.code, 0, input);
      assert.equal(r.out, '', input);
    }
  });

  it('answers from the memory bundle in-process, and stays silent without one', () => {
    const payload = (cwd: string) => JSON.stringify({ hook_event_name: 'SessionStart', cwd, session_id: 't' });
    const here = g2g(['hook', 'run'], { input: payload(ROOT), cwd: ROOT });
    assert.equal(here.code, 0);
    assert.match(here.stdout, /edukai:/);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'g2g-hook-'));
    try {
      const r = g2g(['hook', 'run'], { input: payload(empty), cwd: empty });
      assert.equal(r.code, 0);
      assert.equal(r.out, '');
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
