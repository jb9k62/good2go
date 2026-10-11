/**
 * The benchmark runner (test/bench/run.mts and lib/). Only the fake `claude` in
 * test/bench/stub/ is ever run: no model call, no network. Fixtures are tiny and made here.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { setupWorkdir } from './bench/lib/arms.mts';
import { reanalyse, buildReport, loadResults } from './bench/report.mts';
import { renderMarkdown } from './bench/lib/render.mts';
import { Budget, reserveUsd, shuffle, worstCaseUsd } from './bench/lib/budget.mts';
import { bashParts, buildArgs, childEnv, classifyCall, SPLIT_METHOD, isolationLeaks, missingProjectSkills, parseStream, splitEvents, splitTranscript, touchesTarget, userLevelNames } from './bench/lib/claude.mts';
import type { GradeFn } from './bench/run.mts';
import { buildPlan, loadTasks, main, parseArgs, UsageError } from './bench/run.mts';
import type { RunMeta, RunResult, Task } from './bench/lib/types.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = path.join(ROOT, 'test', 'bench', 'stub', 'claude-stub.mjs');
const REAL_STREAM = path.join(ROOT, 'test', 'bench', 'stub', 'real-hooks-read.jsonl');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-run-test-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

// ---- a throwaway world: fixture, tasks and a repository root with a `dist/good2go.mjs` ----------

const task = (id: string, kind: Task['kind'], arms: Task['arms'], target: string): Task => ({
  id,
  kind,
  title: id,
  prompt: `Do ${id}.`,
  ...(arms ? { arms } : {}),
  targetFiles: [target],
  grader: { kind: 'answer', all: ['done'] },
  lessons: [],
});

const world = (() => {
  const root = path.join(scratch, 'world');
  const fixture = path.join(root, 'fixture');
  fs.mkdirSync(path.join(fixture, 'base', 'src'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'base', 'AGENTS.md'), '# Neutral\n');
  fs.writeFileSync(path.join(fixture, 'base', 'CLAUDE.md'), '@AGENTS.md\n');
  fs.writeFileSync(path.join(fixture, 'base', 'src', 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(fixture, 'base', 'src', 'b.ts'), 'export const b = 2;\n');
  fs.mkdirSync(path.join(fixture, 'memory'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'memory', 'AGENTS.md'), '# Neutral\n\nThis project keeps agent memory in ./edukai/.\n');
  fs.cpSync(path.join(ROOT, 'examples', 'demo', 'edukai'), path.join(fixture, 'memory', 'edukai'), { recursive: true });

  const tasksDir = path.join(root, 'tasks');
  for (const t of [task('t-disc', 'discovery', ['A', 'B', 'C'], 'src/a.ts'), task('t-ctrl', 'control', undefined, 'src/b.ts')]) {
    fs.mkdirSync(path.join(tasksDir, t.id), { recursive: true });
    fs.writeFileSync(path.join(tasksDir, t.id, 'task.json'), JSON.stringify(t));
  }

  // A stand-in for the built package that runs the real tools from src/ (the unit tests must not
  // need `npm run build`, which comes after them in `npm run check`).
  const repo = path.join(root, 'repo');
  fs.mkdirSync(path.join(repo, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'package.json'), '{ "name": "@jb9k62/good2go", "version": "0.0.0-test" }\n');
  fs.writeFileSync(
    path.join(repo, 'dist', 'good2go.mjs'),
    `import { spawnSync } from 'node:child_process';\n` +
      `const r = spawnSync(process.execPath, [${JSON.stringify(path.join(ROOT, 'src', 'good2go.mts'))}, ...process.argv.slice(2)], { stdio: 'inherit' });\n` +
      `process.exit(r.status ?? 2);\n`,
  );
  return { root, fixture, tasksDir, repo };
})();

const fakeGrade: GradeFn = async (_task, workdir, text) => ({ pass: text.includes('done'), detail: [`fake: ${path.basename(workdir)} said ${JSON.stringify(text)}`] });

let counter = 0;
const outDir = (): string => path.join(scratch, `out${counter++}`);

const STUB_ENV = ['BENCH_STUB_SCENARIO', 'BENCH_STUB_COST', 'BENCH_STUB_READ', 'BENCH_STUB_WRITE', 'BENCH_STUB_ANSWER', 'BENCH_STUB_LOG'];
afterEach(() => {
  for (const k of STUB_ENV) delete process.env[k];
});

interface Called {
  code: number;
  out: string[];
  err: string[];
}

async function bench(args: string[], grade: GradeFn = fakeGrade): Promise<Called> {
  const out: string[] = [];
  const err: string[] = [];
  const common = ['--fixture', world.fixture, '--tasks-dir', world.tasksDir, '--repo', world.repo, '--claude', STUB];
  const code = await main([...common, ...args], { grade, log: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out, err };
}

const readRuns = (out: string): RunResult[] =>
  fs.existsSync(path.join(out, 'runs'))
    ? fs.readdirSync(path.join(out, 'runs')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(out, 'runs', f), 'utf8')) as RunResult)
    : [];
const readMeta = (out: string): RunMeta => JSON.parse(fs.readFileSync(path.join(out, 'meta.json'), 'utf8')) as RunMeta;
const calls = (log: string): number => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).length : 0);

// ---- arguments ------------------------------------------------------------------------------------

describe('arguments', () => {
  it('has the documented defaults', () => {
    const o = parseArgs([]);
    assert.equal(o.go, false);
    assert.equal(o.reps, 3);
    assert.deepEqual(o.arms, ['A', 'B', 'C']);
    assert.equal(o.model, 'claude-sonnet-5-5');
    assert.equal(o.concurrency, 2);
    assert.equal(o.budgetUsd, 10);
    assert.equal(o.perRunUsd, 0.5);
    assert.equal(o.claude, 'claude');
    assert.equal(o.seed, null);
  });

  it('reads every flag', () => {
    const o = parseArgs(['--go', '--reps', '5', '--arms', 'b,a', '--tasks', 'x,y', '--model', 'm', '--concurrency', '4', '--budget-usd', '3', '--per-run-usd', '0.25', '--seed', '7', '--out', 'res/x', '--claude', '/bin/c', '--dry-run']);
    assert.deepEqual([o.go, o.dryRun, o.reps, o.arms, o.tasks, o.model, o.concurrency, o.budgetUsd, o.perRunUsd, o.seed, o.claude], [true, true, 5, ['B', 'A'], ['x', 'y'], 'm', 4, 3, 0.25, 7, '/bin/c']);
    assert.equal(o.out, path.resolve('res/x'));
  });

  it('--pilot is one rep of arms A and B', () => {
    const o = parseArgs(['--pilot', '--reps', '9', '--arms', 'A,B,C']);
    assert.equal(o.reps, 1);
    assert.deepEqual(o.arms, ['A', 'B']);
  });

  it('refuses bad input as a usage error', () => {
    for (const bad of [['--nope'], ['--arms', 'D'], ['--reps', 'x'], ['--reps', '0'], ['--reps'], ['--budget-usd', '-1'], ['--per-run-usd', 'abc'], ['--budget-usd', '1', '--per-run-usd', '2'], ['--pilot', '--arms', 'C']]) {
      assert.throws(() => parseArgs(bad), UsageError, bad.join(' '));
    }
  });

  it('exits 2 and says it spends money without --go', async () => {
    const out = outDir();
    const r = await bench(['--out', out]);
    assert.equal(r.code, 2);
    assert.match(r.err.join('\n'), /spends real money/);
    assert.match(r.err.join('\n'), /--go/);
    assert.equal(fs.existsSync(out), false);
  });

  it('exits 2 for an unknown option or task id, before spending anything', async () => {
    assert.equal((await bench(['--go', '--bogus'])).code, 2);
    const r = await bench(['--go', '--tasks', 'nope', '--out', outDir()]);
    assert.equal(r.code, 2);
    assert.match(r.err.join('\n'), /unknown task id/);
  });

  it('exits 2 when claude cannot be run', async () => {
    const out = outDir();
    const r = await bench(['--go', '--claude', path.join(scratch, 'no-such-claude'), '--out', out]);
    assert.equal(r.code, 2);
    assert.match(r.err.join('\n'), /Claude Code installed/);
    assert.equal(fs.existsSync(path.join(out, 'runs')), false);
  });
});

// ---- the plan -------------------------------------------------------------------------------------

describe('plan', () => {
  it('--dry-run prints the runs and the worst-case cost and writes nothing', async () => {
    const out = outDir();
    const r = await bench(['--dry-run', '--reps', '2', '--out', out, '--seed', '1']);
    assert.equal(r.code, 0);
    const text = r.out.join('\n');
    // t-disc runs A, B, C and t-ctrl runs A, B: five (task, arm) pairs, two reps.
    assert.match(text, /10 runs \(A: 4, B: 4, C: 2\)/);
    assert.match(text, /per run: up to \$0\.50 \(reserved as \$0\.75[^;]*; worst case for the plan: \$7\.50; total budget: \$10\.00/);
    assert.match(text, /seed 1/);
    assert.equal(fs.existsSync(out), false);
  });

  it('--dry-run says when the worst case is over the budget', async () => {
    const r = await bench(['--dry-run', '--budget-usd', '2', '--out', outDir()]);
    assert.match(r.out.join('\n'), /over the budget/);
  });

  it('--pilot plans one rep of every task in A and B', () => {
    const tasks = loadTasks(world.tasksDir, null);
    const o = parseArgs(['--pilot']);
    const plan = buildPlan(tasks, o.arms, o.reps, 1);
    assert.deepEqual(plan.map((p) => p.id).sort(), ['t-ctrl.A.1', 't-ctrl.B.1', 't-disc.A.1', 't-disc.B.1']);
  });

  it('shuffles with the seed: the same seed gives the same order, another does not', () => {
    const tasks = loadTasks(world.tasksDir, null);
    const ids = (seed: number): string[] => buildPlan(tasks, ['A', 'B', 'C'], 5, seed).map((p) => p.id);
    assert.deepEqual(ids(42), ids(42));
    assert.notDeepEqual(ids(42), ids(43));
    assert.deepEqual([...ids(42)].sort(), [...ids(43)].sort());
    // interleaved: the arms are not run in blocks
    const arms = buildPlan(tasks, ['A', 'B', 'C'], 5, 42).map((p) => p.arm).join('');
    assert.doesNotMatch(arms, /^A{10}/);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.deepEqual(shuffle(input, 9), shuffle(input, 9));
    assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('computes the worst case', () => {
    // each run is reserved at its allowance times 1.5: a run can finish one turn past --max-budget-usd
    assert.equal(reserveUsd(0.5), 0.75);
    assert.equal(worstCaseUsd(12, 0.5), 9);
    assert.equal(worstCaseUsd(3, 0.1), 0.45);
  });

  it('the invocation carries the isolation flags and the spec\'s argument list', () => {
    const a = buildArgs('hello', 'claude-x', 0.5);
    assert.deepEqual(a.slice(0, 2), ['-p', 'hello']);
    for (const f of ['--verbose', '--no-session-persistence', '--strict-mcp-config', '--include-hook-events']) assert.ok(a.includes(f), f);
    assert.equal(a[a.indexOf('--setting-sources') + 1], 'project');
    assert.equal(a[a.indexOf('--max-budget-usd') + 1], '0.5');
    assert.equal(a[a.indexOf('--permission-mode') + 1], 'acceptEdits');
    assert.ok(a.includes('Bash(wc:*)'));
    assert.deepEqual(a.slice(a.indexOf('--disallowedTools') + 1), ['WebFetch', 'WebSearch', 'Agent', 'Task']);
  });
});

// ---- arm setup ------------------------------------------------------------------------------------

describe('arm setup', () => {
  const make = (arm: 'A' | 'B' | 'C'): string => setupWorkdir({ arm, fixtureDir: world.fixture, repoRoot: world.repo, workdir: path.join(scratch, `arm-${arm}-${counter++}`) });
  const git = (cwd: string, ...args: string[]): string => spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout.trim();

  it('A: the base fixture in a clean git repository, no memory, no hooks', () => {
    const w = make('A');
    assert.ok(fs.existsSync(path.join(w, 'src', 'a.ts')));
    assert.equal(fs.existsSync(path.join(w, 'edukai')), false);
    assert.equal(fs.existsSync(path.join(w, '.claude')), false);
    assert.equal(fs.existsSync(path.join(w, 'node_modules')), false);
    assert.equal(fs.readFileSync(path.join(w, 'AGENTS.md'), 'utf8'), '# Neutral\n');
    assert.equal(git(w, 'rev-list', '--count', 'HEAD'), '1');
    assert.equal(git(w, 'status', '--porcelain'), '');
  });

  it('B: memory overlay, hooks from the real installer, the package linked, the cache built', () => {
    const w = make('B');
    assert.ok(fs.existsSync(path.join(w, 'edukai', 'index.md')));
    assert.match(fs.readFileSync(path.join(w, 'AGENTS.md'), 'utf8'), /agent memory/);
    const settings = JSON.parse(fs.readFileSync(path.join(w, '.claude', 'settings.json'), 'utf8')) as { hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>> };
    assert.deepEqual(Object.keys(settings.hooks).sort(), ['PostToolUse', 'SessionStart', 'Stop']);
    assert.deepEqual(settings.hooks.PostToolUse!.map((g) => g.matcher), ['Read', 'Edit|Write|NotebookEdit']);
    assert.match(settings.hooks.SessionStart![0]!.hooks[0]!.command, /node_modules\/@jb9k62\/good2go\/dist\/good2go\.mjs/);
    // A copy of what the package ships, not a link to the repository (which holds the hidden tests).
    const pkg = path.join(w, 'node_modules', '@jb9k62', 'good2go');
    assert.equal(fs.lstatSync(pkg).isSymbolicLink(), false);
    assert.deepEqual(fs.readdirSync(pkg).sort(), ['dist', 'package.json']);
    assert.ok(fs.existsSync(path.join(w, 'node_modules', '.bin', 'good2go')));
    assert.ok(!fs.realpathSync(path.join(pkg, 'dist', 'good2go.mjs')).startsWith(fs.realpathSync(world.repo)));
    assert.ok(fs.readdirSync(path.join(w, 'node_modules', '.cache', 'edukai')).length > 0, 'the hooks need the cache `recheck` writes');
    assert.equal(git(w, 'status', '--porcelain'), '');
    assert.equal(git(w, 'ls-files', 'node_modules'), '');
  });

  it('C: memory and the package, but no hooks', () => {
    const w = make('C');
    assert.ok(fs.existsSync(path.join(w, 'edukai', 'index.md')));
    assert.equal(fs.existsSync(path.join(w, '.claude', 'settings.json')), false, 'no hooks');
    const pkg = path.join(w, 'node_modules', '@jb9k62', 'good2go');
    assert.deepEqual(fs.readdirSync(pkg).sort(), ['dist', 'package.json']);
    assert.ok(fs.existsSync(path.join(w, 'node_modules', '.bin', 'good2go')));
    assert.equal(fs.existsSync(path.join(w, 'node_modules', '.cache')), false, 'no recheck cache: the hooks are not installed');
    assert.equal(git(w, 'status', '--porcelain'), '');
  });

  it('A has no .claude/skills; B and C have only the edukai skill there, and the tree stays clean', () => {
    const a = make('A');
    assert.equal(fs.existsSync(path.join(a, '.claude', 'skills')), false);
    for (const arm of ['B', 'C'] as const) {
      const w = make(arm);
      assert.ok(fs.existsSync(path.join(w, '.claude', 'skills', 'edukai', 'SKILL.md')), `${arm} has the edukai skill`);
      assert.deepEqual(fs.readdirSync(path.join(w, '.claude', 'skills')), ['edukai'], `${arm}: only edukai, not the package's other skills`);
      assert.equal(git(w, 'status', '--porcelain'), '', `${arm}: clean`);
      assert.equal(git(w, 'ls-files', '.claude/skills'), '', `${arm}: the skill is not committed`);
    }
    // B's hooks settings are still committed
    assert.match(git(make('B'), 'ls-files', '.claude'), /settings\.json/);
  });

  it('the real fixture: C and B can run the overlay scripts, only B has hooks, A has neither', { skip: !fs.existsSync(path.join(ROOT, 'dist', 'good2go.mjs')) && 'dist/ is not built' }, () => {
    const fixtureDir = path.join(ROOT, 'test', 'bench', 'fixture');
    const real = (arm: 'A' | 'B' | 'C'): string => setupWorkdir({ arm, fixtureDir, repoRoot: ROOT, workdir: path.join(scratch, `real-${arm}-${counter++}`) });
    const env: Record<string, string | undefined> = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const scripts = (w: string): Record<string, string> => (JSON.parse(fs.readFileSync(path.join(w, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;

    const a = real('A');
    assert.equal(scripts(a)['edukai:brief'], undefined);
    assert.equal(fs.existsSync(path.join(a, 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(a, '.claude')), false);

    for (const arm of ['B', 'C'] as const) {
      const w = real(arm);
      assert.ok(scripts(w)['edukai:brief'], `${arm} has the overlay scripts`);
      const r = spawnSync('npm', ['run', '--silent', 'edukai:brief'], { cwd: w, env, encoding: 'utf8' });
      assert.equal(r.status, 0, `${arm}: ${r.stderr}`);
      assert.match(r.stdout, /edukai/);
      assert.equal(fs.existsSync(path.join(w, '.claude', 'settings.json')), arm === 'B', `${arm}: hooks are installed only for B`);
      assert.equal(git(w, 'status', '--porcelain'), '', `${arm}: running the script leaves the tree clean`);
    }
  });

  it('a task\'s memory-extra overlays B and C (after the shared memory), never A, and only that task', () => {
    const taskDir = path.join(scratch, `task-extra-${counter++}`);
    fs.mkdirSync(path.join(taskDir, 'memory-extra', 'edukai', 'x'), { recursive: true });
    fs.writeFileSync(path.join(taskDir, 'memory-extra', 'edukai', 'x', 'extra.md'), 'extra\n');
    fs.writeFileSync(path.join(taskDir, 'memory-extra', 'edukai', 'log.md'), '# replaced by the task\n');
    const setup = (arm: 'A' | 'B' | 'C', dir?: string): string => setupWorkdir({ arm, fixtureDir: world.fixture, repoRoot: world.repo, workdir: path.join(scratch, `extra-${arm}-${counter++}`), ...(dir ? { taskDir: dir } : {}) });
    for (const arm of ['B', 'C'] as const) {
      const w = setup(arm, taskDir);
      assert.equal(fs.readFileSync(path.join(w, 'edukai', 'x', 'extra.md'), 'utf8'), 'extra\n', `${arm} has the task's memory`);
      assert.equal(fs.readFileSync(path.join(w, 'edukai', 'log.md'), 'utf8'), '# replaced by the task\n', `${arm}: the task's file replaces the shared one`);
      assert.ok(fs.existsSync(path.join(w, 'edukai', 'index.md')), `${arm} keeps the shared overlay`);
      assert.equal(git(w, 'status', '--porcelain'), '');
      assert.equal(fs.existsSync(setup(arm, path.join(scratch, 'no-such-task')) + '/edukai/x/extra.md'), false, 'a task without memory-extra adds nothing');
      assert.equal(fs.existsSync(path.join(setup(arm), 'edukai', 'x', 'extra.md')), false, 'no task, no extra');
    }
    const a = setup('A', taskDir);
    assert.equal(fs.existsSync(path.join(a, 'edukai')), false, 'arm A never has memory');
  });

  it('the real fixture: the brief counts 7 lessons for d1 and 8 with one needing an agent for t1; the runner passes each task\'s folder', { skip: !fs.existsSync(path.join(ROOT, 'dist', 'good2go.mjs')) && 'dist/ is not built' }, () => {
    const fixtureDir = path.join(ROOT, 'test', 'bench', 'fixture');
    const env: Record<string, string | undefined> = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    for (const [id, lessons, needs] of [['d1-add-carrier', 7, false], ['d3-run-the-suite', 7, false], ['t1-stale-timeout', 8, true]] as const) {
      for (const arm of ['B', 'C'] as const) {
        const w = setupWorkdir({ arm, fixtureDir, repoRoot: ROOT, workdir: path.join(scratch, `brief-${id}-${arm}-${counter++}`), taskDir: path.join(ROOT, 'test', 'bench', 'tasks', id) });
        const r = spawnSync('npm', ['run', '--silent', 'edukai:brief'], { cwd: w, env, encoding: 'utf8' });
        assert.equal(r.status, 0, `${id} ${arm}: ${r.stderr}`);
        assert.match(r.stdout, new RegExp(`\\(${lessons} lessons, 2 domains\\)`), `${id} ${arm}`);
        assert.equal(/Needs an agent/.test(r.stdout), needs, `${id} ${arm}: ${r.stdout}`);
        assert.equal(fs.existsSync(path.join(w, 'edukai', 'codebase-parcel-tracker', 'lessons', '2026-10-11-the-poller-times-out-after-ten-seconds.md')), id === 't1-stale-timeout', `${id} ${arm}: the trap lesson`);
      }
    }
  });

  it('exits 2 for arms B and C without dist/good2go.mjs, and A still works', async () => {
    const bare = path.join(scratch, `bare-${counter++}`);
    fs.mkdirSync(bare);
    assert.throws(() => setupWorkdir({ arm: 'B', fixtureDir: world.fixture, repoRoot: bare, workdir: path.join(scratch, `nodist-${counter++}`) }), /npm run build/);
    const o = outDir();
    const out: string[] = [];
    const err: string[] = [];
    const code = await main(['--go', '--fixture', world.fixture, '--tasks-dir', world.tasksDir, '--repo', bare, '--claude', STUB, '--arms', 'B', '--out', o], { grade: fakeGrade, log: (s) => out.push(s), err: (s) => err.push(s) });
    assert.equal(code, 2);
    assert.match(err.join('\n'), /dist\/good2go\.mjs is missing/);
    assert.equal(fs.existsSync(o), false);
    assert.doesNotThrow(() => setupWorkdir({ arm: 'A', fixtureDir: world.fixture, repoRoot: bare, workdir: path.join(scratch, `nodist-a-${counter++}`) }));
  });
});

// ---- reading a stream -----------------------------------------------------------------------------

describe('metrics from the stream', () => {
  it('reads a trimmed real transcript (Claude Code 2.1.296, arm B shape)', () => {
    const m = parseStream(fs.readFileSync(REAL_STREAM, 'utf8'), { targets: ['src/poller/retry.ts'], workdir: '/work' });
    assert.equal(m.hasResult, true);
    assert.equal(m.subtype, 'success');
    assert.equal(m.isError, false);
    assert.equal(m.budgetExceeded, false);
    assert.equal(m.resultText, 'done');
    assert.equal(m.numTurns, 2);
    assert.equal(m.costUsd, 0.00132043);
    assert.deepEqual(m.toolCalls, { total: 1, byName: { Read: 1 } });
    assert.equal(m.callsBeforeTarget, 0);
    // SessionStart brief and the PostToolUse cites line; the Stop hook said nothing.
    assert.equal(m.hookInjections, 2);
    assert.ok(m.hookChars > 200);
    assert.ok(m.usage.input >= 0 && m.usage.output > 0 && m.usage.cacheCreation > 0);
    assert.deepEqual(isolationLeaks(m.init, []), []);
  });

  it('takes usage and cost only from the result event', () => {
    const lines = [
      { type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Grep', input: { pattern: 'x', path: '/w' } }] } },
      { type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/w/src/a.ts' } }] } },
      { type: 'assistant', message: { id: 'm2', content: [{ type: 'text', text: 'hi' }] } },
      { type: 'result', subtype: 'success', is_error: false, num_turns: 3, total_cost_usd: 0.5, result: 'ok', usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 } },
    ];
    const m = parseStream(lines.map((l) => JSON.stringify(l)).join('\n'), { targets: ['src/a.ts'], workdir: '/w' });
    assert.deepEqual(m.usage, { input: 10, output: 20, cacheRead: 30, cacheCreation: 40 });
    assert.equal(m.costUsd, 0.5);
    assert.equal(m.numTurns, 3);
    assert.equal(m.toolCalls.total, 2);
    assert.equal(m.callsBeforeTarget, 1, 'one call (the Grep at the root) came before the Read of the target');
  });

  it('lists the tool calls Claude Code denied', () => {
    const text = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 2, total_cost_usd: 0.1, result: 'ok', usage: {}, permission_denials: [{ tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'PARCEL_FAKE_CARRIERS=1 npm run test:full' } }] });
    assert.deepEqual(parseStream(text).permissionDenials, ['Bash: PARCEL_FAKE_CARRIERS=1 npm run test:full']);
    assert.deepEqual(parseStream(JSON.stringify({ type: 'result', subtype: 'success', permission_denials: [] })).permissionDenials, []);
  });

  it('a budget-stopped run keeps its cost and is not a pass', () => {
    const text = JSON.stringify({ type: 'result', subtype: 'error_max_budget_usd', is_error: true, num_turns: 4, total_cost_usd: 0.5, usage: { input_tokens: 1, output_tokens: 1 }, result: '' });
    const m = parseStream(text);
    assert.equal(m.budgetExceeded, true);
    assert.equal(m.isError, true);
    assert.equal(m.costUsd, 0.5);
    assert.equal(m.numTurns, 4);
  });

  it('a stream with no result event is no_result, with turns counted from the messages', () => {
    const text = [
      JSON.stringify({ type: 'assistant', message: { id: 'a', content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'ls' } }] } }),
      JSON.stringify({ type: 'assistant', message: { id: 'b', content: [{ type: 'text', text: '...' }] } }),
      '{"type":"assistant","message":{"id":"c","content":[{"type":"tool_u',
    ].join('\n');
    const m = parseStream(text);
    assert.equal(m.hasResult, false);
    assert.equal(m.subtype, 'no_result');
    assert.equal(m.isError, true);
    assert.equal(m.costUsd, 0);
    assert.equal(m.numTurns, 2);
    assert.equal(m.toolCalls.total, 1);
    assert.equal(m.callsBeforeTarget, null);
    assert.deepEqual(parseStream('').toolCalls, { total: 0, byName: {} });
  });

  it('counts edukai: lines from hook events and from tool results, once', () => {
    const hook = { type: 'system', subtype: 'hook_response', hook_event: 'PostToolUse', stdout: JSON.stringify({ hookSpecificOutput: { additionalContext: 'edukai: 1 lesson cites a.ts\n- [tested] x' } }) };
    const result = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'file text\nedukai: 1 lesson cites a.ts\nmore' }] } };
    const other = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'u', content: [{ type: 'text', text: 'edukai: from the result only' }] }] } };
    const plain = { type: 'system', subtype: 'hook_response', hook_event: 'Stop', stdout: '' };
    const m = parseStream([hook, result, other, plain].map((e) => JSON.stringify(e)).join('\n'));
    assert.equal(m.hookInjections, 2, 'the hook once, the tool result that is not a copy of it once');
    assert.equal(m.hookChars, 'edukai: 1 lesson cites a.ts\n- [tested] x'.length + 'edukai: from the result only'.length);
  });

  it('finds the first call that touches a target', () => {
    const w = '/w';
    const t = ['src/carriers/list.ts'];
    assert.equal(touchesTarget('Read', { file_path: '/w/src/carriers/list.ts' }, t, w), true);
    assert.equal(touchesTarget('Read', { file_path: '/w/src/carriers/other.ts' }, t, w), false);
    assert.equal(touchesTarget('Edit', { file_path: 'src/carriers/list.ts' }, t, w), true);
    assert.equal(touchesTarget('Grep', { pattern: 'zephyr', path: '/w/src/carriers' }, t, w), true);
    assert.equal(touchesTarget('Grep', { pattern: 'list.ts', path: '/w' }, t, w), false, 'a content pattern and the project root do not count');
    assert.equal(touchesTarget('Grep', { pattern: 'x', glob: '**/list.ts' }, t, w), true);
    assert.equal(touchesTarget('Glob', { pattern: 'src/**/list.ts' }, t, w), true);
    assert.equal(touchesTarget('Glob', { pattern: 'src/**/*.ts' }, t, w), false);
    assert.equal(touchesTarget('Bash', { command: 'cat src/carriers/list.ts | head' }, t, w), true);
    assert.equal(touchesTarget('Bash', { command: 'npm test' }, t, w), false);
    assert.equal(touchesTarget('Read', { file_path: '/w/src/carriers/list.ts' }, [], w), false);
  });

  it('flags user skills and MCP servers in the init event', () => {
    assert.deepEqual(isolationLeaks({ mcp_servers: [], skills: ['simplify'], plugins: [{ source: 'x@builtin' }] }, []), []);
    assert.equal(isolationLeaks({ mcp_servers: [{ name: 's' }], skills: [] }).length, 1);
    assert.equal(isolationLeaks({ skills: ['edukai'] }).length, 1);
    assert.equal(isolationLeaks({ plugins: [{ source: 'p@market' }] }).length, 1);
    // any of the user's own skills, commands or agents, by name
    assert.deepEqual(isolationLeaks({ skills: ['simplify', 'ray-so'] }, ['ray-so']), ['user skill, command or agent ray-so']);
    assert.equal(isolationLeaks({ agents: ['Explore', 'mine'] }, ['mine']).length, 1);
    const home = path.join(scratch, `claude-home-${counter++}`);
    fs.mkdirSync(path.join(home, 'skills', 'my-skill'), { recursive: true });
    fs.mkdirSync(path.join(home, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(home, 'commands', 'my-cmd.md'), '');
    assert.deepEqual(userLevelNames(home).sort(), ['my-cmd', 'my-skill']);
  });

  it('leak check per arm: the project edukai skill is fine in B and C, a leak in A; user skills leak everywhere', () => {
    const init = { mcp_servers: [], skills: ['simplify', 'edukai'], slash_commands: ['edukai'], plugins: [] };
    assert.deepEqual(isolationLeaks(init, [], 'B'), []);
    assert.deepEqual(isolationLeaks(init, [], 'C'), []);
    assert.equal(isolationLeaks(init, [], 'A').length, 1, 'A has no skills at all');
    assert.equal(isolationLeaks(init, []).length, 1, 'no arm given: the strict rule');
    // good2go is never installed, in any arm
    for (const arm of ['A', 'B', 'C'] as const) assert.deepEqual(isolationLeaks({ skills: ['good2go'] }, [], arm), ['user skill, command or agent good2go']);
    // another user-level skill leaks in every arm, even beside the allowed edukai
    for (const arm of ['A', 'B', 'C'] as const) assert.deepEqual(isolationLeaks({ skills: ['edukai', 'ray-so'] }, ['ray-so', 'edukai'], arm).filter((l) => /ray-so/.test(l)), ['user skill, command or agent ray-so']);
    // a user who also has their own `edukai` skill does not turn B's own into a leak (names cannot tell them apart; the flags keep user skills out)
    assert.deepEqual(isolationLeaks(init, ['edukai'], 'B'), []);
    // with a path in the event, the path decides
    const work = '/tmp/w/work';
    const at = (p: string) => ({ skills: [{ name: 'edukai', path: p }] });
    assert.deepEqual(isolationLeaks(at(`${work}/.claude/skills/edukai`), [], 'B', work), []);
    assert.equal(isolationLeaks(at(`${os.homedir()}/.claude/skills/edukai`), [], 'B', work).length, 1);
    assert.equal(isolationLeaks(at('/elsewhere/skills/edukai'), [], 'C', work).length, 1);
    assert.equal(isolationLeaks(at(`${work}/.claude/skills/edukai`), [], 'A', work).length, 1);
  });

  it('an arm missing its project skill is caught (the pilot\'s B had none)', () => {
    assert.deepEqual(missingProjectSkills({ skills: ['simplify'] }, 'B'), ['edukai']);
    assert.deepEqual(missingProjectSkills({ skills: ['simplify', 'edukai'] }, 'C'), []);
    assert.deepEqual(missingProjectSkills({ skills: ['simplify'] }, 'A'), []);
    assert.deepEqual(missingProjectSkills(null, 'B'), []);
  });

  it('does not hand a parent Claude Code session\'s variables to the run', () => {
    const saved = { ...process.env };
    try {
      Object.assign(process.env, { CLAUDECODE: '1', CLAUDE_EFFORT: 'low', CLAUDE_CODE_SESSION_ID: 's', CLAUDE_CODE_MESSAGING_TOKEN: 't', GIT_DIR: '/x/.git', ANTHROPIC_API_KEY: 'k' });
      const env = childEnv();
      for (const k of ['CLAUDECODE', 'CLAUDE_EFFORT', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_MESSAGING_TOKEN', 'GIT_DIR']) assert.equal(env[k], undefined, k);
      assert.equal(env.ANTHROPIC_API_KEY, 'k', 'authentication is kept');
      assert.equal(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  });

  it('does not tell the run where the repository is (npm\'s variables, PWD, PATH entries)', () => {
    const saved = { ...process.env };
    try {
      Object.assign(process.env, { npm_package_json: path.join(ROOT, 'package.json'), INIT_CWD: ROOT, PWD: ROOT, PATH: [path.join(ROOT, 'node_modules', '.bin'), '/usr/bin'].join(path.delimiter) });
      const env = childEnv();
      for (const k of ['npm_package_json', 'INIT_CWD', 'PWD']) assert.equal(env[k], undefined, k);
      assert.equal(env.PATH, '/usr/bin');
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  });
});

// ---- whole runs with the stub ---------------------------------------------------------------------

describe('runs', () => {
  it('runs every planned run, writes results, transcripts and meta, and cleans up', async () => {
    const out = outDir();
    const log = path.join(scratch, `log-${counter++}.jsonl`);
    process.env.BENCH_STUB_LOG = log;
    process.env.BENCH_STUB_READ = 'src/a.ts';
    const r = await bench(['--go', '--reps', '1', '--seed', '3', '--out', out]);
    assert.equal(r.code, 0, r.err.join('\n'));
    const runs = readRuns(out);
    assert.deepEqual(runs.map((x) => x.id), ['t-ctrl.A.1', 't-ctrl.B.1', 't-disc.A.1', 't-disc.B.1', 't-disc.C.1']);
    for (const run of runs) {
      assert.equal(run.schema, 1);
      assert.equal(run.pass, true, run.id);
      assert.equal(run.costUsd, 0.02);
      assert.equal(run.numTurns, 2);
      assert.equal(run.claudeVersion, '9.9.9');
      assert.deepEqual(run.toolCalls, { total: 1, byName: { Read: 1 } });
      assert.ok(fs.existsSync(path.join(out, 'transcripts', `${run.id}.jsonl`)));
      assert.equal(run.hookInjections > 0, run.arm === 'B', `${run.id}: only arm B has hooks`);
      assert.equal(run.hookChars > 0, run.arm === 'B');
    }
    assert.equal(runs.find((x) => x.id === 't-disc.A.1')!.callsBeforeTarget, 0);
    assert.equal(runs.find((x) => x.id === 't-ctrl.A.1')!.callsBeforeTarget, null, 'it read a.ts, a target of the other task');
    const meta = readMeta(out);
    assert.deepEqual([meta.plannedRuns, meta.completedRuns, meta.stoppedEarly, meta.spentUsd, meta.model], [5, 5, false, 0.1, 'claude-sonnet-5-5']);
    assert.equal(meta.args.seed, 3);
    assert.equal(calls(log), 5);
    // the invocation that reached the (stub) claude had the same flags in every arm
    const invocations = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { argv: string[]; cwd: string; autoMemoryOff: string; hooks: boolean });
    assert.equal(new Set(invocations.map((i) => JSON.stringify(i.argv.filter((a) => !a.startsWith('Do '))))).size, 1);
    assert.ok(invocations.every((i) => i.autoMemoryOff === '1'));
    assert.equal(invocations.filter((i) => i.hooks).length, 2, 'two arm B runs');
    for (const i of invocations) assert.equal(fs.existsSync(i.cwd), false, 'working copies are removed');
  });

  it('hands the grader the finished workdir and the final text', async () => {
    process.env.BENCH_STUB_SCENARIO = 'edit';
    process.env.BENCH_STUB_WRITE = 'out/result.txt=hello';
    process.env.BENCH_STUB_ANSWER = 'the answer';
    const seen: string[] = [];
    const grade: GradeFn = async (t, workdir, text, taskDir) => {
      seen.push(`${t.id}|${text}|${fs.readFileSync(path.join(workdir, 'out', 'result.txt'), 'utf8').trim()}|${path.basename(taskDir)}`);
      return { pass: true, detail: ['edited'] };
    };
    const out = outDir();
    const r = await bench(['--go', '--reps', '1', '--tasks', 't-ctrl', '--arms', 'A', '--out', out], grade);
    assert.equal(r.code, 0, r.err.join('\n'));
    assert.deepEqual(seen, ['t-ctrl|the answer|hello|t-ctrl']);
    const [run] = readRuns(out);
    assert.deepEqual(run!.toolCalls.byName, { Read: 1, Write: 1 });
    assert.equal(run!.numTurns, 3);
    assert.deepEqual(run!.grade.detail, ['edited']);
  });

  it('records a budget-stopped run with its cost and pass false, never dropped', async () => {
    process.env.BENCH_STUB_SCENARIO = 'budget';
    const out = outDir();
    const r = await bench(['--go', '--reps', '1', '--tasks', 't-ctrl', '--arms', 'A', '--per-run-usd', '0.3', '--out', out]);
    assert.equal(r.code, 0, 'a run hitting its own allowance is a result, not a harness failure');
    const [run] = readRuns(out);
    assert.equal(run!.budgetExceeded, true);
    assert.equal(run!.pass, false);
    assert.equal(run!.costUsd, 0.3);
    assert.equal(run!.exitCode, 1);
    assert.match(run!.grade.detail.join('\n'), /per-run budget/);
    assert.equal(readMeta(out).spentUsd, 0.3);
  });

  it('records a run with no result event, and a crashed one, as failures', async () => {
    for (const scenario of ['noresult', 'crash']) {
      process.env.BENCH_STUB_SCENARIO = scenario;
      const out = outDir();
      const r = await bench(['--go', '--reps', '1', '--tasks', 't-ctrl', '--arms', 'A', '--out', out]);
      assert.equal(r.code, 0, r.err.join('\n'));
      const [run] = readRuns(out);
      assert.equal(run!.subtype, 'no_result', scenario);
      assert.equal(run!.pass, false);
      assert.equal(run!.isError, true);
      assert.equal(run!.costUsd, 0);
      assert.equal(run!.exitCode, scenario === 'crash' ? 3 : 0);
      assert.match(run!.grade.detail.join('\n'), /no result event/);
      assert.equal(run!.toolCalls.total, 1);
    }
  });

  it('kills a run that outlives its time limit', async () => {
    process.env.BENCH_STUB_SCENARIO = 'hang';
    const out = outDir();
    const r = await bench(['--go', '--reps', '1', '--tasks', 't-ctrl', '--arms', 'A', '--timeout-s', '1', '--out', out]);
    assert.equal(r.code, 0, r.err.join('\n'));
    const [run] = readRuns(out);
    assert.equal(run!.exitCode, null);
    assert.equal(run!.pass, false);
    assert.match(run!.grade.detail.join('\n'), /killed after 1s/);
  });

  it('exits 1 when an isolation leak or a crashed grader broke the harness', async () => {
    process.env.BENCH_STUB_SCENARIO = 'leak';
    let r = await bench(['--go', '--reps', '1', '--tasks', 't-ctrl', '--arms', 'A', '--out', outDir()]);
    assert.equal(r.code, 1);
    assert.match(r.err.join('\n'), /isolation leak/);
    // a leak stops the plan: no more money on runs that would be contaminated too
    const log = path.join(scratch, `log-${counter++}.jsonl`);
    process.env.BENCH_STUB_LOG = log;
    const leakOut = outDir();
    r = await bench(['--go', '--reps', '3', '--concurrency', '1', '--tasks', 't-ctrl', '--arms', 'A', '--out', leakOut]);
    assert.equal(r.code, 1);
    assert.equal(calls(log), 1);
    assert.match(readMeta(leakOut).stopReason ?? '', /isolation leak/);
    delete process.env.BENCH_STUB_LOG;
    delete process.env.BENCH_STUB_SCENARIO;
    const out = outDir();
    r = await bench(['--go', '--reps', '1', '--tasks', 't-ctrl', '--arms', 'A', '--out', out], async () => {
      throw new Error('boom');
    });
    assert.equal(r.code, 1);
    const [run] = readRuns(out);
    assert.equal(run!.pass, false);
    assert.match(run!.grade.detail.join('\n'), /grader crashed: boom/);
  });
});

// ---- budget and resume ----------------------------------------------------------------------------

describe('budget', () => {
  it('Budget reserves every run in flight at its allowance times 1.5', () => {
    const b = new Budget(0.45, 0.1);
    assert.equal(b.canStart(), true);
    b.start();
    b.start();
    assert.equal(b.canStart(), true, '0.15 reserved x2 + 0.15 = 0.45');
    b.start();
    assert.equal(b.canStart(), false);
    b.finish(0.02);
    assert.equal(b.canStart(), false, '0.02 spent + 2 reserved + 0.15 > 0.45');
    b.finish(0.02);
    b.finish(0.02);
    assert.equal(b.canStart(), true);
    assert.equal(b.spentUsd, 0.06);
  });

  it('stops before a run that could pass the total, writes meta, exits 1', async () => {
    process.env.BENCH_STUB_COST = '0.1';
    const log = path.join(scratch, `log-${counter++}.jsonl`);
    process.env.BENCH_STUB_LOG = log;
    const out = outDir();
    const r = await bench(['--go', '--reps', '2', '--concurrency', '1', '--budget-usd', '0.35', '--per-run-usd', '0.1', '--out', out]);
    assert.equal(r.code, 1);
    assert.equal(calls(log), 3);
    const meta = readMeta(out);
    assert.equal(meta.stoppedEarly, true);
    assert.match(meta.stopReason ?? '', /budget/);
    assert.equal(meta.completedRuns, 3);
    assert.equal(meta.spentUsd, 0.3);
    assert.equal(meta.plannedRuns, 10);
    assert.equal(readRuns(out).length, 3);
  });

  it('never lets concurrent runs carry the total past the budget', async () => {
    process.env.BENCH_STUB_COST = '0.1';
    const log = path.join(scratch, `log-${counter++}.jsonl`);
    process.env.BENCH_STUB_LOG = log;
    const out = outDir();
    const r = await bench(['--go', '--reps', '3', '--concurrency', '4', '--budget-usd', '0.45', '--per-run-usd', '0.1', '--out', out]);
    assert.equal(r.code, 1);
    assert.ok(calls(log) <= 4);
    assert.ok(readMeta(out).spentUsd <= 0.45);
  });

  it('waits for runs in flight instead of stopping while the budget still has room', async () => {
    // $1.6 total, $0.5 a run ($0.75 reserved), two at a time: both start ($1.5 reserved); each costs $0.02, so
    // after they finish there is room for more. Stopping at the first full reservation would end
    // the plan after two runs with $1.56 unspent.
    process.env.BENCH_STUB_COST = '0.02';
    const log = path.join(scratch, `log-${counter++}.jsonl`);
    process.env.BENCH_STUB_LOG = log;
    const out = outDir();
    const r = await bench(['--go', '--reps', '2', '--concurrency', '2', '--budget-usd', '1.6', '--per-run-usd', '0.5', '--out', out]);
    assert.equal(r.code, 0, r.err.join('\n'));
    assert.equal(calls(log), 10);
    assert.equal(readMeta(out).stoppedEarly, false);
    assert.equal(readMeta(out).spentUsd, 0.2);
  });

  it('counts a run with no result event at its full allowance against the budget', async () => {
    process.env.BENCH_STUB_SCENARIO = 'noresult';
    const log = path.join(scratch, `log-${counter++}.jsonl`);
    process.env.BENCH_STUB_LOG = log;
    const out = outDir();
    const r = await bench(['--go', '--reps', '2', '--concurrency', '1', '--budget-usd', '0.25', '--per-run-usd', '0.1', '--out', out]);
    assert.equal(r.code, 1);
    assert.equal(calls(log), 2, 'two unknown-cost runs use $0.2 of $0.25: no third');
    const meta = readMeta(out);
    assert.equal(meta.stoppedEarly, true);
    assert.equal(meta.spentUsd, 0, 'meta reports the cost the stream gave');
  });

  it('resumes: an existing results folder skips finished runs and counts their cost', async () => {
    process.env.BENCH_STUB_COST = '0.1';
    const log = path.join(scratch, `log-${counter++}.jsonl`);
    process.env.BENCH_STUB_LOG = log;
    const out = outDir();
    const first = await bench(['--go', '--reps', '2', '--concurrency', '1', '--budget-usd', '0.35', '--per-run-usd', '0.1', '--seed', '5', '--out', out]);
    assert.equal(first.code, 1);
    assert.equal(calls(log), 3);
    const done = readRuns(out).map((x) => x.id);

    // More budget, no --seed: the folder's seed and finished runs are reused.
    const second = await bench(['--go', '--reps', '2', '--concurrency', '1', '--budget-usd', '5', '--per-run-usd', '0.1', '--out', out]);
    assert.equal(second.code, 0, second.err.join('\n'));
    assert.match(second.out.join('\n'), /resuming: 3 of 10 runs/);
    assert.equal(calls(log), 10, 'only the seven missing runs ran');
    const all = readRuns(out);
    assert.equal(all.length, 10);
    assert.deepEqual(done.filter((id) => !all.some((x) => x.id === id)), []);
    const meta = readMeta(out);
    assert.equal(meta.stoppedEarly, false);
    assert.equal(meta.args.seed, 5);
    assert.equal(meta.completedRuns, 10);
    assert.equal(meta.spentUsd, 1);

    // A third pass has nothing left to do.
    const third = await bench(['--go', '--reps', '2', '--budget-usd', '5', '--per-run-usd', '0.1', '--out', out]);
    assert.equal(third.code, 0);
    assert.equal(calls(log), 10);
  });

  it('the init event lists the edukai skill in B and C only, which is not a leak; any other skill is', async () => {
    for (const [arm, code] of [['A', 0], ['B', 0], ['C', 0]] as const) {
      const out = outDir();
      assert.equal((await bench(['--go', '--reps', '1', '--tasks', 't-disc', '--arms', arm, '--out', out])).code, code, arm);
    }
    process.env.BENCH_STUB_SCENARIO = 'skillleak';
    const out = outDir();
    const r = await bench(['--go', '--reps', '1', '--tasks', 't-disc', '--arms', 'B', '--out', out]);
    assert.equal(r.code, 1);
    assert.match(r.err.join('\n'), /isolation leak.*good2go/);
  });

  it('records the upkeep split, and its parts sum to the run', async () => {
    process.env.BENCH_STUB_COST = '0.1';
    const out = outDir();
    assert.equal((await bench(['--go', '--reps', '1', '--tasks', 't-disc', '--arms', 'A,B', '--out', out])).code, 0);
    for (const r of readRuns(out)) {
      assert.ok(r.split, r.id);
      const s = r.split!;
      assert.equal(s.task.turns + s.use.turns + s.upkeep.turns >= 1, true);
      assert.equal(s.task.toolCalls + s.use.toolCalls + s.upkeep.toolCalls, r.toolCalls.total);
      assert.ok(Math.abs(s.task.estCostUsd + s.use.estCostUsd + s.upkeep.estCostUsd - r.costUsd) < 1e-9);
    }
  });

  it('a result file that is damaged is run again; a different model is refused', async () => {
    const log = path.join(scratch, `log-${counter++}.jsonl`);
    process.env.BENCH_STUB_LOG = log;
    const out = outDir();
    const args = ['--go', '--reps', '1', '--tasks', 't-ctrl', '--arms', 'A', '--out', out];
    assert.equal((await bench(args)).code, 0);
    fs.writeFileSync(path.join(out, 'runs', 't-ctrl.A.1.json'), '{ not json');
    assert.equal((await bench(args)).code, 0);
    assert.equal(calls(log), 2);
    assert.equal(readRuns(out)[0]!.pass, true);
    const other = await bench([...args, '--model', 'claude-other']);
    assert.equal(other.code, 2);
    assert.match(other.err.join('\n'), /mix models/);
  });
});

// ---- memory upkeep split ----------------------------------------------------------------------

type Ev = Record<string, unknown>;
let msgNo = 0;
/** One assistant message (the stream repeats the id once per content block) with the given calls. */
const message = (calls: Array<[string, Record<string, unknown>]>, usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } = { input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 100 }): Ev[] => {
  const id = `msg_${msgNo++}`;
  const blocks = calls.length ? calls.map(([name, input], i) => ({ type: 'tool_use', id: `${id}_${i}`, name, input })) : [{ type: 'text', text: 'done' }];
  return blocks.map((b) => ({ type: 'assistant', message: { id, content: [b], usage } }));
};
const resultEvent = (cost: number, output: number): Ev => ({ type: 'result', subtype: 'success', total_cost_usd: cost, usage: { output_tokens: output } });
const WD = '/tmp/okf-bench-x/work';

describe('memory upkeep classification', () => {
  const cls = (name: string, input: Record<string, unknown>) => classifyCall(name, input);

  it('edits and writes under edukai/ are upkeep', () => {
    assert.equal(cls('Edit', { file_path: `${WD}/edukai/codebase/lessons/x.md` }), 'upkeep');
    assert.equal(cls('Write', { file_path: 'edukai/new.md' }), 'upkeep');
    assert.equal(cls('Edit', { file_path: `${WD}/src/edukai-notes.ts` }), 'task');
    assert.equal(cls('Edit', { file_path: `${WD}/src/a.ts` }), 'task');
    assert.equal(cls('Bash', { command: "sed -i 's/a/b/' edukai/codebase/overview.md" }), 'upkeep');
    assert.equal(cls('Bash', { command: "cd edukai/codebase && sed -i 's/a/b/g' overview.md" }), 'upkeep');
    assert.equal(cls('Bash', { command: 'echo x >> edukai/log.md' }), 'upkeep');
  });

  it('edukai:recheck, index and validate, `good2go edukai ...` and the edukai skill are upkeep', () => {
    for (const command of ['npm run edukai:recheck 2>&1 | tail -8', 'npm run edukai:index', 'npm run edukai:validate', 'npx good2go edukai verify some/lesson.md', 'node_modules/.bin/good2go edukai supersede a b']) {
      assert.equal(cls('Bash', { command }), 'upkeep', command);
    }
    assert.equal(cls('Skill', { skill: 'edukai' }), 'upkeep');
    assert.equal(cls('Skill', { skill: 'simplify' }), 'task');
  });

  it('edukai:brief, edukai:search and reads of edukai/ are use', () => {
    assert.equal(cls('Bash', { command: 'npm run edukai:brief 2>&1 | head -50' }), 'use');
    assert.equal(cls('Bash', { command: 'npm run edukai:search -- search "timeout"' }), 'use');
    assert.equal(cls('Bash', { command: 'cat edukai/codebase/overview.md; grep -rn timeout src' }), 'use');
    assert.equal(cls('Bash', { command: 'ls edukai 2>&1' }), 'use');
    assert.equal(cls('Read', { file_path: `${WD}/edukai/codebase/lessons/x.md` }), 'use');
    assert.equal(cls('Grep', { pattern: 'timeout', path: 'edukai' }), 'use');
    assert.equal(cls('Glob', { pattern: 'edukai/**/*.md' }), 'use');
    // the content pattern is what to look for, not where
    assert.equal(cls('Grep', { pattern: 'edukai/', path: 'src' }), 'task');
  });

  it('ordinary file work is task, including a heredoc that merely mentions edukai', () => {
    assert.equal(cls('Read', { file_path: `${WD}/src/a.ts` }), 'task');
    assert.equal(cls('Grep', { pattern: 'x', path: 'src' }), 'task');
    assert.equal(cls('Bash', { command: 'npm test 2>&1 | tail -12' }), 'task');
    assert.equal(cls('Bash', { command: "sed -i 's/a/b/' src/a.ts && git status" }), 'task');
    assert.equal(cls('Bash', { command: "cat >> docs/n.md <<'EOF'\nsee edukai/ and npm run edukai:recheck\nEOF\nnpm test" }), 'task');
    assert.equal(cls('Bash', { command: 'PARCEL_FAKE_CARRIERS=1 npm run test:full 2>&1 | grep -E "^# pass"' }), 'task');
  });

  it('a heredoc whose opening line writes into edukai/ is upkeep', () => {
    assert.equal(cls('Bash', { command: "cat <<'EOF' > edukai/codebase/lessons/new.md\n---\ntitle: x\nEOF" }), 'upkeep');
    assert.equal(cls('Bash', { command: "cat <<EOF | tee edukai/x.md\nhi\nEOF" }), 'upkeep');
  });
});

describe('memory upkeep split', () => {
  /** One assistant message with prose and calls; one event per block, as the stream has it. */
  const rich = (blocks: Array<{ text?: string; thinking?: string; call?: [string, Record<string, unknown>] }>, usage: Record<string, unknown> = { input_tokens: 2, output_tokens: 1, cache_read_input_tokens: 1000, cache_creation_input_tokens: 100 }): Ev[] => {
    const id = `rich_${msgNo++}`;
    return blocks.map((b, i) => ({
      type: 'assistant',
      message: { id, usage, content: [b.call ? { type: 'tool_use', id: `${id}_${i}`, name: b.call[0], input: b.call[1] } : b.thinking !== undefined ? { type: 'thinking', thinking: b.thinking } : { type: 'text', text: b.text ?? '' }] },
    }));
  };
  const near = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

  it('counts turns by message and calls by call; a mixed message is split by its calls', () => {
    const events = [
      ...message([['Read', { file_path: `${WD}/src/a.ts` }]]), // task
      ...message([['Read', { file_path: `${WD}/edukai/x/overview.md` }]]), // use
      ...message([['Edit', { file_path: `${WD}/docs/runbook.md` }], ['Bash', { command: 'npm run edukai:recheck' }]]), // half task, half upkeep
      ...message([['Bash', { command: 'npm run edukai:recheck' }]]), // upkeep
      ...message([]), // final text: task
      resultEvent(1, 100),
    ];
    const s = splitEvents(events, { costUsd: 1, outputTokens: 100 });
    assert.deepEqual([s.task.turns, s.use.turns, s.upkeep.turns], [2.5, 1, 1.5]);
    assert.deepEqual([s.task.toolCalls, s.use.toolCalls, s.upkeep.toolCalls], [2, 1, 2]);
    assert.equal(s.task.toolCalls + s.use.toolCalls + s.upkeep.toolCalls, 5, 'the classes sum to the run\'s tool calls');
  });

  it('the runbook edit plus a re-check in one message is half deliverable work, not all upkeep', () => {
    const events = rich([{ text: 'x'.repeat(100) }, { call: ['Edit', { file_path: `${WD}/docs/runbook.md`, old_string: 'a', new_string: 'b' }] }, { call: ['Bash', { command: 'npm run edukai:recheck' }] }]);
    const s = splitEvents(events, { costUsd: 0.4, outputTokens: 500 });
    near(s.task.turns, 0.5);
    near(s.upkeep.turns, 0.5);
    near(s.task.estCostUsd, 0.2);
    near(s.upkeep.estCostUsd, 0.2);
    near(s.use.estCostUsd, 0);
  });

  it('a heredoc that writes code plus a re-check, and test runs plus a re-check, are split too', () => {
    const heredoc = "cat > src/new.ts <<'EOF'\nexport const x = 1; // npm run edukai:recheck\nEOF\nnpm run edukai:recheck";
    assert.deepEqual(bashParts(heredoc), ['task', 'upkeep']);
    assert.deepEqual(bashParts('npm test 2>&1 | tail -5; npm run edukai:recheck 2>&1 | tail -3'), ['task', 'upkeep']);
    const s = splitEvents(rich([{ call: ['Bash', { command: heredoc }] }]), { costUsd: 1, outputTokens: 10 });
    near(s.task.turns, 0.5);
    near(s.upkeep.turns, 0.5);
    near(s.task.toolCalls, 0.5);
    near(s.upkeep.toolCalls, 0.5);
  });

  it('shares sum to the run: cost and output tokens', () => {
    const big = { input_tokens: 2, output_tokens: 40, cache_read_input_tokens: 9000, cache_creation_input_tokens: 800 };
    const events = [
      ...message([['Read', { file_path: 'src/a.ts' }]]),
      ...message([['Bash', { command: 'npm run edukai:recheck' }]], big),
      ...message([['Bash', { command: 'npm run edukai:brief' }]]),
      ...message([]),
    ];
    const s = splitEvents(events, { costUsd: 0.123457, outputTokens: 777 });
    near(s.task.estCostUsd + s.use.estCostUsd + s.upkeep.estCostUsd, 0.123457, 1e-9);
    assert.equal(s.task.outputTokens + s.use.outputTokens + s.upkeep.outputTokens, 777);
    assert.ok(s.upkeep.estCostUsd > s.use.estCostUsd, 'the bigger message gets the bigger share');
  });

  it('prices: input 1, output 5, cache read 0.05, cache creation 1.25 (5 minutes) or 2 (one hour) or 2 without the breakdown', () => {
    // Two single-class messages with no prose and equal calls, so output is shared by content length.
    const call = (cmd: string): [string, Record<string, unknown>] => ['Bash', { command: cmd }];
    const cmdA = 'npm test'; // task
    const cmdB = 'npm run edukai:recheck'; // upkeep
    const len = (c: string): number => JSON.stringify({ command: c }).length;
    const usage = (cc: Record<string, unknown> | undefined) => ({ input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 2000, cache_creation_input_tokens: 400, ...(cc ? { cache_creation: cc } : {}) });
    const total = 600;
    const outA = (total * len(cmdA)) / (len(cmdA) + len(cmdB));
    const outB = total - outA;
    const share = (ccA: Record<string, unknown> | undefined, creationA: number, ccB: Record<string, unknown> | undefined, creationB: number): number => {
      const events = [...rich([{ call: call(cmdA) }], usage(ccA)), ...rich([{ call: call(cmdB) }], usage(ccB)), resultEvent(1, total)];
      const s = splitEvents(events, { costUsd: 1, outputTokens: total });
      const wA = 100 + 0.05 * 2000 + creationA + 5 * outA;
      const wB = 100 + 0.05 * 2000 + creationB + 5 * outB;
      near(s.upkeep.estCostUsd, wB / (wA + wB), 1e-5);
      return s.upkeep.estCostUsd;
    };
    share({ ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 400 }, 800, { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 400 }, 800);
    share({ ephemeral_5m_input_tokens: 400, ephemeral_1h_input_tokens: 0 }, 500, { ephemeral_5m_input_tokens: 400, ephemeral_1h_input_tokens: 0 }, 500);
    share({ ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 300 }, 125 + 600, { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 300 }, 125 + 600);
    share(undefined, 800, undefined, 800);
  });

  it('output tokens are the result total shared by content length, not the early per-message snapshots', () => {
    // The snapshots say 1 and 999: they must not matter. Task prose is 300 characters; the upkeep call's input JSON is known.
    const cmd = 'npm run edukai:recheck';
    const callChars = JSON.stringify({ command: cmd }).length;
    const events = [
      ...rich([{ text: 'x'.repeat(300) }], { input_tokens: 2, output_tokens: 999 }),
      ...rich([{ call: ['Bash', { command: cmd }] }], { input_tokens: 2, output_tokens: 1 }),
      resultEvent(1, 1000),
    ];
    const s = splitEvents(events, { costUsd: 1, outputTokens: 1000 });
    assert.equal(s.upkeep.outputTokens, Math.round((1000 * callChars) / (300 + callChars)));
    assert.equal(s.task.outputTokens + s.use.outputTokens + s.upkeep.outputTokens, 1000);
    // thinking counts like text, and a mixed message shares its prose by its calls
    const mixed = splitEvents(rich([{ thinking: 'y'.repeat(200) }, { call: ['Edit', { file_path: 'src/a.ts', old_string: 'x'.repeat(300), new_string: 'y' }] }, { call: ['Bash', { command: cmd }] }]), { costUsd: 1, outputTokens: 400 });
    assert.equal(mixed.task.outputTokens + mixed.use.outputTokens + mixed.upkeep.outputTokens, 400);
    assert.ok(mixed.task.outputTokens > mixed.upkeep.outputTokens, 'the Edit call input is longer than the re-check command');
  });

  it('a run with no upkeep, or no messages at all, puts everything in task', () => {
    const a = splitEvents([...message([['Read', { file_path: 'src/a.ts' }]]), ...message([])], { costUsd: 0.5, outputTokens: 10 });
    assert.deepEqual([a.use.turns, a.upkeep.turns, a.upkeep.estCostUsd, a.task.estCostUsd], [0, 0, 0, 0.5]);
    const none = splitEvents([], { costUsd: 0.5, outputTokens: 10 });
    assert.deepEqual([none.task.turns, none.task.estCostUsd], [0, 0.5]);
  });

  it('works on a transcript text, and parseStream carries the same split', () => {
    const events = [...message([['Bash', { command: 'npm run edukai:recheck' }]]), ...message([]), resultEvent(0.2, 50)];
    const text = events.map((e) => JSON.stringify(e)).join('\n');
    const s = splitTranscript(text);
    assert.equal(s.upkeep.turns, 1);
    assert.deepEqual(parseStream(text).split, s);
    assert.match(s.method, /^upkeep-split-v2/);
    assert.match(SPLIT_METHOD, /^upkeep-split-v2/);
  });
});

describe('mixed Bash command parts', () => {
  it('cuts at ; && || | and newlines, keeping a heredoc\'s opening line', () => {
    assert.deepEqual(bashParts("sed -i 's/a/b/' src/a.ts && npm run edukai:recheck"), ['task', 'upkeep']);
    assert.deepEqual(bashParts('npm test; npm run edukai:brief'), ['task', 'use']);
    assert.deepEqual(bashParts('npm test || npm run edukai:validate'), ['task', 'upkeep']);
    assert.deepEqual(bashParts('npm test\nnpm run edukai:recheck'), ['task', 'upkeep']);
    assert.deepEqual(bashParts("cat <<'EOF' > edukai/x/lessons/n.md\nbody && npm test\nEOF\nnpm test"), ['upkeep', 'task']);
    assert.deepEqual(bashParts("cat >> docs/n.md <<'EOF'\nsee edukai/ and npm run edukai:recheck\nEOF"), ['task']);
  });

  it('an output filter joins the part before its pipe, and cd makes no part', () => {
    assert.deepEqual(bashParts('npm run edukai:recheck 2>&1 | tail -8'), ['upkeep']);
    assert.deepEqual(bashParts('npm test 2>&1 | grep -E "^# (pass|fail)" | head -4'), ['task']);
    assert.deepEqual(bashParts("cd edukai/codebase && sed -i 's/a/b/' overview.md"), ['upkeep']);
    assert.deepEqual(bashParts('cd src && ls'), ['task']);
    assert.deepEqual(bashParts('cat edukai/x/overview.md | head -5; grep -rn timeout src'), ['use', 'task']);
    assert.deepEqual(bashParts('cd'), ['task']);
  });

  it('a call is classified as its strongest part, and counted by its parts in the split', () => {
    assert.equal(classifyCall('Bash', { command: 'npm test && npm run edukai:recheck' }), 'upkeep');
    assert.equal(classifyCall('Bash', { command: 'npm test; npm run edukai:brief' }), 'use');
    const s = splitEvents(message([['Bash', { command: "sed -i 's/a/b/' src/a.ts && npm run edukai:recheck" }]]), { costUsd: 1, outputTokens: 10 });
    assert.deepEqual([s.task.toolCalls, s.upkeep.toolCalls, s.task.turns, s.upkeep.turns], [0.5, 0.5, 0.5, 0.5]);
  });
});

describe('re-analysing the pilot transcripts', () => {
  const PILOT = path.join(ROOT, 'test', 'bench', 'results', 'pilot-20261011-1235');
  const REPORT = path.join(ROOT, 'test', 'bench', 'report.mts');

  it('fills the split from a COPY of the pilot, and the original is untouched', { skip: !fs.existsSync(PILOT) && 'the pilot results are not on this machine' }, () => {
    const before = fs.readFileSync(path.join(PILOT, 'runs', 't1-stale-timeout.B.1.json'), 'utf8');
    const copy = path.join(scratch, `pilot-copy-${counter++}`);
    fs.cpSync(PILOT, copy, { recursive: true });
    const res = spawnSync(process.execPath, [REPORT, copy, '--reanalyse'], { encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stderr, /re-analysed 12 runs/);
    const run = (id: string) => JSON.parse(fs.readFileSync(path.join(copy, 'runs', `${id}.json`), 'utf8')) as RunResult;
    const b = run('t1-stale-timeout.B.1');
    const a = run('t1-stale-timeout.A.1');
    assert.ok(b.split!.upkeep.turns > 0, 'B recorded and re-checked lessons');
    assert.ok(b.split!.upkeep.toolCalls > 0);
    assert.equal(a.split!.upkeep.turns, 0);
    assert.equal(a.split!.upkeep.estCostUsd, 0);
    assert.equal(a.split!.use.turns, 0);
    for (const r of [a, b]) assert.ok(Math.abs(r.split!.task.estCostUsd + r.split!.use.estCostUsd + r.split!.upkeep.estCostUsd - r.costUsd) < 1e-6);
    // every run: the new method, and the parts sum to the bill and to the real output total
    for (const f of fs.readdirSync(path.join(copy, 'runs'))) {
      const r = JSON.parse(fs.readFileSync(path.join(copy, 'runs', f), 'utf8')) as RunResult;
      assert.match(r.split!.method, /^upkeep-split-v2/, r.id);
      const sum = (k: 'estCostUsd' | 'outputTokens' | 'toolCalls'): number => r.split!.task[k] + r.split!.use[k] + r.split!.upkeep[k];
      assert.ok(Math.abs(sum('estCostUsd') - r.costUsd) < 1e-5, `${r.id} cost`);
      assert.equal(sum('outputTokens'), r.usage.output, `${r.id} output tokens`);
      assert.ok(Math.abs(sum('toolCalls') - r.toolCalls.total) < 1e-4, `${r.id} tool calls`);
    }
    // nothing else in a run file changed
    const { split: _split, ...rest } = b;
    assert.deepEqual(rest, JSON.parse(before));
    assert.equal(fs.readFileSync(path.join(PILOT, 'runs', 't1-stale-timeout.B.1.json'), 'utf8'), before);
    assert.equal(JSON.parse(before).split, undefined);

    // the report compares A, B and B without upkeep, with the estimate caveat
    const md = renderMarkdown(buildReport(loadResults(copy).runs, loadResults(copy).meta));
    assert.match(md, /Against A, with and without memory upkeep/);
    assert.match(md, /excluding upkeep/i);
    assert.match(md, /cost is an estimate/);
    assert.match(md, /Upkeep is a real cost of edukai/);
  });

  it('the price ratios rebuild every pilot bill within 1% from the result event\'s usage', { skip: !fs.existsSync(PILOT) && 'the pilot results are not on this machine' }, () => {
    // $2 / $10 / $0.10 per million, and $2.50 (5 minutes) or $4 (one hour) for cache creation: the ratios 1, 5, 0.05, 1.25, 2.
    for (const f of fs.readdirSync(path.join(PILOT, 'transcripts'))) {
      const events = fs.readFileSync(path.join(PILOT, 'transcripts', f), 'utf8').split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as Record<string, any>);
      const result = events.find((e) => e.type === 'result')!;
      const u = result.usage;
      const cc = u.cache_creation ?? {};
      assert.equal(typeof cc.ephemeral_1h_input_tokens, 'number', `${f} exposes the cache breakdown`);
      const usd = (u.input_tokens * 2 + u.output_tokens * 10 + u.cache_read_input_tokens * 0.1 + cc.ephemeral_5m_input_tokens * 2.5 + cc.ephemeral_1h_input_tokens * 4) / 1e6;
      assert.ok(Math.abs(usd - result.total_cost_usd) / result.total_cost_usd < 0.01, `${f}: ${usd} vs ${result.total_cost_usd}`);
    }
  });

  it('reanalyse leaves a run with no transcript alone and names it', () => {
    const dir = path.join(scratch, `no-transcript-${counter++}`);
    fs.mkdirSync(path.join(dir, 'runs'), { recursive: true });
    const src = path.join(PILOT, 'runs', 't1-stale-timeout.A.1.json');
    if (!fs.existsSync(src)) return;
    fs.copyFileSync(src, path.join(dir, 'runs', 't1-stale-timeout.A.1.json'));
    assert.deepEqual(reanalyse(dir), { updated: [], skipped: ['t1-stale-timeout.A.1'] });
    assert.equal((JSON.parse(fs.readFileSync(path.join(dir, 'runs', 't1-stale-timeout.A.1.json'), 'utf8')) as RunResult).split, undefined);
  });

  it('results made before the split are still read and reported, without the upkeep section', { skip: !fs.existsSync(PILOT) && 'the pilot results are not on this machine' }, () => {
    const { runs, meta } = loadResults(PILOT);
    assert.ok(runs.every((r) => r.split === undefined));
    assert.doesNotMatch(renderMarkdown(buildReport(runs, meta)), /with and without memory upkeep/);
  });
});
