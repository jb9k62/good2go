// The benchmark report's shape, and its Markdown rendering. `report.mts` builds a `Report` from
// the run files; `--json` writes it as is, and this module turns it into the Markdown that the
// spec's Report section describes. Pure: strings in, strings out.

import type { Arm, TaskKind } from './types.mts';
import { fmt, fmtPct, fmtSigned } from './stats.mts';

export type MetricKey =
  | 'costUsd'
  | 'numTurns'
  | 'toolCalls'
  | 'callsBeforeTarget'
  | 'input'
  | 'output'
  | 'cacheRead'
  | 'cacheCreation'
  | 'durationMs'
  | 'hookInjections'
  | 'hookChars';

export interface MetricDef {
  key: MetricKey;
  label: string;
  /** Decimal places for medians and deltas. */
  decimals: number;
  /** Multiplier from the stored value to the displayed one (durations are shown in seconds). */
  scale: number;
  unit: string;
}

export const METRICS: MetricDef[] = [
  { key: 'costUsd', label: 'Cost', decimals: 3, scale: 1, unit: 'USD' },
  { key: 'numTurns', label: 'Turns', decimals: 1, scale: 1, unit: '' },
  { key: 'toolCalls', label: 'Tool calls', decimals: 1, scale: 1, unit: '' },
  { key: 'callsBeforeTarget', label: 'Calls before target', decimals: 1, scale: 1, unit: '' },
  { key: 'input', label: 'Input tokens', decimals: 0, scale: 1, unit: '' },
  { key: 'output', label: 'Output tokens', decimals: 0, scale: 1, unit: '' },
  { key: 'cacheRead', label: 'Cache-read tokens', decimals: 0, scale: 1, unit: '' },
  { key: 'cacheCreation', label: 'Cache-creation tokens', decimals: 0, scale: 1, unit: '' },
  { key: 'durationMs', label: 'Duration', decimals: 1, scale: 0.001, unit: 's' },
  { key: 'hookInjections', label: 'Hook injections', decimals: 1, scale: 1, unit: '' },
  { key: 'hookChars', label: 'Hook characters', decimals: 0, scale: 1, unit: '' },
];

export type MetricMap<T> = Record<MetricKey, T>;

/** Median, range and how many passing runs had a value for this metric. */
export interface MetricSummary {
  median: number | null;
  min: number | null;
  max: number | null;
  n: number;
}

export interface Delta {
  abs: number | null;
  pct: number | null;
}

/** A kind-level delta: the median of the per-task deltas, with how many tasks contributed. */
export interface KindDelta extends Delta {
  n: number;
}

export interface ArmSummary {
  arm: Arm;
  /** Run files for this task and arm. */
  runs: number;
  passing: number;
  /** Runs the per-run budget stopped (always failures). */
  budgetStopped: number;
  /** passing / runs; null when there are no runs. */
  passRate: number | null;
  /** costUsd summed over every run, failures included: what the arm really spent on the task. */
  spentUsd: number;
  /** False when the arm was expected for this task but has no run files at all. */
  expected: boolean;
  metrics: MetricMap<MetricSummary>;
}

/** The metrics the upkeep comparison covers. */
export type UpkeepMetric = 'costUsd' | 'turns' | 'toolCalls';
export const UPKEEP_METRICS: Array<{ key: UpkeepMetric; label: string; decimals: number }> = [
  { key: 'costUsd', label: 'Cost (USD, estimated split)', decimals: 3 },
  { key: 'turns', label: 'Turns (assistant messages)', decimals: 1 },
  { key: 'toolCalls', label: 'Tool calls', decimals: 1 },
];

/** Medians over an arm's passing runs: the totals, the same without memory upkeep, and the upkeep itself. */
export interface UpkeepArm {
  arm: Arm;
  /** Passing runs that fed these medians. */
  n: number;
  /** Passing runs with no `split` (older results: run report.mts --reanalyse); they are left out. */
  missing: number;
  total: Record<UpkeepMetric, number | null>;
  withoutUpkeep: Record<UpkeepMetric, number | null>;
  upkeep: Record<UpkeepMetric, number | null>;
}

/** B or C against A's total: once with the arm's total, once without its upkeep. */
export interface UpkeepDelta {
  total: Record<UpkeepMetric, Delta>;
  withoutUpkeep: Record<UpkeepMetric, Delta>;
}

export interface KindUpkeepDelta {
  /** Tasks that contributed. */
  n: number;
  total: Record<UpkeepMetric, Delta>;
  withoutUpkeep: Record<UpkeepMetric, Delta>;
}

export interface TaskSummary {
  task: string;
  kind: TaskKind;
  title: string;
  arms: ArmSummary[];
  /** B and C against A, per metric; null when that arm is not in the results. */
  deltas: { B: MetricMap<Delta> | null; C: MetricMap<Delta> | null };
  /** Upkeep split per arm; empty when no run has one. */
  upkeep: UpkeepArm[];
  upkeepDeltas: { B: UpkeepDelta | null; C: UpkeepDelta | null };
}

export interface KindSummary {
  kind: TaskKind;
  /** Display label: control rows are overhead, not a claim about the work. */
  label: string;
  tasks: string[];
  deltas: { B: MetricMap<KindDelta> | null; C: MetricMap<KindDelta> | null };
  /** Median of the per-task upkeep deltas; null when no task has them. */
  upkeepDeltas: { B: KindUpkeepDelta | null; C: KindUpkeepDelta | null };
  /** Pass counts pooled over the kind's tasks, per arm. */
  pooled: Record<Arm, { passing: number; total: number }>;
}

export interface ReportMeta {
  model: string;
  claudeVersion: string;
  gitSha: string;
  startedAt: string;
  /** From meta.json: the runner's running total. */
  spentUsd: number | null;
  /** Sum of the run files' costUsd, for checking the runner's total. */
  runSpendUsd: number;
  plannedRuns: number;
  completedRuns: number;
  runFiles: number;
  stoppedEarly: boolean;
  stopReason: string | null;
}

export interface Report {
  schema: 1;
  meta: ReportMeta;
  /** Why the results are incomplete or unsafe to read; empty when they are complete. */
  issues: string[];
  /** Shown at the top without making the set incomplete, e.g. runs the per-run budget stopped. */
  notes: string[];
  complete: boolean;
  tasks: TaskSummary[];
  kinds: KindSummary[];
  caveats: string[];
}

export const KIND_LABELS: Record<TaskKind, string> = {
  discovery: 'Discovery (memory should help)',
  control: 'Control (overhead: memory cannot help)',
  trap: 'Trap (a wrong lesson misleads)',
};

export const STANDING_CAVEATS: string[] = [
  'Small n: a few repetitions per arm. Medians are not significance tests; read the ranges.',
  'The lessons were written by the authors for these tasks. Discovery rows are an upper bound for memory that is relevant and correct; control and trap rows are the counterweight.',
  'The fixture is small and synthetic (40 to 70 files). Results do not transfer to large codebases.',
  'Medians and ranges use passing runs only. Pass rate sits beside every figure, and a failed or budget-stopped run is counted there.',
  'One model and one Claude Code version (footer above). Hook cost is in the totals; hookInjections and hookChars show its size.',
];

function cell(s: MetricSummary, def: MetricDef): string {
  if (s.median === null) return '–';
  const m = (v: number | null) => fmt(v === null ? null : v * def.scale, def.decimals);
  if (s.n <= 1 || s.min === null || s.max === null) return m(s.median);
  return `${m(s.median)} (${m(s.min)}–${m(s.max)})`;
}

function passCell(arm: ArmSummary): string {
  if (arm.runs === 0) return 'no runs';
  const pct = arm.passRate === null ? '–' : `${Math.round(arm.passRate * 100)}%`;
  return `${arm.passing}/${arm.runs} (${pct})`;
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function table(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map(escapeCell).join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

function deltaCell(d: Delta | null | undefined, def: MetricDef): string {
  if (!d) return '–';
  const abs = d.abs === null ? null : d.abs * def.scale;
  return `${fmtSigned(abs, def.decimals)} / ${fmtPct(d.pct)}`;
}

function renderArmsTable(task: TaskSummary): string {
  const headers = ['Arm', 'Pass', ...METRICS.map((m) => `${m.label}${m.unit ? ` (${m.unit})` : ''}`)];
  const rows = task.arms.map((arm) => {
    const values = METRICS.map((def) => (arm.passing === 0 ? '–' : cell(arm.metrics[def.key], def)));
    const label = arm.expected || arm.runs > 0 ? arm.arm : `${arm.arm} (not run)`;
    return [label, passCell(arm), ...values];
  });
  return table(headers, rows);
}

function renderTaskDeltas(task: TaskSummary): string {
  const passLine = task.arms.map((a) => `${a.arm} ${passCell(a)}`).join(', ');
  // The medians above leave failed runs out; their money was still spent.
  const spendLine = task.arms.filter((a) => a.runs > 0).map((a) => `${a.arm} $${a.spentUsd.toFixed(3)}`).join(', ');
  const parts: string[] = [`Pass rate: ${passLine}.`, `Spent over all runs, failures included: ${spendLine || 'nothing'}.`];
  const hasB = task.deltas.B !== null;
  const hasC = task.deltas.C !== null;
  if (!hasB && !hasC) return parts.join(' ');
  const headers = ['Metric', ...(hasB ? ['B − A (abs / %)'] : []), ...(hasC ? ['C − A (abs / %)'] : [])];
  const rows = METRICS.map((def) => [
    def.label,
    ...(hasB ? [deltaCell(task.deltas.B![def.key], def)] : []),
    ...(hasC ? [deltaCell(task.deltas.C![def.key], def)] : []),
  ]);
  parts.push('', table(headers, rows));
  return parts.join('\n');
}

export const UPKEEP_NOTE =
  'Memory upkeep is the work of recording and re-checking lessons (edits under edukai/, edukai:recheck, edukai:index, edukai:validate, good2go edukai ..., the edukai skill); ' +
  'memory use (reading and searching edukai/) stays in "excluding upkeep". **Upkeep is a real cost of edukai**: the memory section of AGENTS.md tells the agent to do it, so the total is what arm B costs, ' +
  'and "excluding upkeep" is an estimate of what it would cost if that upkeep were free, not a figure any user pays. ' +
  'A message or Bash command that mixes upkeep with task work (a source edit and `npm run edukai:recheck`) is split by its calls, each weighing the same, so the share is approximate in both directions. ' +
  'Turns are assistant messages (not the `num_turns` Claude Code reports, which counts about one per tool call) and, with tool calls, are counted from the transcript; **cost is an estimate**: the run\'s cost shared out by each turn\'s ' +
  'weighted-token share (input 1, output 5, cache read 0.05, cache creation 1.25 or 2, ratios of Sonnet 5.5 prices fitted to the pilot bills; the five-minute and one-hour cache split is used when the stream carries it), not a bill, and output tokens by content length. Hook output is not separated. Medians over passing runs.';

const num = (v: number | null, decimals: number): string => fmt(v, decimals);

function renderUpkeepDeltaLine(label: string, d: UpkeepDelta | null): string | null {
  if (!d) return null;
  const f = (m: Record<UpkeepMetric, Delta>) => UPKEEP_METRICS.map((u) => `${u.label.split(' (')[0]!.toLowerCase()} ${fmtSigned(m[u.key].abs, u.decimals)} / ${fmtPct(m[u.key].pct)}`).join('; ');
  return `- ${label} − A: total ${f(d.total)}. Excluding upkeep: ${f(d.withoutUpkeep)}.`;
}

function renderTaskUpkeep(task: TaskSummary): string {
  if (task.upkeep.length === 0) return '';
  // Turns keep their qualifier: these are assistant messages, not the `num_turns` in the table above.
  const short = (u: (typeof UPKEEP_METRICS)[number]) => (u.key === 'turns' ? 'Messages' : u.label.split(' (')[0]);
  const headers = ['Arm', 'Runs', ...UPKEEP_METRICS.flatMap((u) => [`${short(u)} total`, `${short(u)} excl. upkeep (est.)`, `${short(u)} upkeep`])];
  const rows = task.upkeep.map((a) => [
    a.arm + (a.missing > 0 ? ` (${a.missing} without a split)` : ''),
    String(a.n),
    ...UPKEEP_METRICS.flatMap((u) => [num(a.total[u.key], u.decimals), num(a.withoutUpkeep[u.key], u.decimals), num(a.upkeep[u.key], u.decimals)]),
  ]);
  const lines = [renderUpkeepDeltaLine('B', task.upkeepDeltas.B), renderUpkeepDeltaLine('C', task.upkeepDeltas.C)].filter((l): l is string => l !== null);
  return [
    '**Against A, with and without memory upkeep** (upkeep is a real cost of B; "excl. upkeep" is an estimate; see the note under the kind)',
    '',
    table(headers, rows),
    '',
    ...lines,
    '',
  ].join('\n');
}

function renderKindUpkeep(kind: KindSummary): string {
  const arms = (['B', 'C'] as const).filter((a) => kind.upkeepDeltas[a] !== null);
  if (arms.length === 0) return '';
  const headers = ['Metric', ...arms.flatMap((a) => [`${a} − A, total (abs / %)`, `${a} − A, excluding upkeep (abs / %)`])];
  const cellOf = (d: Delta, decimals: number) => `${fmtSigned(d.abs, decimals)} / ${fmtPct(d.pct)}`;
  const rows = UPKEEP_METRICS.map((u) => [u.label, ...arms.flatMap((a) => [cellOf(kind.upkeepDeltas[a]!.total[u.key], u.decimals), cellOf(kind.upkeepDeltas[a]!.withoutUpkeep[u.key], u.decimals)])]);
  const from = arms.map((a) => `${a} from ${kind.upkeepDeltas[a]!.n} of ${kind.tasks.length}`).join('; ');
  return ['**Memory upkeep: median of per-task deltas against A**', '', `Tasks contributing: ${from}. ${UPKEEP_NOTE}`, '', table(headers, rows), ''].join('\n');
}

function renderTask(task: TaskSummary): string {
  const out: string[] = [];
  out.push(`### ${task.task}`, '');
  out.push(`${task.title} *(${task.kind}${task.kind === 'control' ? ', overhead' : ''})*`, '');
  if (task.kind === 'trap') {
    const pass = task.arms.map((a) => `${a.arm} ${passCell(a)}`).join(', ');
    out.push(`**Pass rate first: ${pass}.** A wrong lesson shows here as a failure, not as a cheaper run.`, '');
  }
  const noPassing = task.arms.filter((a) => a.runs > 0 && a.passing === 0).map((a) => a.arm);
  if (noPassing.length > 0) {
    out.push(`No passing runs in ${noPassing.join(', ')}: medians are unavailable for ${noPassing.length > 1 ? 'those arms' : 'that arm'}.`, '');
  }
  const missing = task.arms.filter((a) => a.runs === 0 && a.expected).map((a) => a.arm);
  if (missing.length > 0) out.push(`No runs in ${missing.join(', ')}.`, '');
  out.push(renderArmsTable(task), '');
  out.push(renderTaskDeltas(task), '');
  const upkeep = renderTaskUpkeep(task);
  if (upkeep) out.push(upkeep);
  return out.join('\n');
}

function renderKind(kind: KindSummary, tasks: TaskSummary[]): string {
  const out: string[] = [];
  out.push(`## ${KIND_LABELS[kind.kind]}`, '');
  if (kind.tasks.length === 0) {
    out.push('No tasks of this kind in the results.', '');
    return out.join('\n');
  }
  const pooled = (['A', 'B', 'C'] as Arm[])
    .filter((arm) => kind.pooled[arm].total > 0)
    .map((arm) => `${arm} ${kind.pooled[arm].passing}/${kind.pooled[arm].total}`)
    .join(', ');
  out.push(`Tasks: ${kind.tasks.join(', ')}. Pooled pass rate: ${pooled || 'none'}.`, '');
  const hasB = kind.deltas.B !== null;
  const hasC = kind.deltas.C !== null;
  if (!hasB && !hasC) {
    out.push('No deltas: no task of this kind has passing runs in both arms being compared.', '');
  } else {
    // A median of per-task deltas can rest on one task; say how many fed it.
    const from = (['B', 'C'] as const)
      .filter((arm) => kind.deltas[arm] !== null)
      .map((arm) => `${arm} − A from ${kind.deltas[arm]!.costUsd.n} of ${kind.tasks.length} task${kind.tasks.length === 1 ? '' : 's'}`);
    out.push(`Deltas: ${from.join('; ')} (a task contributes only when both arms have a passing run).`, '');
    const headers = [
      'Metric',
      ...(hasB ? ['B − A, median of per-task deltas (abs / %)'] : []),
      ...(hasC ? ['C − A, median of per-task deltas (abs / %)'] : []),
    ];
    const rows = METRICS.map((def) => [
      def.label,
      ...(hasB ? [deltaCell(kind.deltas.B![def.key], def)] : []),
      ...(hasC ? [deltaCell(kind.deltas.C![def.key], def)] : []),
    ]);
    out.push(table(headers, rows), '');
  }
  const kindUpkeep = renderKindUpkeep(kind);
  if (kindUpkeep) out.push(kindUpkeep);
  if (kind.kind === 'control') {
    out.push('These rows are overhead: what edukai costs on tasks it cannot help with.', '');
  }
  out.push(...tasks.map(renderTask));
  return out.join('\n');
}

function renderFooter(report: Report): string {
  const m = report.meta;
  const spend = m.spentUsd === null ? 'not recorded' : `$${m.spentUsd.toFixed(3)}`;
  const runSpend = `$${m.runSpendUsd.toFixed(3)} summed over ${m.runFiles} run files`;
  const lines = [
    '## Footer',
    '',
    `- Model: ${m.model}`,
    `- Claude Code version: ${m.claudeVersion}`,
    `- Git SHA: ${m.gitSha}`,
    `- Date: ${m.startedAt}`,
    `- Total spend: ${spend} (${runSpend})`,
    `- Runs: ${m.completedRuns} completed of ${m.plannedRuns} planned`,
    '',
    '**Caveats**',
    '',
    ...report.caveats.map((c) => `- ${c}`),
  ];
  return lines.join('\n');
}

/** The whole report as Markdown. */
export function renderMarkdown(report: Report): string {
  const out: string[] = ['# Benchmark report: Claude Code with and without edukai', ''];
  if (report.issues.length > 0) {
    out.push(
      `> **${report.meta.stoppedEarly ? 'STOPPED EARLY' : 'RESULTS INCOMPLETE'}. These figures do not cover the full plan.**`,
      ...report.issues.map((i) => `> - ${i}`),
      '',
    );
  }
  if (report.notes.length > 0) {
    out.push('> **Note.**', ...report.notes.map((n) => `> - ${n}`), '');
  }
  out.push(
    `Model ${report.meta.model}, Claude Code ${report.meta.claudeVersion}, ${report.meta.completedRuns} of ${report.meta.plannedRuns} runs.`,
    '',
  );
  for (const kind of report.kinds) {
    out.push(renderKind(kind, report.tasks.filter((t) => t.kind === kind.kind)));
  }
  out.push(renderFooter(report), '');
  return out.join('\n');
}
