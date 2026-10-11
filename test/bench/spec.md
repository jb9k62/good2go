# Benchmark: Claude Code with and without edukai

Status: draft for implementation. Types live in `lib/types.mts` and are part of this contract.

## Goal

Measure what edukai (the memory bundle, its `AGENTS.md` section and its hooks) changes for one
model in one harness version: tokens and dollars, loops (turns, tool calls), discovery effort, and
whether the work is still correct. It is not a claim that edukai makes the agent smarter; the
agent without it will usually finish the job. The question is how much less it spends getting there,
what edukai costs on tasks it cannot help with, and whether a wrong lesson misleads.

## Design

Same model (`claude-sonnet-5-5` by default, `--model` to change), same `claude` binary (version
recorded), same fixture snapshot, same prompts.

| Arm | Contents |
| --- | --- |
| **A** native | Fixture project. `CLAUDE.md` (`@AGENTS.md` import), a neutral `AGENTS.md`. No `edukai/`, no hooks, no skills. |
| **B** edukai | Arm A plus `edukai/`, the memory section in `AGENTS.md` (as `good2go init --edukai` writes it), and hooks installed by the real `good2go hooks --project --claude`. |
| **C** memory, no hooks | Arm B without the hooks. Discovery tasks only. Isolates what the hooks add over the files merely existing. |

Fixture: **not** `examples/demo` as it is. The demo is 45 lines of code whose comments already state
every fact, so nothing is expensive to discover and memory could not show. The benchmark ships
its own "Parcel tracker, expanded" fixture (below), same domain and spirit, big enough that
discovery costs something and with real, runnable tests.

### Isolation (verify, do not assume)

- Fresh temp dir per run: copy `fixture/base/`, overlay `fixture/memory/` for B and C, `git init`
  and commit. Never run in the repository.
- Package for arms B and C: never link the repository root into a workdir (it would expose
  `tasks/*/hidden`, `reference/` and this spec). Stage a copy once per results folder holding only
  `dist/`, `package.json`, `skills/` and a `node_modules/yaml` link, and link
  `<workdir>/node_modules/@jb9k62/good2go` to that. Also create `node_modules/.bin/good2go`. Exit 2
  with a clear message if `dist/good2go.mjs` is missing. The `edukai:*` npm scripts that
  `good2go init --edukai` writes are part of the memory overlay (a `package.json` that differs from
  the base only by those scripts), so arms B and C can run what `AGENTS.md` tells them to.
- Arm B hooks: run
  `node <repo>/dist/good2go.mjs hooks --project --claude` in the workdir, so the hooks are the
  ones a real user gets. Then run `good2go edukai recheck` for B so the cache the hooks read exists
  (a real project has it after its first re-check); keep `node_modules/` out of the commit via
  `.git/info/exclude`. Arm C has the package and scripts but skips the hooks step.
- Pass `--setting-sources project`, `--strict-mcp-config`, and set
  `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. Then **confirm from the `system`/`init` event** of a real
  run that no user skills, user MCP servers or user-level memory leaked in; if they did, find the
  flag or variable that stops it and document it in `docs/BENCHMARK.md`. Do not move
  `CLAUDE_CONFIG_DIR` unless authentication survives (check).
- Invocation, identical in every arm:
  `claude -p <prompt> --model <model> --output-format stream-json --verbose --no-session-persistence
  --max-budget-usd <per-run> --permission-mode acceptEdits
  --allowedTools Read Grep Glob Edit Write "Bash(node:*)" "Bash(npm:*)" "Bash(git:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(grep:*)" "Bash(find:*)" "Bash(head:*)" "Bash(wc:*)" "Bash(env:*)" "Bash(tail:*)" "Bash(sort:*)" "Bash(diff:*)" "Bash(echo:*)" "Bash(pwd:*)" "Bash(PARCEL_FAKE_CARRIERS=1:*)"
  --disallowedTools WebFetch WebSearch Agent Task --include-hook-events`
  (`--include-hook-events` is needed or only the SessionStart hook shows in the stream; confirmed by a real call.)
  Subagents are off so one run's cost is one conversation. `cwd` is the workdir.
- The `Stop` hook may make arm B spend extra turns on recording lessons. That is a real cost of
  edukai: keep it in the totals, and report it (`hookInjections`, `hookChars`) rather than hiding it.
- Run order is shuffled with a seeded PRNG (`--seed`, recorded) and interleaved across arms.
  Concurrency default 2.

### Skill and upkeep (added after the pilot)

- Arms B and C get the edukai skill the way a real project does: installed by the real installer
  pointed at the workdir as its home (`node <workdir>/node_modules/@jb9k62/good2go/dist/good2go.mjs skills --claude --dir <workdir>` (the staged package, which carries `dist/skills`),
  which writes `<workdir>/.claude/skills/edukai`; there is no project-scope flag). Install only
  the `edukai` skill if the command installs several, and keep `.claude/skills` out of the commit. A user-level skill is still a leak; the init-event leak check must allow the
  project-scoped `edukai` skill in B and C and keep flagging it in A. `AGENTS.md` is not changed:
  memory upkeep is unconditional, and the report separates it instead.
- Each run's tool calls and turns are classified. **Memory upkeep**: edits or writes under
  `edukai/`, `edukai:recheck|index|validate` and `good2go edukai ...` commands, and the `edukai`
  skill call. **Memory use**: reads and searches of `edukai/`, `edukai:brief|search`, and hook
  output. Everything else is **task work**. Per run, record turns, tool calls, output tokens and an
  estimated cost for each class, by method `upkeep-split-v2`:
  - A message is split by its calls, not given whole to one class: each call weighs one, spread
    equally over the parts of a mixed Bash command, so an `Edit` of `docs/runbook.md` plus
    `npm run edukai:recheck` in one message is half task and half upkeep, and
    `sed ... && npm run edukai:recheck` is one task part and one upkeep part. A Bash command is cut
    at `;`, `&&`, `||`, `|` and newlines after its heredoc bodies are stripped (the line that opens a
    heredoc stays); an output filter after a pipe (`| tail -8`) belongs to the part before it. A
    message with only text counts as task. Its turn (fractional), tool call and weighted tokens
    follow those shares.
  - Output tokens: per-message `output_tokens` in the stream is an early snapshot, so the run's
    real total (the `result` event) is shared by content length: characters of text, thinking and
    `tool_use` input JSON of each class's blocks.
  - Cost: the run's `costUsd` shared by weighted tokens, input 1, output 5, cache read 0.05, cache
    creation 1.25 (five-minute) or 2 (one-hour, from `usage.cache_creation`; 2 when the breakdown
    is absent). These are ratios of Sonnet 5.5's prices ($2, $10, $0.10, $2.50 and $4 per million)
    fitted to the pilot's bills (reconstructed cost within 1% of `costUsd` for all twelve), an
    estimate for any other model.
  The report shows task work plus use beside the totals, so B can be compared with A both with and
  without upkeep, and warns when the run files carry different `split.method` values or some lack
  `split`. The split can be recomputed from `transcripts/*.jsonl`, so old results can be
  re-analysed without new runs.

## Tasks

Prompts are identical across arms and never mention lessons, memory or edukai. Lessons carry
**facts the code makes expensive to find, never the solution**. A grader decides pass/fail;
efficiency numbers are compared only across passing runs, and pass rate is reported beside them.

Six tasks, three kinds. `A` implements them; ids below are fixed so the report can refer to them.

| id | kind | arms | Scenario |
| --- | --- | --- | --- |
| `d1-add-carrier` | discovery | A,B,C | "Add carrier `zephyr`." A correct change touches four places across modules: the carrier list, the webhook map, the tracking-number normaliser, and `snapshots/carriers.snap.json`, which must be regenerated by `npm run snapshot` (hand-editing fails a checksum test). Hidden test checks all four. Lesson: *adding a carrier touches four places; the snapshot is generated, never edited.* |
| `d2-week-boundary` | discovery | A,B,C | A bug report: a customer in `Pacific/Auckland` sees Monday-morning parcels in the previous week's report. The tempting fix (shifting `weekStartUtc`) breaks the weekly totals contract; the right fix applies the display zone after grouping, in a different module. Hidden test covers both. Lesson: *the week is UTC by decision (ADR); display zones apply after grouping.* |
| `d3-run-the-suite` | discovery | A,B,C | "Make the failing tests pass." `npm test` runs unit tests only and passes; the failing ones are integration tests that run via `npm run test:full` and **silently skip unless `PARCEL_FAKE_CARRIERS=1` is set**. Hidden grader runs the full suite with the variable set and needs its output to match `# pass [1-9]` and `# fail 0`. Lesson: *how to run the full suite and the silent skip.* |
| `c1-format-eta` | control | A,B | Add `formatEta(minutes)` to a utility module with a visible test file. No lesson applies. Measures edukai's overhead. |
| `c2-explain-one-file` | control | A,B | "What does `src/report/rollup.ts` do?" Answer match. No lesson applies. |
| `t1-stale-timeout` | trap | A,B | "What is the carrier poll timeout? Write it in `docs/runbook.md`." Code says 8 s. A lesson in arm B says 10 s and its re-check fails (`check: contains "TIMEOUT_MS = 10_000"`), so the hooks mark it `failed`. Grader: `docs/runbook.md` contains `8` seconds and not `10`. Arm B trusting the lesson fails the task. Arm A is the baseline. |

Stated honestly in the report: we wrote the lessons, so the discovery tasks show an upper bound for
memory that is relevant and correct; control and trap tasks are the counterweight.

### Fixture requirements (`fixture/base/`)

- 40 to 70 small files in erasable TypeScript that Node 24 runs directly (no build step), under
  `src/{poller,carriers,report,notifier,api,util}/`, plus `config/`, `docs/`, `snapshots/`.
- Real tests with `node --test`: `npm test` (unit), `npm run test:full` (adds integration;
  skips silently without `PARCEL_FAKE_CARRIERS=1`), `npm run snapshot`.
- The initial state: `d1`..`d3` and `t1` start red or unfinished exactly as described; every
  other test passes. Visible tests must not reveal the hidden ones' assertions.
- No comment or doc in `fixture/base/` may state the non-obvious facts the lessons hold. If the
  fixture explained itself, memory would have nothing to add.
- Deterministic: no network, no clock reliance except a fixed `now` where needed.
- `AGENTS.md` and `CLAUDE.md` identical in A and B apart from the memory section.

### Memory overlay (`fixture/memory/`)

- A real, valid bundle at `edukai/` built with the project's own tools (`node dist/good2go.mjs edukai new …`,
  then `index`), passing `good2go validate --strict`. Seven lessons in the shared overlay: those that
  serve `d1`, `d2` and `d3`, plus plausible, correct but irrelevant ones, so the brief is realistic
  and relevance has to be found. None fails its re-check or is stale.
- **Task-specific memory.** The trap lesson (the ten-second timeout, which fails its re-check) is
  not in the shared overlay: it lives under `tasks/t1-stale-timeout/memory-extra/edukai/`, together
  with a replacement `codebase-parcel-tracker/overview.md` that lists it. Arms B and C overlay a
  task's `memory-extra/` after the shared overlay, so the bundle has 8 lessons (exactly one failing)
  for `t1` and 7 (none failing) for every other task, and the trap costs upkeep only where it can
  matter. The bundle validates with `--strict` in both variants, and no lesson refers to one that is
  absent.
- `stale_after` dates at 2028 or later, so the bundle's states do not drift with the wall clock.
  Only the trap lesson fails its re-check, deterministically, through its `check:` entry.
- Sources cite real fixture files with correct digests, so the `cites` hook fires on reads.
- The overlay adds `edukai/`, the `AGENTS.md` memory section (replacing the neutral `AGENTS.md`),
  and the `edukai:*` scripts in `package.json`, and nothing else. Hooks are installed by the runner, not committed.

## Runner (`run.mts`, `lib/`)

```
node test/bench/run.mts --go [--pilot] [--reps 3] [--arms A,B,C] [--tasks id,id]
  [--model claude-sonnet-5-5] [--concurrency 2] [--budget-usd 10] [--per-run-usd 0.50]
  [--seed N] [--out test/bench/results/<stamp>] [--claude <path>] [--dry-run]
```

- Without `--go` or `--dry-run` it refuses (exit 2) and says it spends money. `--dry-run` prints
  the plan: runs, arms, the per-run and worst-case total in dollars, and writes nothing.
- `--pilot` = one rep of every task in arms A and B (12 runs).
- Total budget: before starting a run, stop if `spentUsd + perRun > budget`. Write `meta.json`
  with `stoppedEarly` and `stopReason`; exit 1. Update `meta.json` after every run (a killed
  runner leaves usable results). `--out` pointing at an existing results folder **resumes**: runs
  whose result file exists are skipped.
- Per run: `runs/<id>.json` (a `RunResult`), `transcripts/<id>.jsonl` (raw stream). Metrics come
  only from the stream: usage and cost from the final `result` event; tool calls from `assistant`
  `tool_use` blocks; `callsBeforeTarget` from the tool calls' inputs (Read file_path, Edit/Write,
  Grep/Glob path or pattern touching a target, Bash command text naming one); `hookInjections` and
  `hookChars` from `edukai:` lines in tool results and hook events.
- A run killed by the per-run budget, a non-zero exit, or no `result` event is recorded with
  `pass: false` and its real cost; never dropped.
- Library split: `lib/arms.mts` (workdir, overlay, hooks), `lib/claude.mts` (spawn, parse),
  `lib/budget.mts`, plus the graders from `lib/graders.mts` (owned by the report agent).
- Exit codes follow the repository's contract: 0 all planned runs completed, 1 stopped early or a
  run broke the harness, 2 could not run (refused, missing dist, missing `claude`).
- **No real model call in the unit tests.** `stub/claude-stub.mjs` is a fake `claude` (`--claude`)
  that emits a canned, realistic stream-json transcript per scenario, selectable by env var, and can
  edit files in the workdir so graders have something to grade.

## Graders (`lib/graders.mts`)

`grade(task, workdir, resultText, taskDir): Promise<GradeResult>` implements the `Grader` union.
Hidden files are copied in only after the agent has finished. Commands run with a timeout (120 s)
and no network need. A check that cannot run is a failure with a reason in `detail`, never a pass.

## Report (`report.mts`, `lib/stats.mts`, `lib/render.mts`)

`node test/bench/report.mts <results-dir> [--json] [--out file]` reads `runs/*.json` and `meta.json`.

- Per task and arm: n, pass rate, and the median (with min to max) of `costUsd`, `numTurns`,
  `toolCalls.total`, `callsBeforeTarget`, `usage.*`, `durationMs`, over **passing** runs.
- Deltas, B against A (and C against A): absolute and percent, per task, then per kind
  (discovery, control, trap) as the median of the per-task deltas, never one blended number.
- Control tasks are labelled overhead. The trap row shows pass rate first.
- A footer with: model, Claude Code version, git SHA, date, total spend, runs planned and
  completed, and the standing caveats (small n, authored lessons, small fixture, medians not
  significance). Incomplete or budget-stopped results say so at the top.
- `--json` writes the same numbers machine-readable. Exit codes as above.

## Documentation and housekeeping

- `docs/BENCHMARK.md`: what it measures, how to run (`npm run build` first, `npm run bench --
  --dry-run`, then `--pilot --go`), cost expectations, how to read the report, the isolation
  findings, limits. British spelling.
- `CHANGELOG.md`: one line under `## Unreleased`.
- Unit tests at `test/bench-*.test.mts` (the repository's `node --test test/*.test.mts` glob does
  not reach subfolders). `npm run typecheck` already covers `test/bench/*.mts` and
  `test/bench/lib/*.mts`. The benchmark is **not** part of `npm run check`.
- `package.json` scripts `bench` and `bench:report` and the `test/bench/results/` ignore are already added.
- Conventions: erasable TypeScript only, `.mts` import extensions, no dependencies beyond `node:`
  built-ins, British spelling, tools make no network requests of their own.

## Ownership (parallel work; do not edit another owner's files)

| Owner | Files |
| --- | --- |
| Fixture and tasks | `fixture/**`, `tasks/**`, `test/bench-fixture.test.mts` |
| Runner | `run.mts`, `lib/arms.mts`, `lib/claude.mts`, `lib/budget.mts`, `stub/**`, `test/bench-run.test.mts` |
| Graders and report | `report.mts`, `lib/graders.mts`, `lib/stats.mts`, `lib/render.mts`, `docs/BENCHMARK.md`, `CHANGELOG.md` line, `test/bench-report.test.mts` |

`lib/types.mts` and this spec belong to the coordinator; ask for a change rather than making one.
Task files live at `tasks/<id>/task.json` (a `Task`) with an optional `tasks/<id>/hidden/`.

## Spend rules for implementers

Implementation and unit tests use the stub only. The runner owner may make **at most three real
calls**, each `claude-haiku-5-5` with `--max-budget-usd 0.05` and a trivial prompt, solely to
confirm the stream-json event shapes and the isolation checks above. No pilot or full run: the
coordinator runs those after review.
