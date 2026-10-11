#!/usr/bin/env node
// The benchmark's report: reads a results folder (runs/*.json and meta.json) and prints Markdown
// or JSON. Medians and ranges use passing runs only; pass rate sits beside every figure.
//
//   node test/bench/report.mts <results-dir> [--json] [--out file] [--reanalyse]
//
// --reanalyse first recomputes each run's memory-upkeep split from transcripts/<id>.jsonl and
// writes it back into runs/<id>.json (for folders made before the split existed). It reads files
// only: no model call, no network. Nothing else in a run file changes.
//
// Exit codes: 0 the report covers every planned run; 1 the results are incomplete or stopped
// early (the report is still written, under a banner), or a run file is malformed (named, nothing
// written); 2 could not run (bad arguments, no meta.json).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitTranscript } from './lib/claude.mts';
import type { Arm, RunMeta, RunResult, TaskKind } from './lib/types.mts';
import {
  METRICS,
  STANDING_CAVEATS,
  type ArmSummary,
  type Delta,
  type KindDelta,
  type KindSummary,
  type MetricKey,
  type MetricMap,
  type MetricSummary,
  type Report,
  type KindUpkeepDelta,
  type TaskSummary,
  type UpkeepArm,
  type UpkeepDelta,
  type UpkeepMetric,
  UPKEEP_METRICS,
  renderMarkdown,
} from './lib/render.mts';
import { absDelta, groupBy, median, passRate, percentDelta, range } from './lib/stats.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARMS: Arm[] = ['A', 'B', 'C'];
const KINDS: TaskKind[] = ['discovery', 'control', 'trap'];

/** Which arms a kind runs in, per the spec's table. */
export function armsForKind(kind: TaskKind): Arm[] {
  return kind === 'discovery' ? ['A', 'B', 'C'] : ['A', 'B'];
}

function metricValue(r: RunResult, key: MetricKey): number | null {
  switch (key) {
    case 'costUsd':
      return r.costUsd;
    case 'numTurns':
      return r.numTurns;
    case 'toolCalls':
      return r.toolCalls.total;
    case 'callsBeforeTarget':
      return r.callsBeforeTarget;
    case 'input':
      return r.usage.input;
    case 'output':
      return r.usage.output;
    case 'cacheRead':
      return r.usage.cacheRead;
    case 'cacheCreation':
      return r.usage.cacheCreation;
    case 'durationMs':
      return r.durationMs;
    case 'hookInjections':
      return r.hookInjections;
    case 'hookChars':
      return r.hookChars;
  }
}

function summarise(values: (number | null)[]): MetricSummary {
  const r = range(values);
  return {
    median: median(values),
    min: r ? r.min : null,
    max: r ? r.max : null,
    n: values.filter((v) => v !== null).length,
  };
}

function metricMap<T>(f: (key: MetricKey) => T): MetricMap<T> {
  const out = {} as MetricMap<T>;
  for (const def of METRICS) out[def.key] = f(def.key);
  return out;
}

/** The arm's summary; medians are over its passing runs only. */
function armSummary(arm: Arm, runs: RunResult[], expected: boolean): ArmSummary {
  const passing = runs.filter((r) => r.pass);
  const rate = passRate(runs.map((r) => r.pass));
  return {
    arm,
    runs: runs.length,
    passing: rate.passing,
    budgetStopped: runs.filter((r) => r.budgetExceeded).length,
    passRate: rate.rate,
    spentUsd: runs.reduce((s, r) => s + r.costUsd, 0),
    expected,
    metrics: metricMap((key) => summarise(passing.map((r) => metricValue(r, key)))),
  };
}

/** Deltas need passing runs on both sides; otherwise there is no median to compare. */
function deltasAgainstA(a: ArmSummary | undefined, x: ArmSummary | undefined): MetricMap<Delta> | null {
  if (!a || !x || a.passing === 0 || x.passing === 0) return null;
  return metricMap((key) => {
    const from = a.metrics[key].median;
    const to = x.metrics[key].median;
    return { abs: absDelta(from, to), pct: percentDelta(from, to) };
  });
}

const UPKEEP_KEYS: UpkeepMetric[] = UPKEEP_METRICS.map((m) => m.key);
const upkeepRecord = <T,>(f: (k: UpkeepMetric) => T): Record<UpkeepMetric, T> => Object.fromEntries(UPKEEP_KEYS.map((k) => [k, f(k)])) as Record<UpkeepMetric, T>;

/**
 * One run's totals, upkeep and the same without upkeep, all from its split (so the three agree);
 * null when the run has none. Turns are assistant messages, which is not Claude Code's `num_turns`
 * (that counts about one per tool call), so the two are not mixed.
 */
function upkeepOf(r: RunResult): { total: Record<UpkeepMetric, number>; upkeep: Record<UpkeepMetric, number>; without: Record<UpkeepMetric, number> } | null {
  const s = r.split;
  if (!s) return null;
  const sum = (k: 'turns' | 'toolCalls' | 'estCostUsd'): number => s.task[k] + s.use[k] + s.upkeep[k];
  const total = { costUsd: sum('estCostUsd'), turns: sum('turns'), toolCalls: sum('toolCalls') };
  const upkeep = { costUsd: s.upkeep.estCostUsd, turns: s.upkeep.turns, toolCalls: s.upkeep.toolCalls };
  return { total, upkeep, without: upkeepRecord((k) => total[k] - upkeep[k]) };
}

function upkeepArm(arm: Arm, runs: RunResult[]): UpkeepArm | null {
  const passing = runs.filter((r) => r.pass);
  const rows = passing.map(upkeepOf).filter((x): x is NonNullable<ReturnType<typeof upkeepOf>> => x !== null);
  if (rows.length === 0) return null;
  return {
    arm,
    n: rows.length,
    missing: passing.length - rows.length,
    total: upkeepRecord((k) => median(rows.map((x) => x.total[k]))),
    withoutUpkeep: upkeepRecord((k) => median(rows.map((x) => x.without[k]))),
    upkeep: upkeepRecord((k) => median(rows.map((x) => x.upkeep[k]))),
  };
}

/** B or C against A's total (A has no upkeep). */
function upkeepDelta(a: UpkeepArm | undefined, x: UpkeepArm | undefined): UpkeepDelta | null {
  if (!a || !x) return null;
  const d = (k: UpkeepMetric, v: number | null): Delta => ({ abs: absDelta(a.total[k], v), pct: percentDelta(a.total[k], v) });
  return { total: upkeepRecord((k) => d(k, x.total[k])), withoutUpkeep: upkeepRecord((k) => d(k, x.withoutUpkeep[k])) };
}

/**
 * Builds the report from the run files and meta. Pure: the CLI reads the files, tests pass
 * arrays. `titles` maps task ids to their titles; a missing title falls back to the id.
 */
export function buildReport(
  runs: RunResult[],
  meta: RunMeta,
  titles: Record<string, string> = {},
): Report {
  const issues: string[] = [];
  // Facts a reader needs at the top that do not make the set incomplete: a run the per-run
  // budget stopped is a completed run, recorded as a failure.
  const notes: string[] = [];
  // Splits made by different methods, or some runs with none, cannot be compared with each other.
  const methods = new Set(runs.filter((r) => r.split).map((r) => r.split!.method.split(/\s/)[0]));
  const lackSplit = runs.filter((r) => !r.split).length;
  if (methods.size > 1 || (methods.size > 0 && lackSplit > 0)) {
    const why = [methods.size > 1 ? `the run files carry different split methods (${[...methods].join(', ')})` : '', methods.size > 0 && lackSplit > 0 ? `${lackSplit} of ${runs.length} have no split` : ''].filter(Boolean).join(' and ');
    notes.push(`Mixed upkeep splits: ${why}. Their upkeep numbers are not comparable: run report.mts --reanalyse on the folder.`);
  }
  const args = (meta.args ?? {}) as Record<string, unknown>;
  const argArms = Array.isArray(args.arms) ? new Set(args.arms.map(String)) : null;
  const argTasks = Array.isArray(args.tasks) ? args.tasks.map(String) : [];

  const byTask = groupBy(runs, (r) => r.task);
  const taskIds = [...new Set([...byTask.keys(), ...argTasks])].sort();

  const tasks: TaskSummary[] = [];
  for (const id of taskIds) {
    const taskRuns = byTask.get(id) ?? [];
    const kind: TaskKind = taskRuns[0]?.kind ?? kindFromTask(id);
    const expectedArms = armsForKind(kind).filter((arm) => argArms === null || argArms.has(arm));
    const observedArms = new Set(taskRuns.map((r) => r.arm));
    const arms = ARMS.filter((arm) => expectedArms.includes(arm) || observedArms.has(arm)).map((arm) =>
      armSummary(
        arm,
        taskRuns.filter((r) => r.arm === arm),
        expectedArms.includes(arm),
      ),
    );

    if (taskRuns.length === 0) {
      issues.push(`Task ${id} has no runs.`);
    }
    for (const arm of arms) {
      if (arm.expected && arm.runs === 0) issues.push(`Task ${id} has no runs in arm ${arm.arm}.`);
    }
    const budget = taskRuns.filter((r) => r.budgetExceeded).length;
    if (budget > 0) {
      notes.push(`Task ${id}: ${budget} run${budget === 1 ? '' : 's'} stopped by the per-run budget (counted as failures).`);
    }

    const a = arms.find((x) => x.arm === 'A');
    const upkeep = ARMS.map((arm) => upkeepArm(arm, taskRuns.filter((r) => r.arm === arm))).filter((x): x is UpkeepArm => x !== null);
    // Only worth showing when a memory arm has a split: otherwise it repeats the totals above.
    const hasSplit = taskRuns.some((r) => r.split !== undefined);
    const upkeepA = upkeep.find((x) => x.arm === 'A');
    const lacking = upkeep.filter((x) => x.missing > 0).map((x) => x.arm);
    if (lacking.length > 0) notes.push(`Task ${id}: passing runs in ${lacking.join(', ')} have no upkeep split and are left out of that comparison (run report.mts --reanalyse on the folder).`);
    tasks.push({
      task: id,
      kind,
      title: titles[id] ?? id,
      arms,
      deltas: {
        B: deltasAgainstA(a, arms.find((x) => x.arm === 'B')),
        C: deltasAgainstA(a, arms.find((x) => x.arm === 'C')),
      },
      upkeep: hasSplit ? upkeep : [],
      upkeepDeltas: {
        B: hasSplit ? upkeepDelta(upkeepA, upkeep.find((x) => x.arm === 'B')) : null,
        C: hasSplit ? upkeepDelta(upkeepA, upkeep.find((x) => x.arm === 'C')) : null,
      },
    });
  }

  const planned = meta.plannedRuns;
  const head: string[] = [];
  if (meta.stoppedEarly) {
    head.push(`Stopped early: ${meta.stopReason ?? 'no reason recorded'}.`);
  }
  if (runs.length < planned) {
    head.push(`${runs.length} of ${planned} planned runs have result files.`);
  }
  if (meta.completedRuns !== runs.length) {
    issues.push(`meta.json counts ${meta.completedRuns} completed runs; ${runs.length} result files were read.`);
  }
  issues.unshift(...head);

  const kinds: KindSummary[] = KINDS.map((kind) => {
    const kindTasks = tasks.filter((t) => t.kind === kind);
    const deltasFor = (arm: 'B' | 'C'): MetricMap<KindDelta> | null => {
      const contributing = kindTasks.map((t) => t.deltas[arm]).filter((d): d is MetricMap<Delta> => d !== null);
      if (contributing.length === 0) return null;
      return metricMap((key) => {
        const abs = contributing.map((d) => d[key].abs);
        const pct = contributing.map((d) => d[key].pct);
        return {
          abs: median(abs),
          pct: median(pct),
          n: abs.filter((v) => v !== null).length,
        };
      });
    };
    const upkeepFor = (arm: 'B' | 'C'): KindUpkeepDelta | null => {
      const contributing = kindTasks.map((t) => t.upkeepDeltas[arm]).filter((d): d is UpkeepDelta => d !== null);
      if (contributing.length === 0) return null;
      const med = (pick: (d: UpkeepDelta) => Record<UpkeepMetric, Delta>) =>
        upkeepRecord((k) => ({ abs: median(contributing.map((d) => pick(d)[k].abs)), pct: median(contributing.map((d) => pick(d)[k].pct)) }));
      return { n: contributing.length, total: med((d) => d.total), withoutUpkeep: med((d) => d.withoutUpkeep) };
    };
    const pooled = {} as KindSummary['pooled'];
    for (const arm of ARMS) {
      const armRuns = kindTasks.flatMap((t) => t.arms.filter((x) => x.arm === arm));
      pooled[arm] = {
        passing: armRuns.reduce((s, x) => s + x.passing, 0),
        total: armRuns.reduce((s, x) => s + x.runs, 0),
      };
    }
    return {
      kind,
      label: kind === 'control' ? 'overhead' : kind,
      tasks: kindTasks.map((t) => t.task),
      deltas: { B: deltasFor('B'), C: deltasFor('C') },
      upkeepDeltas: { B: upkeepFor('B'), C: upkeepFor('C') },
      pooled,
    };
  });

  return {
    schema: 1,
    meta: {
      model: meta.model,
      claudeVersion: meta.claudeVersion,
      gitSha: meta.gitSha,
      startedAt: meta.startedAt,
      spentUsd: typeof meta.spentUsd === 'number' ? meta.spentUsd : null,
      runSpendUsd: runs.reduce((s, r) => s + r.costUsd, 0),
      plannedRuns: planned,
      completedRuns: meta.completedRuns,
      runFiles: runs.length,
      stoppedEarly: meta.stoppedEarly,
      stopReason: meta.stopReason ?? null,
    },
    issues,
    notes,
    complete: issues.length === 0,
    tasks,
    kinds,
    caveats: STANDING_CAVEATS,
  };
}

/** Task kind from its id prefix (d, c, t), for a task with no runs at all. */
function kindFromTask(id: string): TaskKind {
  if (id.startsWith('c')) return 'control';
  if (id.startsWith('t')) return 'trap';
  return 'discovery';
}

/** Reads a results folder. Throws with the file named when a file is malformed. */
export function loadResults(dir: string): { runs: RunResult[]; meta: RunMeta; titles: Record<string, string> } {
  const metaPath = path.join(dir, 'meta.json');
  const meta = readJson(metaPath) as RunMeta;
  if (!meta || typeof meta !== 'object' || meta.schema !== 1) {
    throw new Error(`${metaPath}: not a schema 1 meta file`);
  }
  const runsDir = path.join(dir, 'runs');
  const files = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).filter((f) => f.endsWith('.json')).sort() : [];
  const runs: RunResult[] = [];
  for (const f of files) {
    const file = path.join(runsDir, f);
    const run = readJson(file) as RunResult;
    const problem = checkRun(run);
    if (problem) throw new Error(`${file}: ${problem}`);
    runs.push(run);
  }
  const titles: Record<string, string> = {};
  for (const id of new Set(runs.map((r) => r.task))) {
    const taskFile = path.join(HERE, 'tasks', id, 'task.json');
    try {
      const t = JSON.parse(fs.readFileSync(taskFile, 'utf8')) as { title?: unknown };
      if (typeof t.title === 'string') titles[id] = t.title;
    } catch {
      // No task file beside the benchmark: the id stands in for the title.
    }
  }
  return { runs, meta, titles };
}

function readJson(file: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw Object.assign(new Error(`${file}: cannot read (${(err as NodeJS.ErrnoException).code ?? (err as Error).message})`), {
      exitCode: 2,
    });
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${file}: not valid JSON (${(err as Error).message})`);
  }
}

/** Null when the run has the fields the report reads; otherwise the first problem. */
function checkRun(v: unknown): string | null {
  if (!v || typeof v !== 'object') return 'not a JSON object';
  const r = v as Partial<RunResult>;
  if (r.schema !== 1) return 'schema is not 1';
  if (typeof r.task !== 'string' || typeof r.arm !== 'string') return 'task or arm missing';
  if (!ARMS.includes(r.arm as Arm)) return `arm ${r.arm} is not A, B or C`;
  if (!KINDS.includes(r.kind as TaskKind)) return `kind ${String(r.kind)} is not discovery, control or trap`;
  if (typeof r.pass !== 'boolean') return 'pass is not a boolean';
  if (typeof r.costUsd !== 'number' || typeof r.numTurns !== 'number' || typeof r.durationMs !== 'number') {
    return 'costUsd, numTurns or durationMs is not a number';
  }
  if (!r.usage || typeof r.usage !== 'object' || typeof r.toolCalls !== 'object' || r.toolCalls === null) {
    return 'usage or toolCalls is missing';
  }
  if (typeof r.hookInjections !== 'number' || typeof r.hookChars !== 'number') return 'hook counts are missing';
  return null;
}

/**
 * Recompute every run's upkeep split from its stored transcript and write it into the run file.
 * Reads and writes files only. A run with no transcript is left as it was and named in `skipped`.
 */
export function reanalyse(dir: string): { updated: string[]; skipped: string[] } {
  const runsDir = path.join(dir, 'runs');
  const updated: string[] = [];
  const skipped: string[] = [];
  const files = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).filter((f) => f.endsWith('.json')).sort() : [];
  for (const f of files) {
    const file = path.join(runsDir, f);
    const run = readJson(file) as RunResult;
    const problem = checkRun(run);
    if (problem) throw new Error(`${file}: ${problem}`);
    const transcript = path.join(dir, 'transcripts', `${f.replace(/\.json$/, '')}.jsonl`);
    if (!fs.existsSync(transcript)) {
      skipped.push(run.id);
      continue;
    }
    run.split = splitTranscript(fs.readFileSync(transcript, 'utf8'));
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(run, null, 2) + '\n');
    fs.renameSync(tmp, file);
    updated.push(run.id);
  }
  return { updated, skipped };
}

interface Options {
  dir: string;
  json: boolean;
  out: string | null;
  reanalyse: boolean;
}

function parseArgs(argv: string[]): Options | string {
  const opts: Options = { dir: '', json: false, out: null, reanalyse: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--json') opts.json = true;
    else if (a === '--reanalyse') opts.reanalyse = true;
    else if (a === '--out') {
      const v = argv[++i];
      if (!v) return '--out needs a file';
      opts.out = v;
    } else if (a.startsWith('--')) return `unknown option ${a}`;
    else if (opts.dir) return 'only one results directory';
    else opts.dir = a;
  }
  if (!opts.dir) return 'usage: report.mts <results-dir> [--json] [--out file] [--reanalyse]';
  return opts;
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (typeof parsed === 'string') {
    process.stderr.write(`${parsed}\n`);
    return 2;
  }
  let loaded: ReturnType<typeof loadResults>;
  try {
    if (parsed.reanalyse) {
      const { updated, skipped } = reanalyse(parsed.dir);
      process.stderr.write(`report: re-analysed ${updated.length} run${updated.length === 1 ? '' : 's'} from their transcripts${skipped.length ? `; no transcript for ${skipped.join(', ')}` : ''}\n`);
    }
    loaded = loadResults(parsed.dir);
  } catch (err) {
    const e = err as Error & { exitCode?: number };
    process.stderr.write(`report: ${e.message}\n`);
    return e.exitCode ?? 1;
  }
  const report = buildReport(loaded.runs, loaded.meta, loaded.titles);
  const text = parsed.json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);
  if (parsed.out) {
    fs.writeFileSync(parsed.out, text);
    process.stderr.write(`report: wrote ${parsed.out}\n`);
  } else {
    process.stdout.write(text);
  }
  if (!report.complete) {
    process.stderr.write(`report: results incomplete: ${report.issues[0]}\n`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

export { main };
