// The contract between the benchmark's runner, graders, report and tasks. Types only: erasable
// TypeScript, so importers use `import type`. Change this file only with the spec.

export type Arm = 'A' | 'B' | 'C';
export type TaskKind = 'discovery' | 'control' | 'trap';

/** How a run is judged. Graders see only the finished workdir and the agent's final text. */
export type Grader =
  | {
      kind: 'test';
      /** Directory under the task's folder whose files are copied into the workdir after the run (the agent never sees them). */
      hiddenDir?: string;
      /** argv, run in the workdir; exit 0 passes. */
      command: string[];
      /** The run fails unless stdout matches this (guards against a suite that passes by skipping everything). */
      stdoutMatches?: string;
    }
  | {
      kind: 'answer';
      /** Every regex (case-insensitive) must match the final result text. */
      all?: string[];
      /** No regex may match. */
      none?: string[];
    }
  | {
      kind: 'file';
      /** Path in the workdir. */
      path: string;
      contains?: string[];
      absent?: string[];
    }
  | { kind: 'all'; of: Grader[] };

export interface Task {
  id: string;
  kind: TaskKind;
  title: string;
  /** Identical across arms. Never mentions lessons, memory or edukai. */
  prompt: string;
  /** Arms this task runs in; default ['A', 'B']. */
  arms?: Arm[];
  /** Paths (relative to the fixture root) the agent must touch or read for the answer; drives `callsBeforeTarget`. */
  targetFiles: string[];
  grader: Grader;
  /** Lesson file names (under the memory overlay) this task leans on. Documentation only; empty for control tasks. */
  lessons: string[];
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface GradeResult {
  pass: boolean;
  /** One line per check, e.g. "test: exit 0" or "answer: /8\s*s/ matched". */
  detail: string[];
}

/** One class of work within a run (see `UpkeepSplit`). */
export interface SplitPart {
  /** Assistant messages (turns) of this class; fractional, a message is split by its calls. */
  turns: number;
  /** Tool calls of this class; a call counts one, shared over the parts of a mixed Bash command (`a && npm run edukai:recheck` is half task, half upkeep), so the classes sum to the run's tool calls. */
  toolCalls: number;
  /** The run's real output total (result event), shared out by content length of the class's blocks. */
  outputTokens: number;
  /** The run's `costUsd` shared out by the class's share of weighted tokens (input 1, output 5, cache read 0.05, cache creation 1.25 or 2): an estimate. */
  estCostUsd: number;
}

/**
 * Where a run's turns, calls and money went: `task` work, memory `use` (reads and searches of
 * `edukai/`, `edukai:brief|search`) and memory `upkeep` (edits under `edukai/`, `edukai:recheck|
 * index|validate`, `good2go edukai ...`, the `edukai` skill). Recomputable from the transcript.
 */
export interface UpkeepSplit {
  task: SplitPart;
  use: SplitPart;
  upkeep: SplitPart;
  /** Names the classification and weights, e.g. `upkeep-split-v2 (...)`; the report warns when a folder mixes methods; results with another method are not comparable. */
  method: string;
}

/** One run of one task in one arm: the unit the runner writes and the report reads. */
export interface RunResult {
  schema: 1;
  /** `<task>.<arm>.<rep>`, also the file name. */
  id: string;
  task: string;
  kind: TaskKind;
  arm: Arm;
  rep: number;
  model: string;
  claudeVersion: string;
  /** Short SHA of the repository the fixture came from, plus `-dirty` when the tree was not clean. */
  gitSha: string;
  startedAt: string;
  durationMs: number;
  /** The `claude` process's exit code; null when it was killed. */
  exitCode: number | null;
  /** Claude Code's result subtype (`success`, `error_max_budget_usd`, `error_max_turns`, ...); `no_result` when none arrived. */
  subtype: string;
  isError: boolean;
  /** True when the per-run budget stopped the run. A budget stop is never a pass. */
  budgetExceeded: boolean;
  resultText: string;
  numTurns: number;
  costUsd: number;
  usage: Usage;
  toolCalls: { total: number; byName: Record<string, number> };
  /** Tool calls made before the first one that read, edited or searched a path under `targetFiles`; null if never. */
  callsBeforeTarget: number | null;
  /** Tool results and hook outputs that carried an `edukai:` line (always 0 in arm A). */
  hookInjections: number;
  /** Characters of `edukai:` text put in front of the agent, an upper bound on the overhead in tokens*4. */
  hookChars: number;
  pass: boolean;
  grade: GradeResult;
  /** Added after the pilot; absent in older results (readable as they are, `report.mts --reanalyse` fills it from the transcript). */
  split?: UpkeepSplit;
}

/** `meta.json` beside the runs. */
export interface RunMeta {
  schema: 1;
  startedAt: string;
  model: string;
  claudeVersion: string;
  gitSha: string;
  args: Record<string, unknown>;
  plannedRuns: number;
  completedRuns: number;
  /** Sum of costUsd so far; the runner stops before this passes the total budget. */
  spentUsd: number;
  stoppedEarly: boolean;
  stopReason?: string;
}
