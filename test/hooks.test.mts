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
function g2g(args: string[], opts: { cwd?: string; input?: string; env?: Record<string, string> } = {}) {
  const r = spawnSync(process.execPath, [GOOD2GO, ...args], {
    cwd: opts.cwd ?? scratch,
    encoding: 'utf8',
    input: opts.input,
    env: { ...process.env, ...opts.env },
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

  it('project scope writes npx --no-install into the folder and prints the caveat', () => {
    const cwd = path.join(scratch, 'proj');
    fs.mkdirSync(cwd);
    const r = g2g(['hooks', '--project', '--claude'], { cwd });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /run its own code/);
    const data = read(path.join(cwd, '.claude', 'settings.json'));
    assert.deepEqual(commands(data), Array(4).fill('npx --no-install good2go hook run'));
  });

  it('--check reports missing, configured and stale', () => {
    const h = home();
    assert.match(g2g(['hooks', '--claude', '--check', '--home', h]).out, /claude: missing/);
    assert.equal(g2g(['hooks', '--claude', '--check', '--home', h]).code, 1);
    g2g(['hooks', '--claude', '--home', h]);
    const ok = g2g(['hooks', '--claude', '--check', '--home', h], { env: { PATH: process.env.PATH ?? '' } });
    assert.match(ok.out, /claude: configured/);
    assert.match(ok.out, /on PATH: (yes|no)/);
    const data = read(settingsOf(h));
    data.hooks.Stop[0].hooks[0].timeout = 99;
    fs.writeFileSync(settingsOf(h), JSON.stringify(data));
    assert.match(g2g(['hooks', '--claude', '--check', '--home', h]).out, /claude: stale/);
  });
});

describe('good2go hooks (pi)', () => {
  const ext = (h: string) => path.join(h, '.pi', 'agent', 'extensions', 'edukai.ts');

  it('writes a marked extension that names the installed hook, and removes it', () => {
    const h = home();
    assert.equal(g2g(['hooks', '--pi', '--home', h]).code, 0);
    const text = fs.readFileSync(ext(h), 'utf8');
    assert.match(text.split('\n')[0]!, /managed by good2go hooks/);
    assert.ok(text.includes(JSON.stringify(path.join(ROOT, 'src', 'g2g-hook.mts'))));
    assert.ok(!text.includes("new URL('../skills"));
    assert.match(g2g(['hooks', '--pi', '--check', '--home', h]).out, /pi: configured/);
    assert.equal(g2g(['hooks', '--pi', '--remove', '--home', h]).code, 0);
    assert.ok(!fs.existsSync(ext(h)));
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

  it('project scope writes .pi/extensions/edukai.ts pointing at node_modules', () => {
    const cwd = path.join(scratch, 'projpi');
    fs.mkdirSync(cwd);
    assert.equal(g2g(['hooks', '--project', '--pi'], { cwd }).code, 0);
    const text = fs.readFileSync(path.join(cwd, '.pi', 'extensions', 'edukai.ts'), 'utf8');
    assert.ok(text.includes('node_modules/@jb9k62/good2go/dist/g2g-hook.mjs'));
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
