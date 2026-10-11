#!/usr/bin/env node
/**
 * The benchmark runner: Claude Code with and without edukai. See test/bench/spec.md.
 *
 *   node test/bench/run.mts --go [--pilot] [--reps 3] [--arms A,B,C] [--tasks id,id]
 *     [--model claude-sonnet-5-5] [--concurrency 2] [--budget-usd 10] [--per-run-usd 0.50]
 *     [--seed N] [--out test/bench/results/<stamp>] [--claude <path>] [--dry-run]
 *
 *   --go        spend money: really run `claude`. Without it (or --dry-run) the runner refuses.
 *   --dry-run   print the plan, the per-run and the worst-case cost, and write nothing
 *   --pilot     one rep of every task in arms A and B
 *   --out       an existing results folder is resumed: runs whose result file exists are skipped
 *   --claude    the binary to run (default `claude`); a .mjs file runs under this node (the stub)
 *   --keep      keep each run's working copy (default: removed after grading)
 *   --fixture, --tasks-dir, --repo, --timeout-s   where the fixture, the tasks and the built
 *               package live, and each run's time limit (defaults: this folder's, the repository, 1500)
 *
 * Output: <out>/meta.json (rewritten after every run), <out>/runs/<id>.json (a RunResult) and
 * <out>/transcripts/<id>.jsonl (the raw stream).
 *
 * Exit codes: 0 every planned run completed, 1 stopped early (budget) or a run broke the harness
 * (the grader crashed, or user skills or MCP servers leaked into the run), 2 could not run
 * (refused, bad arguments, no dist/, no `claude`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { armsOf, BENCH_DIR, CannotRun, gitSha, REPO_ROOT, requireDist, setupWorkdir } from './lib/arms.mts';
import { Budget, reserveUsd, round, shuffle, worstCaseUsd } from './lib/budget.mts';
import { buildArgs, claudeVersion, isolationLeaks, missingProjectSkills, parseStream, spawnClaude } from './lib/claude.mts';
import type { Arm, GradeResult, RunMeta, RunResult, Task } from './lib/types.mts';

export type GradeFn = (task: Task, workdir: string, resultText: string, taskDir: string) => Promise<GradeResult>;

export class UsageError extends Error {}

export interface Options {
  go: boolean;
  dryRun: boolean;
  pilot: boolean;
  reps: number;
  arms: Arm[];
  tasks: string[] | null;
  model: string;
  concurrency: number;
  budgetUsd: number;
  perRunUsd: number;
  seed: number | null;
  out: string | null;
  claude: string;
  keep: boolean;
  fixture: string;
  tasksDir: string;
  repo: string;
  timeoutS: number;
  help: boolean;
}

const ARMS: Arm[] = ['A', 'B', 'C'];

export function parseArgs(argv: string[]): Options {
  const o: Options = {
    go: false, dryRun: false, pilot: false, reps: 3, arms: [...ARMS], tasks: null, model: 'claude-sonnet-5-5',
    concurrency: 2, budgetUsd: 10, perRunUsd: 0.5, seed: null, out: null, claude: 'claude', keep: false,
    fixture: path.join(BENCH_DIR, 'fixture'), tasksDir: path.join(BENCH_DIR, 'tasks'), repo: REPO_ROOT, timeoutS: 1500, help: false,
  };
  const value = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new UsageError(`${flag} needs a value`);
    return v;
  };
  const int = (v: string, flag: string, min: number): number => {
    if (!/^-?\d+$/.test(v) || Number(v) < min) throw new UsageError(`${flag} must be an integer of at least ${min} (got "${v}")`);
    return Number(v);
  };
  const usd = (v: string, flag: string): number => {
    const n = Number(v);
    if (v.trim() === '' || !Number.isFinite(n) || n <= 0) throw new UsageError(`${flag} must be a positive number of dollars (got "${v}")`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case '--go': o.go = true; break;
      case '--dry-run': o.dryRun = true; break;
      case '--pilot': o.pilot = true; break;
      case '--keep': o.keep = true; break;
      case '--help': case '-h': o.help = true; break;
      case '--reps': o.reps = int(value(i++, a), a, 1); break;
      case '--concurrency': o.concurrency = int(value(i++, a), a, 1); break;
      case '--seed': o.seed = int(value(i++, a), a, 0); break;
      case '--timeout-s': o.timeoutS = int(value(i++, a), a, 1); break;
      case '--budget-usd': o.budgetUsd = usd(value(i++, a), a); break;
      case '--per-run-usd': o.perRunUsd = usd(value(i++, a), a); break;
      case '--model': o.model = value(i++, a); break;
      case '--out': o.out = path.resolve(value(i++, a)); break;
      case '--claude': {
        // A path is resolved here: each run's cwd is its working copy, not this folder.
        const v = value(i++, a);
        o.claude = v.includes('/') || v.includes('\\') ? path.resolve(v) : v;
        break;
      }
      case '--fixture': o.fixture = path.resolve(value(i++, a)); break;
      case '--tasks-dir': o.tasksDir = path.resolve(value(i++, a)); break;
      case '--repo': o.repo = path.resolve(value(i++, a)); break;
      case '--arms': {
        const arms = value(i++, a).split(',').map((s) => s.trim().toUpperCase());
        const bad = arms.filter((s) => !ARMS.includes(s as Arm));
        if (bad.length || arms.length === 0) throw new UsageError(`--arms takes a comma list of A, B, C (got "${bad.join(',') || '(empty)'}")`);
        o.arms = [...new Set(arms)] as Arm[];
        break;
      }
      case '--tasks': {
        const ids = value(i++, a).split(',').map((s) => s.trim()).filter(Boolean);
        if (ids.length === 0) throw new UsageError('--tasks needs at least one id');
        o.tasks = ids;
        break;
      }
      default:
        throw new UsageError(`unknown option ${a}`);
    }
  }
  if (reserveUsd(o.perRunUsd) > o.budgetUsd) throw new UsageError(`--per-run-usd ($${o.perRunUsd}, reserved as $${reserveUsd(o.perRunUsd)} for a last turn) is more than --budget-usd ($${o.budgetUsd}): not even one run could start`);
  if (o.pilot) {
    o.reps = 1;
    o.arms = o.arms.filter((x) => x !== 'C');
    if (o.arms.length === 0) throw new UsageError('--pilot runs arms A and B; --arms leaves neither');
  }
  return o;
}

// ---- tasks and the plan ---------------------------------------------------------------------

export function loadTasks(tasksDir: string, only: string[] | null): Task[] {
  if (!fs.existsSync(tasksDir)) throw new CannotRun(`no tasks folder at ${tasksDir}`);
  const ids = fs.readdirSync(tasksDir, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(tasksDir, d.name, 'task.json'))).map((d) => d.name).sort();
  if (only) {
    const missing = only.filter((id) => !ids.includes(id));
    if (missing.length) throw new CannotRun(`unknown task id(s): ${missing.join(', ')} (have: ${ids.join(', ') || 'none'})`);
  }
  const tasks: Task[] = [];
  for (const id of only ?? ids) {
    const file = path.join(tasksDir, id, 'task.json');
    let t: Task;
    try {
      t = JSON.parse(fs.readFileSync(file, 'utf8')) as Task;
    } catch (e) {
      throw new CannotRun(`${file} is not valid JSON: ${(e as Error).message}`);
    }
    if (t.id !== id || typeof t.prompt !== 'string' || !Array.isArray(t.targetFiles) || typeof t.grader !== 'object' || t.grader === null) {
      throw new CannotRun(`${file}: needs id "${id}", a prompt, targetFiles and a grader`);
    }
    tasks.push(t);
  }
  if (tasks.length === 0) throw new CannotRun(`no tasks found in ${tasksDir}`);
  return tasks;
}

export interface Planned {
  id: string;
  task: Task;
  arm: Arm;
  rep: number;
}

/** Every (task, arm, rep) to run, shuffled with the seed so arms interleave. */
export function buildPlan(tasks: Task[], arms: Arm[], reps: number, seed: number): Planned[] {
  const all: Planned[] = [];
  for (const task of tasks) {
    for (const arm of armsOf(task)) {
      if (!arms.includes(arm)) continue;
      for (let rep = 1; rep <= reps; rep++) all.push({ id: `${task.id}.${arm}.${rep}`, task, arm, rep });
    }
  }
  return shuffle(all, seed);
}

// ---- one run ---------------------------------------------------------------------------------

interface Ctx {
  o: Options;
  out: string;
  version: string;
  sha: string;
  grade: GradeFn;
  log: (s: string) => void;
}

/**
 * What a finished run counts against the total budget: its reported cost, or its full allowance
 * when no result event arrived (killed, crashed, timed out), since then the real cost is unknown
 * and may be anything up to it. The RunResult keeps the reported cost (0); only the guard is
 * conservative.
 */
export const charged = (r: Pick<RunResult, 'subtype' | 'costUsd'>, perRunUsd: number): number => (r.subtype === 'no_result' ? Math.max(r.costUsd, perRunUsd) : r.costUsd);

const writeJson = (file: string, data: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
};

/** Working copies in use, removed on exit too: an interrupted runner (Ctrl-C) leaves none behind. */
const liveRoots = new Set<string>();
let exitCleanup = false;

async function executeRun(p: Planned, ctx: Ctx): Promise<{ result: RunResult; leaks: string[]; graderCrashed: boolean }> {
  const { o } = ctx;
  // realpath: on macOS the temp folder is a symlink, and claude reports the real paths.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-bench-')));
  if (!o.keep) {
    liveRoots.add(root);
    if (!exitCleanup) {
      exitCleanup = true;
      process.on('exit', () => {
        for (const r of liveRoots) fs.rmSync(r, { recursive: true, force: true });
      });
    }
  }
  const workdir = path.join(root, 'work');
  const startedAt = new Date().toISOString();
  try {
    setupWorkdir({ arm: p.arm, fixtureDir: o.fixture, repoRoot: o.repo, workdir, taskDir: path.join(o.tasksDir, p.task.id) });
    const spawned = await spawnClaude(o.claude, buildArgs(p.task.prompt, o.model, o.perRunUsd), workdir, o.timeoutS * 1000);
    fs.mkdirSync(path.join(ctx.out, 'transcripts'), { recursive: true });
    fs.writeFileSync(path.join(ctx.out, 'transcripts', `${p.id}.jsonl`), spawned.stdout);
    if (spawned.stderr.trim() !== '') fs.writeFileSync(path.join(ctx.out, 'transcripts', `${p.id}.stderr.txt`), spawned.stderr);
    const m = parseStream(spawned.stdout, { targets: p.task.targetFiles, workdir });
    const leaks = isolationLeaks(m.init, undefined, p.arm, workdir);
    // Not a leak but as fatal: an arm without the skill it is meant to have measures a broken install.
    for (const s of missingProjectSkills(m.init, p.arm)) leaks.push(`project skill ${s} missing from the init event (the install in arm ${p.arm} did not take)`);

    let grade: GradeResult;
    let graderCrashed = false;
    try {
      grade = await ctx.grade(p.task, workdir, m.resultText, path.join(o.tasksDir, p.task.id));
    } catch (e) {
      graderCrashed = true;
      grade = { pass: false, detail: [`grader crashed: ${(e as Error).message}`] };
    }
    const notes: string[] = [];
    if (!m.hasResult) notes.push('no result event: the run ended without one (killed, crashed or timed out)');
    if (m.budgetExceeded) notes.push(`stopped by the per-run budget (${m.subtype})`);
    if (spawned.timedOut) notes.push(`killed after ${o.timeoutS}s`);
    if (spawned.exitCode !== 0 && spawned.exitCode !== null) notes.push(`claude exited ${spawned.exitCode}`);
    if (m.hasResult && m.isError && !m.budgetExceeded) notes.push(`result was an error (${m.subtype})`);
    const pass = grade.pass && notes.length === 0;
    const result: RunResult = {
      schema: 1,
      id: p.id,
      task: p.task.id,
      kind: p.task.kind,
      arm: p.arm,
      rep: p.rep,
      model: o.model,
      claudeVersion: ctx.version,
      gitSha: ctx.sha,
      startedAt,
      durationMs: spawned.durationMs,
      exitCode: spawned.exitCode,
      subtype: m.subtype,
      isError: m.isError,
      budgetExceeded: m.budgetExceeded,
      resultText: m.resultText,
      numTurns: m.numTurns,
      costUsd: m.costUsd,
      usage: m.usage,
      toolCalls: m.toolCalls,
      callsBeforeTarget: m.callsBeforeTarget,
      hookInjections: m.hookInjections,
      hookChars: m.hookChars,
      split: m.split,
      pass,
      // Denials do not fail a run (the agent may find another way), but a reader needs to see them.
      grade: { pass, detail: [...notes.map((n) => 'run: ' + n), ...m.permissionDenials.map((d) => 'run: permission denied: ' + d), ...grade.detail] },
    };
    return { result, leaks, graderCrashed };
  } finally {
    if (o.keep) ctx.log(`  kept ${workdir}`);
    else {
      fs.rmSync(root, { recursive: true, force: true });
      liveRoots.delete(root);
    }
  }
}

// ---- the command -----------------------------------------------------------------------------

export interface Deps {
  grade?: GradeFn;
  log?: (s: string) => void;
  err?: (s: string) => void;
}

function readMeta(out: string): RunMeta | null {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(out, 'meta.json'), 'utf8')) as RunMeta;
    return v.schema === 1 ? v : null;
  } catch {
    return null;
  }
}

function readRun(file: string): RunResult | null {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8')) as RunResult;
    return v.schema === 1 && typeof v.id === 'string' ? v : null;
  } catch {
    return null;
  }
}

export async function main(argv: string[], deps: Deps = {}): Promise<number> {
  const log = deps.log ?? ((s: string) => console.log(s));
  const err = deps.err ?? ((s: string) => console.error(s));
  try {
    const o = parseArgs(argv);
    if (o.help) {
      log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]!.split('\n').filter((l) => l.startsWith(' *') || l.startsWith('/**')).map((l) => l.replace(/^ ?\* ?/, '').replace(/^\/\*\*$/, '')).join('\n').trim());
      return 0;
    }
    if (!o.go && !o.dryRun) {
      err('bench: refusing to run. This spends real money on the Claude API: pass --go to run, or --dry-run to see the plan and its worst-case cost.');
      return 2;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const out = o.out ?? path.join(BENCH_DIR, 'results', stamp);
    const previous = o.out && fs.existsSync(path.join(out, 'meta.json')) ? readMeta(out) : null;
    const seed = o.seed ?? (typeof previous?.args.seed === 'number' ? previous.args.seed : Date.now() % 2147483647);
    const tasks = loadTasks(o.tasksDir, o.tasks);
    const plan = buildPlan(tasks, o.arms, o.reps, seed);
    if (plan.length === 0) throw new CannotRun('the selection leaves no runs (check --tasks and --arms against each task\'s arms)');

    const perArm = (arm: Arm): number => plan.filter((p) => p.arm === arm).length;
    const worst = worstCaseUsd(plan.length, o.perRunUsd);
    const lines = [
      `bench plan: ${plan.length} runs (${o.arms.map((a) => `${a}: ${perArm(a)}`).join(', ')}) of ${tasks.length} tasks, ${o.reps} rep${o.reps === 1 ? '' : 's'}${o.pilot ? ' (pilot)' : ''}`,
      `  tasks: ${tasks.map((t) => t.id).join(', ')}`,
      `  model ${o.model}, concurrency ${o.concurrency}, seed ${seed}`,
      `  per run: up to $${o.perRunUsd.toFixed(2)} (reserved as $${reserveUsd(o.perRunUsd).toFixed(2)}, allowing one turn past it); worst case for the plan: $${worst.toFixed(2)}; total budget: $${o.budgetUsd.toFixed(2)}`,
      `  results: ${out}${previous ? ' (resuming)' : ''}`,
    ];
    if (worst > o.budgetUsd) lines.push(`  note: the worst case is over the budget; the runner would stop after about ${Math.floor(o.budgetUsd / reserveUsd(o.perRunUsd))} runs that spend their full reservation`);
    if (o.dryRun) {
      for (const l of lines) log(l);
      log('  dry run: nothing was written and nothing was spent.');
      if (plan.some((p) => p.arm !== 'A') && !fs.existsSync(path.join(o.repo, 'dist', 'good2go.mjs'))) {
        err(`bench: note: ${path.join(o.repo, 'dist', 'good2go.mjs')} is missing, so arms B and C could not run: npm run build`);
        return 2;
      }
      return 0;
    }

    // Everything that can be checked before the first dollar is spent.
    if (plan.some((p) => p.arm !== 'A')) requireDist(o.repo);
    if (!fs.existsSync(path.join(o.fixture, 'base'))) throw new CannotRun(`fixture base is missing: ${path.join(o.fixture, 'base')}`);
    const version = await claudeVersion(o.claude);
    if (version === null) throw new CannotRun(`cannot run \`${o.claude} --version\`: is Claude Code installed? (--claude <path> names another binary)`);
    if (previous && previous.model !== o.model) throw new CannotRun(`${out} was started with model ${previous.model}, not ${o.model}: resuming would mix models`);
    if (previous && previous.claudeVersion !== version) err(`bench: warning: ${out} was started with Claude Code ${previous.claudeVersion}, this is ${version}`);

    const grade: GradeFn = deps.grade ?? ((await import('./lib/graders.mts')) as { grade: GradeFn }).grade;
    const ctx: Ctx = { o, out, version, sha: gitSha(o.repo), grade, log };
    for (const l of lines) log(l);

    // Resume: runs whose result file exists are skipped, and their cost counts.
    const done = new Map<string, RunResult>();
    for (const p of plan) {
      const r = readRun(path.join(out, 'runs', `${p.id}.json`));
      if (r) done.set(p.id, r);
    }
    const todo = plan.filter((p) => !done.has(p.id));
    // Every result in the folder counts, not only this plan's (a resume may narrow --tasks or --arms).
    const existing = fs.existsSync(path.join(out, 'runs'))
      ? fs.readdirSync(path.join(out, 'runs')).filter((f) => f.endsWith('.json')).map((f) => readRun(path.join(out, 'runs', f))).filter((r): r is RunResult => r !== null)
      : [];
    const reported = round(existing.reduce((s, r) => s + r.costUsd, 0));
    const budget = new Budget(o.budgetUsd, o.perRunUsd, round(existing.reduce((s, r) => s + charged(r, o.perRunUsd), 0)));
    const meta: RunMeta = {
      schema: 1,
      startedAt: previous?.startedAt ?? new Date().toISOString(),
      model: o.model,
      claudeVersion: version,
      gitSha: ctx.sha,
      args: { arms: o.arms, tasks: tasks.map((t) => t.id), reps: o.reps, pilot: o.pilot, concurrency: o.concurrency, budgetUsd: o.budgetUsd, perRunUsd: o.perRunUsd, seed, claude: o.claude },
      plannedRuns: plan.length,
      completedRuns: done.size,
      spentUsd: reported,
      stoppedEarly: false,
    };
    const saveMeta = (): void => writeJson(path.join(out, 'meta.json'), meta);
    saveMeta();
    if (done.size) log(`  resuming: ${done.size} of ${plan.length} runs already have results ($${budget.spentUsd.toFixed(4)} spent)`);

    let stop: string | null = null;
    let fatal: Error | null = null;
    let broke = false;
    let ranHere = 0;
    const queue = [...todo];
    // A worker that cannot start because of runs still in flight waits for one to finish and asks
    // again; only with nothing in flight does the budget end the plan.
    let wake: Array<() => void> = [];
    const finished = (): void => {
      const w = wake;
      wake = [];
      for (const f of w) f();
    };
    const worker = async (): Promise<void> => {
      while (stop === null && fatal === null) {
        if (queue.length === 0) return;
        if (!budget.canStart()) {
          if (budget.inFlight > 0) {
            await new Promise<void>((r) => wake.push(r));
            continue;
          }
          stop = budget.reason();
          return;
        }
        const p = queue.shift()!;
        budget.start();
        let charge = o.perRunUsd;
        try {
          const { result, leaks, graderCrashed } = await executeRun(p, ctx);
          charge = charged(result, o.perRunUsd);
          writeJson(path.join(out, 'runs', `${p.id}.json`), result);
          meta.completedRuns++;
          ranHere++;
          meta.spentUsd = round(meta.spentUsd + result.costUsd);
          if (leaks.length) {
            broke = true;
            // Every further run would be contaminated too: spend nothing more on them.
            stop ??= `isolation leak in ${p.id}: ${leaks.join('; ')}`;
            err(`bench: ${p.id}: isolation leak, ${leaks.join('; ')}`);
          }
          if (graderCrashed) broke = true;
          const denied = result.grade.detail.filter((d) => d.startsWith('run: permission denied: ')).length;
          log(`  ${result.pass ? 'pass' : 'FAIL'} ${p.id}  $${result.costUsd.toFixed(4)}  ${result.numTurns} turns  ${result.toolCalls.total} calls${denied ? `  ${denied} denied` : ''}  (${meta.completedRuns}/${plan.length})`);
        } catch (e) {
          fatal = e instanceof Error ? e : new Error(String(e));
          stop ??= `harness error in ${p.id}: ${fatal.message.split('\n')[0]}`;
        } finally {
          budget.finish(charge);
          saveMeta();
          finished();
        }
      }
      finished();
    };
    await Promise.all(Array.from({ length: Math.min(o.concurrency, Math.max(1, queue.length)) }, worker));
    if (stop === null && queue.length > 0) stop = budget.reason();
    if (stop !== null) {
      meta.stoppedEarly = true;
      meta.stopReason = stop;
    }
    saveMeta();
    // A setup problem before anything ran here is "could not run" (2); after runs spent money it
    // is a broken harness (1), with meta.json saying where it stopped.
    if (fatal) throw ranHere === 0 ? fatal : new Error((fatal as Error).stack ?? (fatal as Error).message);
    log(`bench: ${meta.completedRuns}/${plan.length} runs, $${meta.spentUsd.toFixed(4)} spent${meta.stoppedEarly ? `; stopped early (${meta.stopReason})` : ''}`);
    log(`bench: results in ${out}`);
    return meta.stoppedEarly || broke ? 1 : 0;
  } catch (e) {
    if (e instanceof UsageError || e instanceof CannotRun) {
      err('bench: ' + e.message);
      return 2;
    }
    err('bench: ' + (e instanceof Error ? (e.stack ?? e.message) : String(e)));
    return 1;
  }
}

const isMain = (() => {
  try {
    return fs.realpathSync(process.argv[1] ?? '') === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) process.exitCode = await main(process.argv.slice(2));
