/**
 * The benchmark's graders, statistics and report, on throwaway folders under .cache/. No model
 * call and no network: the report runs on a synthetic results folder written here.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { _execArgvForTests as execArgv, grade } from './bench/lib/graders.mts';
import { renderMarkdown } from './bench/lib/render.mts';
import { absDelta, fmt, groupBy, median, passRate, percentDelta, range } from './bench/lib/stats.mts';
import type { Grader, GradeResult, RunMeta, RunResult, Task } from './bench/lib/types.mts';
import { buildReport } from './bench/report.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'test', 'bench', 'report.mts');
const CACHE = path.join(ROOT, '.cache', 'test');
fs.mkdirSync(CACHE, { recursive: true });
const scratch = fs.mkdtempSync(path.join(CACHE, 'bench-report-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
function dir(prefix: string): string {
  const d = path.join(scratch, `${prefix}-${counter++}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function write(root: string, rel: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

function task(grader: Grader, over: Partial<Task> = {}): Task {
  return {
    id: 't-test',
    kind: 'discovery',
    title: 'Test task',
    prompt: 'Do the thing.',
    targetFiles: [],
    grader,
    lessons: [],
    ...over,
  };
}

const NODE = process.execPath;

// ---------------------------------------------------------------------------------------------
// Graders
// ---------------------------------------------------------------------------------------------

describe('grade: test kind', () => {
  it('passes on exit 0 and reports the exit code', async () => {
    const wd = dir('wd');
    const r = await grade(task({ kind: 'test', command: [NODE, '-e', 'process.exit(0)'] }), wd, '', dir('task'));
    assert.equal(r.pass, true);
    assert.deepEqual(r.detail, ['test: exit 0']);
  });

  it('fails on a non-zero exit and names it', async () => {
    const wd = dir('wd');
    const r = await grade(task({ kind: 'test', command: [NODE, '-e', 'process.exit(3)'] }), wd, '', dir('task'));
    assert.equal(r.pass, false);
    assert.deepEqual(r.detail, ['test: exit 3']);
  });

  it('runs in the workdir', async () => {
    const wd = dir('wd');
    write(wd, 'here.txt', 'x');
    const r = await grade(
      task({ kind: 'test', command: [NODE, '-e', "process.exit(require('node:fs').existsSync('here.txt') ? 0 : 1)"] }),
      wd,
      '',
      dir('task'),
    );
    assert.equal(r.pass, true);
  });

  it('honours stdoutMatches, case-insensitively', async () => {
    const wd = dir('wd');
    const out = "console.log('# pass 3\\n# fail 0')";
    const ok = await grade(
      task({ kind: 'test', command: [NODE, '-e', out], stdoutMatches: '# PASS [1-9]' }),
      wd,
      '',
      dir('task'),
    );
    assert.equal(ok.pass, true);
    assert.ok(ok.detail.includes('test: stdout matched /# PASS [1-9]/'));

    const zero = await grade(
      task({ kind: 'test', command: [NODE, '-e', out], stdoutMatches: '# pass 0' }),
      wd,
      '',
      dir('task'),
    );
    assert.equal(zero.pass, false, 'a clean exit with no matching stdout is not a pass');
    assert.ok(zero.detail.some((l) => l.includes('did not match')));
  });

  it('fails when the command cannot be found, saying why', async () => {
    const r = await grade(
      task({ kind: 'test', command: ['no-such-binary-for-the-bench-tests'] }),
      dir('wd'),
      '',
      dir('task'),
    );
    assert.equal(r.pass, false);
    assert.match(r.detail[0]!, /could not run: no-such-binary-for-the-bench-tests not found/);
  });

  it('fails an empty command rather than passing it', async () => {
    const r = await grade(task({ kind: 'test', command: [] }), dir('wd'), '', dir('task'));
    assert.equal(r.pass, false);
    assert.match(r.detail[0]!, /could not run/);
  });

  it('fails an invalid stdoutMatches regex', async () => {
    const r = await grade(
      task({ kind: 'test', command: [NODE, '-e', 'process.exit(0)'], stdoutMatches: '([' }),
      dir('wd'),
      '',
      dir('task'),
    );
    assert.equal(r.pass, false);
    assert.match(r.detail[0]!, /could not run: invalid regex/);
  });

  it('copies the hidden directory into the workdir only at grade time', async () => {
    const taskDir = dir('task');
    write(taskDir, 'hidden/marker.txt', 'hidden');
    const wd = dir('wd');
    const before = fs.existsSync(path.join(wd, 'marker.txt'));
    assert.equal(before, false);
    const cmd = [NODE, '-e', "process.exit(require('node:fs').existsSync('marker.txt') ? 0 : 1)"];
    const r = await grade(task({ kind: 'test', hiddenDir: 'hidden', command: cmd }), wd, '', taskDir);
    assert.equal(r.pass, true, 'the hidden file is present when the command runs');
    assert.equal(fs.readFileSync(path.join(wd, 'marker.txt'), 'utf8'), 'hidden');
  });

  it('fails when the hidden directory is missing or escapes the task folder', async () => {
    const taskDir = dir('task');
    const cmd = [NODE, '-e', 'process.exit(0)'];
    const missing = await grade(task({ kind: 'test', hiddenDir: 'nope', command: cmd }), dir('wd'), '', taskDir);
    assert.equal(missing.pass, false);
    assert.match(missing.detail[0]!, /could not run: hidden directory nope is missing/);

    const escape = await grade(task({ kind: 'test', hiddenDir: '../x', command: cmd }), dir('wd'), '', taskDir);
    assert.equal(escape.pass, false);
    assert.match(escape.detail[0]!, /not inside the task folder/);
  });
});

describe('grade: command environment', () => {
  it('scrubs NODE_TEST_CONTEXT and PARCEL_FAKE_CARRIERS, and a command can set its own', async () => {
    const saved = { ctx: process.env.NODE_TEST_CONTEXT, fake: process.env.PARCEL_FAKE_CARRIERS };
    process.env.NODE_TEST_CONTEXT = 'child-v8';
    process.env.PARCEL_FAKE_CARRIERS = '1';
    try {
      const probe = "process.exit(process.env.NODE_TEST_CONTEXT === undefined && process.env.PARCEL_FAKE_CARRIERS === undefined ? 0 : 3)";
      const clean = await grade(task({ kind: 'test', command: [NODE, '-e', probe] }), dir('wd'), '', dir('task'));
      assert.equal(clean.pass, true, clean.detail.join('\n'));
      const own = await grade(
        task({ kind: 'test', command: ['env', 'PARCEL_FAKE_CARRIERS=1', NODE, '-e', "process.exit(process.env.PARCEL_FAKE_CARRIERS === '1' ? 0 : 3)"] }),
        dir('wd'),
        '',
        dir('task'),
      );
      assert.equal(own.pass, true, own.detail.join('\n'));
    } finally {
      if (saved.ctx === undefined) delete process.env.NODE_TEST_CONTEXT; else process.env.NODE_TEST_CONTEXT = saved.ctx;
      if (saved.fake === undefined) delete process.env.PARCEL_FAKE_CARRIERS; else process.env.PARCEL_FAKE_CARRIERS = saved.fake;
    }
  });
});

describe('grade: command processes', () => {
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  it('a timeout fails the check and kills the whole process tree', async () => {
    const wd = dir('wd');
    const r = await execArgv(['sh', '-c', 'sleep 30 & echo $! > bg.pid; wait'], wd, 500);
    assert.match(r.error ?? '', /timed out/);
    const pid = Number(fs.readFileSync(path.join(wd, 'bg.pid'), 'utf8'));
    await new Promise((res) => setTimeout(res, 100));
    assert.equal(alive(pid), false, 'the background grandchild was killed with the group');
  });

  it('a background process holding stdout does not keep the grade waiting, and is killed', async () => {
    const wd = dir('wd');
    const t0 = Date.now();
    const r = await execArgv(['sh', '-c', 'sleep 30 & echo $! > bg.pid; echo ok'], wd, 20_000);
    assert.equal(r.error, null);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, 'ok\n');
    assert.ok(Date.now() - t0 < 10_000, 'resolved without waiting for the grandchild');
    const pid = Number(fs.readFileSync(path.join(wd, 'bg.pid'), 'utf8'));
    await new Promise((res) => setTimeout(res, 100));
    assert.equal(alive(pid), false);
  });

  it('a process killed by a signal is a failure, not exit 0', async () => {
    const r = await execArgv([NODE, '-e', "process.kill(process.pid, 'SIGTERM')"], dir('wd'));
    assert.equal(r.code, -1);
    assert.match(r.error ?? '', /killed by SIGTERM/);
  });
});

describe('grade: answer kind', () => {
  it('passes when every `all` regex matches, case-insensitively', async () => {
    const r = await grade(
      task({ kind: 'answer', all: ['zephyr', '\\d+ s'] }),
      dir('wd'),
      'Added ZEPHYR; the timeout is 8 s.',
      dir('task'),
    );
    assert.equal(r.pass, true);
    assert.deepEqual(r.detail, ['answer: /zephyr/ matched', 'answer: /\\d+ s/ matched']);
  });

  it('fails when one `all` regex misses', async () => {
    const r = await grade(task({ kind: 'answer', all: ['zephyr', 'kiwi'] }), dir('wd'), 'zephyr', dir('task'));
    assert.equal(r.pass, false);
    assert.ok(r.detail.includes('answer: /kiwi/ did not match'));
  });

  it('fails when a `none` regex matches, passes when none does', async () => {
    const forbidden = await grade(
      task({ kind: 'answer', none: ['10'] }),
      dir('wd'),
      'the timeout is 10 s',
      dir('task'),
    );
    assert.equal(forbidden.pass, false);
    assert.ok(forbidden.detail.includes('answer: /10/ matched (forbidden)'));

    const clean = await grade(task({ kind: 'answer', none: ['10'] }), dir('wd'), 'the timeout is 8 s', dir('task'));
    assert.equal(clean.pass, true);
  });

  it('fails an invalid regex and an answer grader with no regexes', async () => {
    const bad = await grade(task({ kind: 'answer', all: ['(['] }), dir('wd'), 'x', dir('task'));
    assert.equal(bad.pass, false);
    assert.match(bad.detail[0]!, /could not run: invalid regex/);

    const empty = await grade(task({ kind: 'answer' }), dir('wd'), 'x', dir('task'));
    assert.equal(empty.pass, false, 'no checks is not a vacuous pass');
  });

  it('fails a `none`-only answer grader when the answer is empty', async () => {
    const r = await grade(task({ kind: 'answer', none: ['10'] }), dir('wd'), '  \n', dir('task'));
    assert.equal(r.pass, false);
    assert.match(r.detail.join('\n'), /no answer text/);
  });
});

describe('grade: file kind', () => {
  it('checks contains and absent, case-insensitively', async () => {
    const wd = dir('wd');
    write(wd, 'docs/runbook.md', 'The poll timeout is 8 s.\nSee config.\n');
    const ok = await grade(
      task({ kind: 'file', path: 'docs/runbook.md', contains: ['8 s'], absent: ['10 s'] }),
      wd,
      '',
      dir('task'),
    );
    assert.equal(ok.pass, true);

    const bad = await grade(
      task({ kind: 'file', path: 'docs/runbook.md', contains: ['CONFIG'], absent: ['8 s'] }),
      wd,
      '',
      dir('task'),
    );
    assert.equal(bad.pass, false);
    assert.ok(bad.detail.includes('file: docs/runbook.md contains forbidden /8 s/'));
  });

  it('fails a missing file', async () => {
    const r = await grade(task({ kind: 'file', path: 'nope.md', contains: ['x'] }), dir('wd'), '', dir('task'));
    assert.equal(r.pass, false);
    assert.deepEqual(r.detail, ['file: nope.md does not exist']);
  });

  it('fails a path that escapes the workdir', async () => {
    const r = await grade(task({ kind: 'file', path: '../outside.md' }), dir('wd'), '', dir('task'));
    assert.equal(r.pass, false);
    assert.match(r.detail[0]!, /could not run: ".*" is not a path inside the workdir/);
  });

  it('fails an invalid regex', async () => {
    const wd = dir('wd');
    write(wd, 'a.txt', 'a');
    const r = await grade(task({ kind: 'file', path: 'a.txt', contains: ['*'] }), wd, '', dir('task'));
    assert.equal(r.pass, false);
    assert.match(r.detail[0]!, /could not run: invalid regex/);
  });

  it('passes an existence check with no contains or absent', async () => {
    const wd = dir('wd');
    write(wd, 'a.txt', 'a');
    const r = await grade(task({ kind: 'file', path: 'a.txt' }), wd, '', dir('task'));
    assert.equal(r.pass, true);
    assert.deepEqual(r.detail, ['file: a.txt exists']);
  });
});

describe('grade: all kind', () => {
  it('passes only when every part passes, and reports every part', async () => {
    const wd = dir('wd');
    write(wd, 'a.txt', 'alpha');
    const grader: Grader = {
      kind: 'all',
      of: [
        { kind: 'file', path: 'a.txt', contains: ['alpha'] },
        { kind: 'answer', all: ['beta'] },
      ],
    };
    const r = await grade(task(grader), wd, 'alpha', dir('task'));
    assert.equal(r.pass, false);
    assert.equal(r.detail.length, 2, 'the passing part is still reported');
    assert.equal(r.detail[0], 'file: a.txt contains /alpha/');
    assert.equal(r.detail[1], 'answer: /beta/ did not match');
  });

  it('fails an empty list', async () => {
    const r = await grade(task({ kind: 'all', of: [] }), dir('wd'), '', dir('task'));
    assert.equal(r.pass, false);
  });
});

describe('grade: unknown kind', () => {
  it('fails rather than passing', async () => {
    const r = await grade(task({ kind: 'mystery' } as unknown as Grader), dir('wd'), '', dir('task'));
    assert.equal(r.pass, false);
    assert.match(r.detail[0]!, /could not run: unknown grader kind/);
  });
});

// ---------------------------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------------------------

describe('stats', () => {
  it('median of odd, even, empty and partly missing lists', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), null);
    assert.equal(median([null, 5, undefined, 7]), 6);
    assert.equal(median([null]), null);
  });

  it('range gives min and max, or null when empty', () => {
    assert.deepEqual(range([0.3, 0.1, null, 0.2]), { min: 0.1, max: 0.3 });
    assert.equal(range([]), null);
  });

  it('absolute and percent deltas, with a zero baseline having no percent', () => {
    assert.ok(Math.abs((absDelta(0.42, 0.32) ?? NaN) + 0.1) < 1e-12);
    assert.ok(Math.abs((percentDelta(50, 40) ?? NaN) + 20) < 1e-12);
    assert.equal(percentDelta(0, 0), 0);
    assert.equal(percentDelta(0, 5), null);
    assert.equal(absDelta(null, 5), null);
    assert.equal(percentDelta(5, null), null);
  });

  it('pass rate counts passes over runs, null with no runs', () => {
    assert.deepEqual(passRate([true, false, true]), { passing: 2, total: 3, rate: 2 / 3 });
    assert.deepEqual(passRate([]), { passing: 0, total: 0, rate: null });
  });

  it('groupBy keeps first-seen order', () => {
    const g = groupBy(['b1', 'a1', 'b2'], (s) => s[0]!);
    assert.deepEqual([...g.keys()], ['b', 'a']);
    assert.deepEqual(g.get('b'), ['b1', 'b2']);
  });

  it('fmt prints an en dash for missing values', () => {
    assert.equal(fmt(null), '–');
    assert.equal(fmt(1.2345, 2), '1.23');
  });
});

// ---------------------------------------------------------------------------------------------
// Report: a synthetic results folder
// ---------------------------------------------------------------------------------------------

function runOf(taskId: string, kind: RunResult['kind'], arm: RunResult['arm'], rep: number, over: Partial<RunResult> = {}): RunResult {
  return {
    schema: 1,
    id: `${taskId}.${arm}.${rep}`,
    task: taskId,
    kind,
    arm,
    rep,
    model: 'claude-sonnet-5-5',
    claudeVersion: '2.1.0',
    gitSha: 'abc1234',
    startedAt: '2026-10-10T09:00:00.000Z',
    durationMs: 60_000,
    exitCode: 0,
    subtype: 'success',
    isError: false,
    budgetExceeded: false,
    resultText: 'done',
    numTurns: 10,
    costUsd: 0.4,
    usage: { input: 1000, output: 2000, cacheRead: 30000, cacheCreation: 5000 },
    toolCalls: { total: 8, byName: { Read: 8 } },
    callsBeforeTarget: 3,
    hookInjections: 0,
    hookChars: 0,
    pass: true,
    grade: { pass: true, detail: [] } satisfies GradeResult,
    ...over,
  };
}

/** The synthetic folder's runs: three tasks, arms A/B/C, one failing run, one budget stop. */
function syntheticRuns(): RunResult[] {
  const runs: RunResult[] = [];
  // d1: three arms. B rep 2 fails; the B median uses reps 1 and 3 only.
  for (const [rep, cost] of [
    [1, 0.4],
    [2, 0.42],
    [3, 0.44],
  ] as const) runs.push(runOf('d1-add-carrier', 'discovery', 'A', rep, { costUsd: cost, numTurns: 20 + rep * 2 }));
  runs.push(runOf('d1-add-carrier', 'discovery', 'B', 1, { costUsd: 0.3, numTurns: 12 }));
  runs.push(runOf('d1-add-carrier', 'discovery', 'B', 2, { costUsd: 9.9, pass: false, grade: { pass: false, detail: ['test: exit 1'] } }));
  runs.push(runOf('d1-add-carrier', 'discovery', 'B', 3, { costUsd: 0.34, numTurns: 14, hookInjections: 2, hookChars: 800 }));
  for (const rep of [1, 2, 3]) runs.push(runOf('d1-add-carrier', 'discovery', 'C', rep, { costUsd: 0.5 }));
  // d2: no C runs (the arm was expected and never ran). Deltas: A 0.51, B 0.46.
  runs.push(runOf('d2-week-boundary', 'discovery', 'A', 1, { costUsd: 0.5 }));
  runs.push(runOf('d2-week-boundary', 'discovery', 'A', 2, { costUsd: 0.52 }));
  runs.push(runOf('d2-week-boundary', 'discovery', 'B', 1, { costUsd: 0.45 }));
  runs.push(runOf('d2-week-boundary', 'discovery', 'B', 2, { costUsd: 0.47 }));
  // c1: control, overhead only.
  runs.push(runOf('c1-format-eta', 'control', 'A', 1, { costUsd: 0.2 }));
  runs.push(runOf('c1-format-eta', 'control', 'A', 2, { costUsd: 0.2 }));
  runs.push(runOf('c1-format-eta', 'control', 'B', 1, { costUsd: 0.25 }));
  runs.push(runOf('c1-format-eta', 'control', 'B', 2, { costUsd: 0.25 }));
  // t1: trap. A passes. B fails every run; one is stopped by the per-run budget.
  for (const rep of [1, 2, 3]) runs.push(runOf('t1-stale-timeout', 'trap', 'A', rep, { costUsd: 0.3 }));
  runs.push(runOf('t1-stale-timeout', 'trap', 'B', 1, { costUsd: 0.1, pass: false, grade: { pass: false, detail: ['file: docs/runbook.md contains forbidden /10/'] } }));
  runs.push(runOf('t1-stale-timeout', 'trap', 'B', 2, { costUsd: 0.5, pass: false, budgetExceeded: true, subtype: 'error_max_budget_usd', grade: { pass: false, detail: ['file: docs/runbook.md does not exist'] } }));
  runs.push(runOf('t1-stale-timeout', 'trap', 'B', 3, { costUsd: 0.2, pass: false, grade: { pass: false, detail: ['file: docs/runbook.md contains forbidden /10/'] } }));
  return runs;
}

function metaFor(runs: RunResult[], over: Partial<RunMeta> = {}): RunMeta {
  return {
    schema: 1,
    startedAt: '2026-10-10T09:00:00.000Z',
    model: 'claude-sonnet-5-5',
    claudeVersion: '2.1.0',
    gitSha: 'abc1234-dirty',
    args: { arms: ['A', 'B', 'C'], tasks: ['d1-add-carrier', 'd2-week-boundary', 'c1-format-eta', 't1-stale-timeout'] },
    plannedRuns: runs.length,
    completedRuns: runs.length,
    spentUsd: runs.reduce((s, r) => s + r.costUsd, 0),
    stoppedEarly: false,
    ...over,
  };
}

/** Writes a results folder the way the runner does: meta.json and runs/<id>.json. */
function writeResults(runs: RunResult[], meta: RunMeta): string {
  const d = dir('results');
  fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.mkdirSync(path.join(d, 'runs'));
  for (const r of runs) fs.writeFileSync(path.join(d, 'runs', `${r.id}.json`), JSON.stringify(r, null, 2));
  return d;
}

function cli(args: string[]) {
  const r = spawnSync(NODE, [REPORT, ...args], { encoding: 'utf8', cwd: scratch });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe('buildReport: model', () => {
  const runs = syntheticRuns();
  const report = buildReport(runs, metaFor(runs));
  const task = (id: string) => report.tasks.find((t) => t.task === id)!;
  const arm = (id: string, a: 'A' | 'B' | 'C') => task(id).arms.find((x) => x.arm === a)!;

  it('medians use passing runs only, with the pass rate alongside', () => {
    const b = arm('d1-add-carrier', 'B');
    assert.equal(b.runs, 3);
    assert.equal(b.passing, 2);
    assert.ok(Math.abs(b.passRate! - 2 / 3) < 1e-12);
    assert.equal(b.metrics.costUsd.median, 0.32, 'median of 0.30 and 0.34, not the failing 9.9');
    assert.deepEqual([b.metrics.costUsd.min, b.metrics.costUsd.max], [0.3, 0.34]);
    assert.equal(b.metrics.hookChars.median, 400, 'median of the passing runs 0 and 800');
  });

  it('per-task deltas are B and C against A', () => {
    const d = task('d1-add-carrier').deltas;
    assert.ok(d.B);
    assert.ok(Math.abs(d.B.costUsd.abs! - (0.32 - 0.42)) < 1e-12);
    assert.ok(Math.abs(d.B.costUsd.pct! - ((0.32 - 0.42) / 0.42) * 100) < 1e-9);
    assert.ok(d.C);
    assert.ok(Math.abs(d.C.costUsd.abs! - 0.08) < 1e-12);
  });

  it('kind deltas are the median of the per-task deltas, one kind at a time', () => {
    const discovery = report.kinds.find((k) => k.kind === 'discovery')!;
    // d1 contributes -0.10 and d2 contributes -0.05 (0.46 - 0.51), so the median is -0.075.
    assert.ok(discovery.deltas.B);
    assert.ok(Math.abs(discovery.deltas.B.costUsd.abs! + 0.075) < 1e-9);
    assert.equal(discovery.deltas.B.costUsd.n, 2);
    const control = report.kinds.find((k) => k.kind === 'control')!;
    assert.equal(control.label, 'overhead');
    assert.ok(Math.abs(control.deltas.B!.costUsd.abs! - 0.05) < 1e-12);
    const trap = report.kinds.find((k) => k.kind === 'trap')!;
    assert.equal(trap.deltas.B, null, 'no B deltas when no B run passed');
    assert.equal(trap.deltas.C, null, 'the trap kind has no C arm');
  });

  it('an arm with no passing runs has no medians and no deltas', () => {
    const b = arm('t1-stale-timeout', 'B');
    assert.equal(b.passing, 0);
    assert.equal(b.metrics.costUsd.median, null);
    assert.equal(task('t1-stale-timeout').deltas.B, null);
    assert.equal(b.budgetStopped, 1);
  });

  it('an expected arm with no runs is reported as missing', () => {
    assert.equal(arm('d2-week-boundary', 'C').runs, 0);
    assert.ok(report.issues.includes('Task d2-week-boundary has no runs in arm C.'));
  });

  it('a budget-stopped run is noted at the top but does not make a complete set incomplete', () => {
    assert.ok(report.notes.some((i) => i.includes('t1-stale-timeout: 1 run stopped by the per-run budget')));
    assert.ok(!report.issues.some((i) => i.includes('per-run budget')));
    const full = [
      runOf('c1-format-eta', 'control', 'A', 1),
      runOf('c1-format-eta', 'control', 'B', 1, { pass: false, budgetExceeded: true, subtype: 'error_max_budget_usd' }),
    ];
    const r = buildReport(full, metaFor(full, { args: { arms: ['A', 'B'], tasks: ['c1-format-eta'] } }));
    assert.equal(r.complete, true, 'every planned run has a result; the budget stop is a recorded failure');
    assert.equal(r.notes.length, 1);
    const md = renderMarkdown(r);
    assert.doesNotMatch(md, /INCOMPLETE|STOPPED EARLY/);
    assert.match(md, /stopped by the per-run budget/);
  });

  it('pools pass counts per kind', () => {
    const trap = report.kinds.find((k) => k.kind === 'trap')!;
    assert.deepEqual(trap.pooled.A, { passing: 3, total: 3 });
    assert.deepEqual(trap.pooled.B, { passing: 0, total: 3 });
  });

  it('a complete synthetic set has no issues', () => {
    const full = [
      runOf('c1-format-eta', 'control', 'A', 1),
      runOf('c1-format-eta', 'control', 'B', 1),
    ];
    const r = buildReport(full, metaFor(full, { args: { arms: ['A', 'B'], tasks: ['c1-format-eta'] } }));
    assert.deepEqual(r.issues, []);
    assert.equal(r.complete, true);
  });

  it('a stopped run folder says so at the top of the issues', () => {
    const partial = [runOf('c1-format-eta', 'control', 'A', 1)];
    const r = buildReport(partial, metaFor(partial, { plannedRuns: 4, stoppedEarly: true, stopReason: 'budget: 0.50 would pass 10' }));
    assert.match(r.issues[0]!, /Stopped early: budget: 0\.50 would pass 10/);
    assert.ok(r.issues.some((i) => i.startsWith('1 of 4 planned runs')));
  });
});

describe('renderMarkdown', () => {
  const runs = syntheticRuns();
  const md = renderMarkdown(buildReport(runs, metaFor(runs)));

  it('leads with the banner when results are incomplete', () => {
    assert.match(md, /RESULTS INCOMPLETE/);
    assert.match(md, /stopped by the per-run budget/);
  });

  it('puts pass rate first on the trap row and labels control rows as overhead', () => {
    assert.match(md, /\*\*Pass rate first: A 3\/3 \(100%\), B 0\/3 \(0%\)\.\*\*/);
    assert.match(md, /## Control \(overhead/);
    assert.match(md, /These rows are overhead/);
  });

  it('shows the pass cell and medians in each arm row', () => {
    assert.match(md, /\| A \| 3\/3 \(100%\) \|/);
    assert.match(md, /\| B \| 2\/3 \(67%\) \|/);
    assert.match(md, /\| C \| 3\/3 \(100%\) \|/);
  });

  it('shows what each arm spent over all its runs, and how many tasks feed a kind delta', () => {
    assert.match(md, /Spent over all runs, failures included: A \$\d+\.\d{3}, B \$\d+\.\d{3}/);
    assert.match(md, /Deltas: B − A from \d+ of \d+ tasks?/);
    // The trap task's B runs all failed, but their spend is still shown.
    const trap = buildReport(runs, metaFor(runs)).tasks.find((t) => t.kind === 'trap')!;
    const b = trap.arms.find((a) => a.arm === 'B')!;
    assert.equal(b.passing, 0);
    assert.ok(b.spentUsd > 0);
  });

  it('names missing arms and arms with no passing runs', () => {
    assert.match(md, /No runs in C\./);
    assert.match(md, /No passing runs in B: medians are unavailable for that arm\./);
  });

  it('has a footer with model, version, SHA, date, spend, runs and the caveats', () => {
    assert.match(md, /- Model: claude-sonnet-5-5/);
    assert.match(md, /- Claude Code version: 2\.1\.0/);
    assert.match(md, /- Git SHA: abc1234-dirty/);
    assert.match(md, /- Date: 2026-10-10T09:00:00\.000Z/);
    assert.match(md, /- Total spend: \$/);
    assert.match(md, /- Runs: \d+ completed of \d+ planned/);
    assert.match(md, /Small n/);
    assert.match(md, /Medians are not significance tests/);
  });

  it('a complete set has no banner', () => {
    const full = [runOf('c1-format-eta', 'control', 'A', 1), runOf('c1-format-eta', 'control', 'B', 1)];
    const out = renderMarkdown(buildReport(full, metaFor(full, { args: { arms: ['A', 'B'], tasks: ['c1-format-eta'] } })));
    assert.doesNotMatch(out, /INCOMPLETE|STOPPED EARLY/);
  });
});

describe('report CLI', () => {
  it('writes Markdown to stdout and exits 1 for incomplete results', () => {
    const runs = syntheticRuns();
    const d = writeResults(runs, metaFor(runs));
    const r = cli([d]);
    assert.equal(r.code, 1);
    assert.match(r.out, /^# Benchmark report/);
    assert.match(r.out, /RESULTS INCOMPLETE/);
  });

  it('--json writes the same numbers machine-readable', () => {
    const runs = syntheticRuns();
    const d = writeResults(runs, metaFor(runs));
    const r = cli([d, '--json']);
    assert.equal(r.code, 1);
    const json = JSON.parse(r.out);
    assert.equal(json.schema, 1);
    assert.equal(json.complete, false);
    const t1 = json.tasks.find((t: { task: string }) => t.task === 't1-stale-timeout');
    assert.equal(t1.arms.find((a: { arm: string }) => a.arm === 'B').passing, 0);
  });

  it('--out writes the file and exits 0 for a complete set', () => {
    const full = [runOf('c1-format-eta', 'control', 'A', 1), runOf('c1-format-eta', 'control', 'B', 1)];
    const d = writeResults(full, metaFor(full, { args: { arms: ['A', 'B'], tasks: ['c1-format-eta'] } }));
    const out = path.join(scratch, 'report-complete.md');
    const r = cli([d, '--out', out]);
    assert.equal(r.code, 0, r.err);
    assert.match(fs.readFileSync(out, 'utf8'), /^# Benchmark report/);
  });

  it('exits 1 and names the file for a malformed run', () => {
    const full = [runOf('c1-format-eta', 'control', 'A', 1)];
    const d = writeResults(full, metaFor(full));
    write(d, 'runs/broken.json', '{ not json');
    const r = cli([d]);
    assert.equal(r.code, 1);
    assert.match(r.err, /broken\.json: not valid JSON/);
  });

  it('exits 1 when a run file lacks the fields the report reads', () => {
    const full = [runOf('c1-format-eta', 'control', 'A', 1)];
    const d = writeResults(full, metaFor(full));
    write(d, 'runs/bad.json', JSON.stringify({ schema: 1, task: 'x', arm: 'Z' }));
    const r = cli([d]);
    assert.equal(r.code, 1);
    assert.match(r.err, /bad\.json: arm Z is not A, B or C/);
  });

  it('exits 2 without a meta.json, and on bad arguments', () => {
    const empty = dir('empty');
    assert.equal(cli([empty]).code, 2);
    assert.equal(cli([]).code, 2);
    assert.equal(cli([empty, '--bogus']).code, 2);
  });

  it('a results folder with no runs yet is a report under a banner, not a crash', () => {
    const d = writeResults([], metaFor([], { plannedRuns: 6, completedRuns: 0, stoppedEarly: true, stopReason: 'budget' }));
    const r = cli([d]);
    assert.equal(r.code, 1);
    assert.match(r.out, /STOPPED EARLY/);
  });
});

describe('mixed upkeep splits', () => {
  const part = (cost: number) => ({ turns: 1, toolCalls: 1, outputTokens: 10, estCostUsd: cost });
  const splitOf = (method: string): NonNullable<RunResult['split']> => ({ task: part(0.3), use: part(0), upkeep: part(0.1), method });
  const base = (): RunResult[] => [
    runOf('d1-add-carrier', 'discovery', 'A', 1, { split: splitOf('upkeep-split-v2 (x)') }),
    runOf('d1-add-carrier', 'discovery', 'B', 1, { split: splitOf('upkeep-split-v2 (x)') }),
  ];
  const warns = (runs: RunResult[]): string[] => buildReport(runs, metaFor(runs)).notes.filter((n) => /^Mixed upkeep splits/.test(n));

  it('says nothing when every run has the same method, or none has a split', () => {
    assert.deepEqual(warns(base()), []);
    assert.deepEqual(warns(base().map((r) => ({ ...r, split: undefined }))), []);
  });

  it('warns, at the top of the report, when the run files carry different split methods', () => {
    const runs = base();
    runs[1] = { ...runs[1]!, split: splitOf('upkeep-split-v1 (old)') };
    const w = warns(runs);
    assert.equal(w.length, 1);
    assert.match(w[0]!, /different split methods \(upkeep-split-v2, upkeep-split-v1\)/);
    const md = renderMarkdown(buildReport(runs, metaFor(runs)));
    assert.match(md.slice(0, md.indexOf('## ')), /Mixed upkeep splits/);
  });

  it('warns when some run files lack a split while others have one', () => {
    const runs = base();
    runs[1] = { ...runs[1]!, split: undefined };
    const w = warns(runs);
    assert.equal(w.length, 1);
    assert.match(w[0]!, /1 of 2 have no split/);
    assert.doesNotMatch(w[0]!, /different split methods/);
  });
});
