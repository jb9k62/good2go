import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'src', 'g2g-skills.mts');

function run(home: string, ...args: string[]) {
  const env = { ...process.env };
  delete env.CLAUDE_CONFIG_DIR;
  delete env.PI_CODING_AGENT_DIR;
  delete env.PI_AGENT_DIR;
  return spawnSync(process.execPath, [TOOL, '--dir', home, ...args], { encoding: 'utf8', env });
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'));

test('installs both skills, without their tools, for the agents whose home exists', () => {
  const home = tmp();
  fs.mkdirSync(path.join(home, '.claude'));
  const r = run(home);
  assert.equal(r.status, 0, r.stderr);
  for (const skill of ['good2go', 'edukai']) {
    assert.ok(fs.existsSync(path.join(home, '.claude', 'skills', skill, 'SKILL.md')));
  }
  assert.ok(fs.existsSync(path.join(home, '.claude', 'skills', 'good2go', 'references', 'PLAYBOOK.md')));
  assert.ok(!fs.existsSync(path.join(home, '.claude', 'src')));
  assert.ok(!fs.existsSync(path.join(home, '.pi')));
  assert.match(r.stdout, /plugin marketplace add jb9k62\/good2go/);
  assert.match(r.stdout, /pi install git:github\.com\/jb9k62\/good2go/);
});

test('flags choose the targets, and an explicit flag creates the home', () => {
  const home = tmp();
  const r = run(home, '--pi', '--agents');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(home, '.pi', 'agent', 'skills', 'edukai', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(home, '.agents', 'skills', 'edukai', 'SKILL.md')));
});

test('refuses to replace without --force, replaces with it', () => {
  const home = tmp();
  const dest = path.join(home, '.claude', 'skills', 'edukai');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'mine.txt'), 'x');
  const refused = run(home, '--claude');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--force/);
  assert.ok(fs.existsSync(path.join(dest, 'mine.txt')));
  const forced = run(home, '--claude', '--force');
  assert.equal(forced.status, 0, forced.stderr);
  assert.ok(!fs.existsSync(path.join(dest, 'mine.txt')));
  assert.ok(fs.existsSync(path.join(dest, 'SKILL.md')));
});

test('--force replaces a symlinked skill without touching its target', () => {
  const home = tmp();
  const target = tmp();
  fs.writeFileSync(path.join(target, 'keep.txt'), 'x');
  const skills = path.join(home, '.claude', 'skills');
  fs.mkdirSync(skills, { recursive: true });
  fs.symlinkSync(target, path.join(skills, 'edukai'), 'dir');
  assert.equal(run(home, '--claude').status, 1);
  assert.equal(run(home, '--claude', '--force').status, 0);
  assert.ok(fs.existsSync(path.join(target, 'keep.txt')));
  assert.ok(!fs.lstatSync(path.join(skills, 'edukai')).isSymbolicLink());
  assert.ok(!fs.existsSync(path.join(target, 'SKILL.md')));
});

test('no agent home and no flags is exit 2; unknown flags are exit 2', () => {
  const home = tmp();
  assert.equal(run(home).status, 2);
  assert.equal(run(home, '--bogus').status, 2);
});
