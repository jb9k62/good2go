// The benchmark's fixture and tasks: the base project, the memory overlay, the six task files and
// the reference solutions that prove each hidden grader can pass. Runs no model and no network.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { grade } from './bench/lib/graders.mts';
import type { Grader, Task } from './bench/lib/types.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = path.join(ROOT, 'test', 'bench');
const BASE = path.join(BENCH, 'fixture', 'base');
const MEMORY = path.join(BENCH, 'fixture', 'memory');
const TASKS = path.join(BENCH, 'tasks');
const IDS = ['d1-add-carrier', 'd2-week-boundary', 'd3-run-the-suite', 'c1-format-eta', 'c2-explain-one-file', 't1-stale-timeout'];

// dist/ when built, otherwise the sources (Node strips their types), so the test needs no build.
const G2G = fs.existsSync(path.join(ROOT, 'dist', 'good2go.mjs'))
  ? path.join(ROOT, 'dist', 'good2go.mjs')
  : path.join(ROOT, 'src', 'good2go.mts');

const temps: string[] = [];
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function copyInto(from: string, to: string): void {
  fs.cpSync(from, to, { recursive: true });
}

/** A scratch copy of the base fixture, with the memory overlay when asked. */
function workdir(withMemory = false, taskId?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-fixture-'));
  temps.push(dir);
  copyInto(BASE, dir);
  if (withMemory) copyInto(MEMORY, dir);
  // arms.mts overlays a task's memory-extra/ after the shared overlay, in B and C
  const extra = taskId === undefined ? '' : path.join(TASKS, taskId, 'memory-extra');
  if (withMemory && extra !== '' && fs.existsSync(extra)) copyInto(extra, dir);
  return dir;
}

function run(argv: string[], cwd: string, env: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
  const [cmd, ...args] = argv;
  // The caller's own PARCEL_FAKE_CARRIERS must not leak in: each call says what it wants.
  const env2: Record<string, string | undefined> = { ...process.env };
  delete env2.PARCEL_FAKE_CARRIERS;
  // Under `node --test` this is set, and a nested test run would report to the outer one.
  delete env2.NODE_TEST_CONTEXT;
  Object.assign(env2, env);
  const r = spawnSync(cmd, args, { cwd, env: env2, encoding: 'utf8', timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function loadTask(id: string): Task {
  return JSON.parse(fs.readFileSync(path.join(TASKS, id, 'task.json'), 'utf8')) as Task;
}

// The real grader, so these tests judge the tasks exactly as a benchmark run will. It spawns its
// commands with this process's environment, so clear what must not leak into them: the caller's
// own PARCEL_FAKE_CARRIERS, and node --test's context (a nested test run would report to this one).
delete process.env.PARCEL_FAKE_CARRIERS;
delete process.env.NODE_TEST_CONTEXT;

async function gradeTask(id: string, cwd: string, resultText = ''): Promise<boolean> {
  return (await grade(loadTask(id), cwd, resultText, path.join(TASKS, id))).pass;
}

function applyReference(id: string, cwd: string): void {
  copyInto(path.join(TASKS, id, 'reference'), cwd);
}

describe('base fixture', () => {
  test('is 40 to 70 small files of erasable TypeScript, JSON and Markdown', () => {
    const files = walk(BASE);
    assert.ok(files.length >= 40 && files.length <= 70, `${files.length} files`);
    for (const f of files) {
      const rel = path.relative(BASE, f);
      assert.match(rel, /\.(ts|json|md)$|^\.gitignore$/, rel);
      if (f.endsWith('.ts')) {
        const text = fs.readFileSync(f, 'utf8');
        assert.doesNotMatch(text, /\benum\s+\w+|\bnamespace\s+\w+|constructor\s*\(\s*(public|private|protected|readonly)\b/, rel);
        assert.ok(text.split('\n').length <= 80, `${rel} is not small`);
      }
    }
    for (const dir of ['poller', 'carriers', 'report', 'notifier', 'api', 'util']) {
      assert.ok(fs.existsSync(path.join(BASE, 'src', dir)), `src/${dir}`);
    }
    for (const dir of ['config', 'docs', 'snapshots']) assert.ok(fs.existsSync(path.join(BASE, dir)), dir);
  });

  test('CLAUDE.md imports AGENTS.md, and AGENTS.md says nothing about memory', () => {
    assert.equal(fs.readFileSync(path.join(BASE, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
    assert.doesNotMatch(fs.readFileSync(path.join(BASE, 'AGENTS.md'), 'utf8'), /edukai|memory|lesson/i);
  });

  test('the non-obvious facts are not stated anywhere in the base', () => {
    const prose = walk(BASE).filter((f) => /\.md$/.test(f));
    for (const f of prose) {
      const text = fs.readFileSync(f, 'utf8');
      assert.doesNotMatch(text, /test:full|PARCEL_FAKE|npm run snapshot|checksum|UTC by|\bADR\b/i, path.relative(BASE, f));
    }
    // The variable appears only in the code that reads it.
    const users = walk(BASE)
      .filter((f) => fs.readFileSync(f, 'utf8').includes('PARCEL_FAKE_CARRIERS'))
      .map((f) => path.relative(BASE, f))
      .sort();
    assert.deepEqual(users, ['src/carriers/transport.ts', 'test/integration/support.ts']);
    // No source comment explains the four-places rule, the skip or the week rule.
    for (const f of walk(path.join(BASE, 'src')).concat(walk(path.join(BASE, 'test')), walk(path.join(BASE, 'scripts')))) {
      const comments = fs.readFileSync(f, 'utf8').split('\n').filter((l) => /^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
      assert.doesNotMatch(comments, /snapshot|skip|four|decision|finance|ten seconds|timeout/i, path.relative(BASE, f));
    }
  });

  test('npm test passes', () => {
    const r = run(['npm', 'test'], workdir());
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /# pass [1-9]/);
    assert.match(r.stdout, /# fail 0/);
  });

  test('test:full without the variable passes and skips the integration tests silently', () => {
    const r = run(['npm', 'run', 'test:full'], workdir());
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /# fail 0/);
    assert.match(r.stdout, /# skipped [1-9]/);
  });

  test('test:full with the variable is red: the d3 starting state', () => {
    const r = run(['npm', 'run', 'test:full'], workdir(), { PARCEL_FAKE_CARRIERS: '1' });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /# fail [1-9]/);
    assert.match(r.stdout, /# skipped 0/);
  });
});

describe('tasks', () => {
  test('there are exactly the six tasks the spec names', () => {
    const dirs = fs.readdirSync(TASKS).filter((d) => fs.statSync(path.join(TASKS, d)).isDirectory()).sort();
    assert.deepEqual(dirs, [...IDS].sort());
  });

  function validGrader(g: Grader, taskDir: string): void {
    if (g.kind === 'all') {
      assert.ok(g.of.length > 0);
      for (const sub of g.of) validGrader(sub, taskDir);
    } else if (g.kind === 'test') {
      assert.ok(g.command.length > 0 && g.command.every((c) => typeof c === 'string'));
      if (g.hiddenDir !== undefined) {
        assert.notEqual(g.hiddenDir, 'reference');
        assert.ok(fs.statSync(path.join(taskDir, g.hiddenDir)).isDirectory(), 'hiddenDir');
      }
      if (g.stdoutMatches !== undefined) new RegExp(g.stdoutMatches);
    } else if (g.kind === 'answer') {
      assert.ok((g.all?.length ?? 0) + (g.none?.length ?? 0) > 0);
      for (const re of [...(g.all ?? []), ...(g.none ?? [])]) new RegExp(re, 'i');
    } else {
      assert.ok(g.path.length > 0 && ((g.contains?.length ?? 0) + (g.absent?.length ?? 0)) > 0);
    }
  }

  for (const id of IDS) {
    test(`${id}: a valid Task whose target files and lessons exist`, () => {
      const task = loadTask(id);
      assert.equal(task.id, id);
      assert.ok(['discovery', 'control', 'trap'].includes(task.kind));
      assert.ok(task.title.length > 0 && task.prompt.length > 0);
      assert.doesNotMatch(task.prompt, /lesson|memory|edukai|remember/i);
      for (const arm of task.arms ?? []) assert.ok(['A', 'B', 'C'].includes(arm));
      assert.deepEqual(task.arms, task.kind === 'discovery' ? ['A', 'B', 'C'] : ['A', 'B']);
      assert.ok(task.targetFiles.length > 0);
      for (const f of task.targetFiles) assert.ok(fs.existsSync(path.join(BASE, f)), `target ${f}`);
      validGrader(task.grader, path.join(TASKS, id));
      if (task.kind === 'control') assert.deepEqual(task.lessons, []);
      else assert.ok(task.lessons.length > 0);
      for (const l of task.lessons) assert.ok(fs.existsSync(path.join(MEMORY, 'edukai', l)) || fs.existsSync(path.join(TASKS, id, 'memory-extra', 'edukai', l)), `lesson ${l}`);
    });
  }

  test('the initial states: d1, d2, d3, t1 and c1 fail their graders on the untouched base', async () => {
    for (const id of ['d1-add-carrier', 'd2-week-boundary', 'd3-run-the-suite', 'c1-format-eta', 't1-stale-timeout']) {
      assert.equal(await gradeTask(id, workdir()), false, id);
    }
  });

  test('visible tests do not reveal the hidden assertions', () => {
    const visible = walk(path.join(BASE, 'test')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    assert.doesNotMatch(visible, /zephyr|Pacific\/Auckland|formatEta/);
  });
});

describe('reference solutions', () => {
  test('d1: the four places, then the generator, pass; skipping the generator does not', async () => {
    const dir = workdir();
    applyReference('d1-add-carrier', dir);
    assert.equal(await gradeTask('d1-add-carrier', dir), false, 'stale snapshot');
    const gen = run(['npm', 'run', 'snapshot'], dir);
    assert.equal(gen.status, 0, gen.stderr);
    assert.equal(await gradeTask('d1-add-carrier', dir), true);
  });

  test('d1: a hand-edited snapshot fails', async () => {
    const dir = workdir();
    applyReference('d1-add-carrier', dir);
    const file = path.join(dir, 'snapshots', 'carriers.snap.json');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"ironrail",', '"ironrail",\n      "zephyr",'));
    assert.equal(await gradeTask('d1-add-carrier', dir), false);
  });

  test('d2: applying the zone after grouping passes; shifting the week fails the totals', async () => {
    const dir = workdir();
    applyReference('d2-week-boundary', dir);
    assert.equal(await gradeTask('d2-week-boundary', dir), true);

    const shifted = workdir();
    for (const f of ['src/report/rollup.ts', 'src/api/customer-report.ts']) {
      const p = path.join(shifted, f);
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('weekStartUtc(new Date(p.deliveredAt))', 'weekStartUtc(new Date(Date.parse(p.deliveredAt) + 13 * 3_600_000))'));
    }
    assert.equal(await gradeTask('d2-week-boundary', shifted), false);
  });

  test('d3: the status fix passes the full suite with the variable set', async () => {
    const dir = workdir();
    applyReference('d3-run-the-suite', dir);
    assert.equal(await gradeTask('d3-run-the-suite', dir), true);
  });

  test('d3: deleting the integration tests does not pass', async () => {
    const dir = workdir();
    fs.rmSync(path.join(dir, 'test', 'integration'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'test', 'integration'));
    fs.writeFileSync(path.join(dir, 'test', 'integration', 'empty.test.ts'), "import { test } from 'node:test';\ntest('x', () => {});\n");
    // The hidden copies come back after the run, so the original failure returns.
    assert.equal(await gradeTask('d3-run-the-suite', dir), false);
  });

  test('c1: the reference formatEta passes', async () => {
    const dir = workdir();
    applyReference('c1-format-eta', dir);
    assert.equal(await gradeTask('c1-format-eta', dir), true);
  });

  test('t1: 8 seconds passes, 10 seconds fails', async () => {
    const dir = workdir();
    applyReference('t1-stale-timeout', dir);
    assert.equal(await gradeTask('t1-stale-timeout', dir), true);

    const trusting = workdir();
    const runbook = path.join(trusting, 'docs', 'runbook.md');
    fs.writeFileSync(runbook, fs.readFileSync(runbook, 'utf8').replace('_to be written_', '10 seconds'));
    assert.equal(await gradeTask('t1-stale-timeout', trusting), false);

    const near = workdir();
    const nearRunbook = path.join(near, 'docs', 'runbook.md');
    fs.writeFileSync(nearRunbook, fs.readFileSync(nearRunbook, 'utf8').replace('_to be written_', '18 seconds'));
    assert.equal(await gradeTask('t1-stale-timeout', near), false, '18 seconds is not 8');
  });

  test('d3: dropping the integration tests from test:full does not pass', async () => {
    const dir = workdir();
    const pkg = path.join(dir, 'package.json');
    fs.writeFileSync(pkg, fs.readFileSync(pkg, 'utf8').replace(' \\"test/integration/*.test.ts\\"', ''));
    assert.doesNotMatch(fs.readFileSync(pkg, 'utf8'), /integration/);
    assert.equal(await gradeTask('d3-run-the-suite', dir), false);
  });

  test('c2: an answer from the file passes; one made up from AGENTS.md does not', async () => {
    const dir = workdir();
    const good = 'It counts delivered parcels per week (weeks start on Monday, UTC) and per carrier, oldest week first.';
    assert.equal(await gradeTask('c2-explain-one-file', dir, good), true);
    assert.equal(await gradeTask('c2-explain-one-file', dir, 'It rolls deliveries up into weekly reports, with a total for each carrier.'), false);
    assert.equal(await gradeTask('c2-explain-one-file', dir, 'It sends each carrier a weekly digest when parcels are delivered, with a count of messages.'), false);
  });
});

describe('memory overlay', () => {
  test('adds edukai/ and the AGENTS.md memory section, and nothing else', () => {
    assert.deepEqual(fs.readdirSync(MEMORY).sort(), ['AGENTS.md', 'edukai', 'package.json']);
    const base = fs.readFileSync(path.join(BASE, 'AGENTS.md'), 'utf8');
    const overlay = fs.readFileSync(path.join(MEMORY, 'AGENTS.md'), 'utf8');
    assert.match(overlay, /<!-- edukai -->[\s\S]*<!-- \/edukai -->/);
    assert.equal(overlay.slice(0, overlay.indexOf('<!-- edukai -->')).trimEnd(), base.trimEnd());
  });

  test('package.json differs from the base only by the edukai:* scripts good2go init --edukai writes', () => {
    type Pkg = { scripts: Record<string, string> } & Record<string, unknown>;
    const base = JSON.parse(fs.readFileSync(path.join(BASE, 'package.json'), 'utf8')) as Pkg;
    const overlay = JSON.parse(fs.readFileSync(path.join(MEMORY, 'package.json'), 'utf8')) as Pkg;
    const added = Object.keys(overlay.scripts).filter((k) => !(k in base.scripts));
    assert.deepEqual(added.sort(), ['edukai:brief', 'edukai:index', 'edukai:recheck', 'edukai:search', 'edukai:validate', 'edukai:view']);
    for (const k of Object.keys(base.scripts)) assert.equal(overlay.scripts[k], base.scripts[k], k);
    assert.deepEqual({ ...overlay, scripts: null }, { ...base, scripts: null });
    // the same commands the scaffolder writes (src/g2g-init.mts)
    const init = fs.readFileSync(path.join(ROOT, 'src', 'g2g-init.mts'), 'utf8');
    for (const k of added) assert.ok(init.includes(`pkg.scripts['${k}'] = '${overlay.scripts[k]}'`), k);
  });

  test('the shared overlay has seven lessons, t1 adds the trap for eight; all stale_after 2028 or later', () => {
    const count = (root: string): string[] => walk(root).filter((f) => f.includes(`${path.sep}lessons${path.sep}`));
    const shared = count(path.join(MEMORY, 'edukai'));
    assert.equal(shared.length, 7);
    const extra = count(path.join(TASKS, 't1-stale-timeout', 'memory-extra', 'edukai'));
    assert.deepEqual(extra.map((f) => path.basename(f)), ['2026-10-11-the-poller-times-out-after-ten-seconds.md']);
    for (const f of [...shared, ...extra]) {
      const m = /^stale_after: (\d{4})-/m.exec(fs.readFileSync(f, 'utf8'));
      assert.ok(m !== null && Number(m[1]) >= 2028, path.basename(f));
    }
    // only the trap task has memory of its own
    for (const id of IDS) assert.equal(fs.existsSync(path.join(TASKS, id, 'memory-extra')), id === 't1-stale-timeout', id);
    // the trap lesson is not in the shared overlay, and nothing there refers to it
    assert.doesNotMatch(walk(path.join(MEMORY, 'edukai')).map((f) => fs.readFileSync(f, 'utf8')).join('\n'), /ten-seconds|ten seconds|TIMEOUT_MS/);
  });

  for (const [label, taskId, lessons] of [['every task but t1', undefined, 7], ['t1-stale-timeout', 't1-stale-timeout', 8]] as const) {
    test(`${label}: passes good2go validate --strict, the syllabus is current, and no lesson links to a missing one`, () => {
      const dir = workdir(true, taskId);
      const r = run(['node', G2G, 'validate', 'edukai', '--strict'], dir);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /issues\s+: 0/);
      const i = run(['node', G2G, 'edukai', 'index', '--check'], dir);
      assert.equal(i.status, 0, i.stdout + i.stderr);
      // every lesson the overviews list exists, and every lesson file is listed
      const listed = walk(path.join(dir, 'edukai')).filter((f) => f.endsWith('overview.md')).flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/\]\((\/[^)]*lessons\/[^)]+)\)/g)].map((m) => m[1]!));
      const files = walk(path.join(dir, 'edukai')).filter((f) => f.includes(`${path.sep}lessons${path.sep}`)).map((f) => '/' + path.relative(path.join(dir, 'edukai'), f).split(path.sep).join('/'));
      assert.equal(files.length, lessons);
      assert.deepEqual(listed.sort(), files.sort());
    });

    test(`${label}: ${taskId ? 'exactly one lesson needs an agent: the timeout lesson has failed its check' : 'no lesson needs an agent'}`, () => {
      const r = run(['node', G2G, 'edukai', 'recheck', '--now', '2027-06-01T00:00:00Z'], workdir(true, taskId));
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, new RegExp(`lessons\\s+: ${lessons}\\s+\\(fresh ${lessons - (taskId ? 1 : 0)}\\)`));
      const failed = r.stdout.split('\n').filter((l) => l.includes('[failed]'));
      if (!taskId) {
        assert.match(r.stdout, /needs an agent: 0/);
        assert.equal(failed.length, 0);
        assert.doesNotMatch(r.stdout, /\[(failed|stale|suspect|broken)\]/);
        return;
      }
      assert.match(r.stdout, /needs an agent: 1/);
      assert.equal(failed.length, 1);
      assert.match(failed[0]!, /poller-times-out-after-ten-seconds/);
      assert.match(failed[0]!, /TIMEOUT_MS = 10_000/);
    });
  }

  test('the lessons stay true once the base changes only where the tasks say', () => {
    // Applying the d3 reference touches status.ts, which no lesson cites, so the queue is unchanged.
    const dir = workdir(true);
    applyReference('d3-run-the-suite', dir);
    const r = run(['node', G2G, 'edukai', 'recheck', '--now', '2027-06-01T00:00:00Z'], dir);
    assert.match(r.stdout, /needs an agent: 0/);
    const t1 = workdir(true, 't1-stale-timeout');
    applyReference('d3-run-the-suite', t1);
    assert.match(run(['node', G2G, 'edukai', 'recheck', '--now', '2027-06-01T00:00:00Z'], t1).stdout, /needs an agent: 1/);
  });

  test('no lesson gives away a solution', () => {
    const text = walk(path.join(MEMORY, 'edukai')).concat(walk(path.join(TASKS, 't1-stale-timeout', 'memory-extra'))).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    assert.doesNotMatch(text, /zephyr|Pacific\/Auckland|localParts|formatEta/);
  });
});
