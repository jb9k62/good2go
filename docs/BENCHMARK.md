# Benchmark: Claude Code with and without edukai

The benchmark measures what edukai (the memory bundle, its `AGENTS.md` section and its hooks)
changes for one model in one Claude Code version: tokens and dollars, loops (turns and tool
calls), discovery effort, and whether the work is still correct.

It does not claim that edukai makes the agent smarter. The agent without edukai will usually
finish the job too. The questions are how much less it spends getting there, what edukai costs on
tasks it cannot help with, and whether a wrong lesson misleads it.

The benchmark is not part of `npm run check`. It spends money on real model calls, so it runs
only when asked.

## What it compares

| Arm | Contents |
| --- | --- |
| **A** native | The fixture project with a neutral `AGENTS.md`. No `edukai/`, no hooks, no skills. |
| **B** edukai | Arm A plus `edukai/`, the memory section in `AGENTS.md`, the hooks installed by the real `good2go hooks --project --claude`, and the `edukai` skill. |
| **C** memory, no hooks | Arm B without the hooks (it still has the skill). Discovery tasks only. It isolates what the hooks add over the files merely existing. |

The fixture is "Parcel tracker, expanded": the same domain as `examples/demo`, but big enough that
discovery costs something, with real tests that run under `node --test`. The demo itself is too
small to show anything, because its comments already state every fact.

### Tasks

Six tasks in three kinds. The prompts are identical across arms and never mention lessons, memory
or edukai.

| id | kind | arms | What it checks |
| --- | --- | --- | --- |
| `d1-add-carrier` | discovery | A, B, C | Adding a carrier touches four places; the snapshot is generated, never edited. |
| `d2-week-boundary` | discovery | A, B, C | A display-zone bug, where the tempting fix breaks a totals contract. |
| `d3-run-the-suite` | discovery | A, B, C | Running the integration suite, which skips silently without an environment variable. |
| `c1-format-eta` | control | A, B | Adding a small utility with a visible test. No lesson applies. |
| `c2-explain-one-file` | control | A, B | Explaining one file. No lesson applies. |
| `t1-stale-timeout` | trap | A, B | A runbook value. The code says 8 s; a lesson in arm B says 10 s and its re-check fails, so the hooks mark it `failed`. That lesson exists only for this task (see "Task-specific memory"). |

Each task has a grader that decides pass or fail. Efficiency figures are compared only across
passing runs, and the pass rate is shown beside them.

Discovery tasks show an upper bound for memory that is relevant and correct, because the authors
wrote the lessons. Control and trap tasks are the counterweight: they measure what edukai costs
when it cannot help, and whether a wrong lesson is trusted.

### Task-specific memory

The shared memory overlay (`fixture/memory/edukai/`) has seven lessons, and none fails its re-check
or is stale. The trap lesson (the ten-second timeout, whose check fails) is not in it: it lives in
`tasks/t1-stale-timeout/memory-extra/edukai/` with a replacement overview that lists it, and arms
B and C overlay a task's `memory-extra/` after the shared overlay. So the session brief counts 8
lessons with 1 needing an agent for `t1-stale-timeout`, and 7 with none for every other task.
Without this, B and C would spend upkeep fixing a lesson that is irrelevant to `d1`..`d3` and the
controls, which would bias the comparison against edukai. The bundle validates with `--strict` in
both variants.

## Running it

The runner needs `dist/` to be built, because the hooks run from the compiled package.

```bash
npm run build                                   # compile the tools to dist/
npm run bench -- --dry-run                      # print the plan and the worst-case cost; writes nothing
npm run bench -- --pilot --go                   # one repetition of every task in arms A and B (12 runs)
npm run bench -- --go --reps 3                  # the full plan, three repetitions
npm run bench:report -- test/bench/results/<stamp>
```

Without `--go` (or `--dry-run`) the runner refuses and exits 2, because it spends money. Useful
options: `--arms`, `--tasks`, `--model` (default `claude-sonnet-5-5`), `--concurrency` (default 2),
`--budget-usd` (total, default 10), `--per-run-usd` (default 0.50), `--seed` (recorded, for the
run order), `--out` (an existing folder resumes: runs whose result file exists are skipped), and
`--claude <path>` to use another `claude` binary.

Results go to `test/bench/results/<stamp>/` by default. That folder is gitignored.

### Cost expectations

Claude Code checks `--max-budget-usd` between turns, so a run can finish one turn past its
allowance. The runner therefore reserves 1.5 times `--per-run-usd` for every run. The worst case
for a plan is its number of runs times that reservation, and the runner stops before a run if the
spend so far, plus the reservation of every run in flight, plus this run's reservation, would pass
`--budget-usd`. The dry run prints both figures for the plan you ask for. With the defaults, the
pilot's 12 runs have a worst case of $9.00 and a full plan is held to $10 in total. Real spend is
usually well below the worst case.

A run stopped by its own budget is recorded with `pass: false` and its real cost. It is never
dropped.

## Isolation

Each run is meant to be isolated from the repository and from the user's own setup. The settings
below are the intended ones; the isolation findings section records what a real run confirmed.

- A fresh temporary directory per run: the fixture's `base/` is copied, the memory overlay (plus the
  task's own `memory-extra/`, if it has one) is added for arms B and C, and the directory is committed to a new git repository. Runs never happen in the
  repository itself.
- For arms B and C, `node_modules/@jb9k62/good2go` is a staged copy of `dist/` and `package.json`
  (not a link to the repository, which holds the hidden tests), with `node_modules/.bin/good2go`
  beside it, and the memory overlay's `package.json` carries the `edukai:*` scripts that
  `good2go init --edukai` writes. For arm B only, `good2go hooks --project --claude` is then run
  in the workdir, so the hooks are the ones a real user gets. Arm C has the files, the package and
  the scripts, but no hooks.
- Arms B and C get the `edukai` skill the way a real project has it: the real installer is pointed
  at the workdir as its home (the staged package's `good2go skills --claude --dir <workdir>`, which writes
  `<workdir>/.claude/skills/`; the command has no project-scope flag). It installs every skill the
  package ships, so the runner keeps only `edukai`. `.claude/skills/` is kept out of the commit
  (`.git/info/exclude`), and arm A has no `.claude/skills` at all. `AGENTS.md` is unchanged:
  memory upkeep is unconditional, and the report separates it (see "Memory upkeep" below).
- `--setting-sources project`, `--strict-mcp-config` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` are
  passed in every arm. Whether they keep out user skills, user MCP servers and user-level memory
  must be confirmed from the `system`/`init` event of a real run.
- Subagents are off (`--disallowedTools … Agent Task`), so one run is one conversation.
- The run order is shuffled with a seeded generator and interleaved across arms.

### Isolation findings

With `--setting-sources project`, `--strict-mcp-config` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`,
the `system`/`init` event of a real run showed:

- `mcp_servers` was empty.
- Only the built-in skills were present: no user skills and no plugins.
- User hooks and `~/.claude/settings.json` were not applied.
- When asked, the model listed only the project's `CLAUDE.md` and `AGENTS.md` as the instructions
  it had loaded.

Other findings:

- `CLAUDE_CONFIG_DIR` is left alone, because authentication works with these flags.
- `--include-hook-events` is required to see `PostToolUse` and `Stop` hooks in the stream;
  without it only the `SessionStart` hook shows.
- The runner checks every run's init event and stops the plan if anything leaked in. The init
  event lists skills by name only, so the check cannot tell a project skill from a user skill of
  the same name. It is therefore per arm: the project-scoped `edukai` skill is expected in B and C
  and is a leak in A; `good2go` is a leak in every arm; so is every name found in the user's own
  `~/.claude/{skills,commands,agents}` (or `CLAUDE_CONFIG_DIR`), apart from the `edukai` an arm
  is expected to have. That is sound because `--setting-sources project` keeps user skills out
  (confirmed above), so an expected name can only come from the workdir. If an init entry carries
  a path (`path`, `source` or `location`), the path decides instead: outside the workdir, or inside
  the user's config folder, is a leak.
- The runner strips the parent session's variables from the child's environment (`CLAUDECODE`,
  `CLAUDE_EFFORT`, `CLAUDE_CODE_SESSION_*`, `GIT_DIR` and the like), so a benchmark started from
  inside Claude Code or git does not inherit the caller's session or repository. It also drops
  what `npm run bench` adds (`npm_*`, `INIT_CWD`, `PWD`, and the repository's folders on `PATH`),
  so nothing in a run's environment names the repository that holds the hidden tests.

## Reading the report

`npm run bench:report -- <results-dir>` prints Markdown; add `--json` for the same numbers
machine-readable, or `--out <file>` to write them to a file.

- **Pass rate sits beside every figure.** A median over passing runs means little if half the runs
  failed, so read the pass count first.
- **Medians and ranges** are over passing runs only, for each task and arm: cost, turns, tool
  calls, calls before the target file was touched, the token counts, duration, and the hook
  figures (`hookInjections` and `hookChars`, which show what edukai put in front of the agent).
- **Deltas** are B against A and C against A, absolute and in percent, per task. Each kind (discovery,
  control, trap) then gets the median of its per-task deltas, never one blended number.
  A delta is the arm's median minus A's, so a negative figure means the arm spent less than A; the
  percent is that difference over A's median. A zero baseline has no percent (shown as `–`), and a
  task gets no deltas unless both arms have at least one passing run, so each kind says how many
  of its tasks fed its deltas: a kind delta from one task is that task's delta, not a trend.
- **Spend over all runs** is given for each task and arm, failed and budget-stopped runs
  included, because the medians leave failures out but their money was still spent.
- **Control rows are labelled overhead.** They measure what edukai costs on tasks it cannot help with.
- **The trap task's row leads with its pass rate.** A wrong lesson shows as a failure there, not as a
  cheaper run.
- The footer gives the model, Claude Code version, git SHA, date, total spend, runs planned and
  completed, and the standing caveats.
- An incomplete set, or one the total budget stopped, says so in a banner at the top. Runs the
  per-run budget stopped are listed in a note there too; they count as failures, not as missing.

The report exits 0 when every planned run has a result, 1 when the results are incomplete or
stopped early (the report is still written, under the banner) or a run file is malformed (the file
is named and nothing is written), and 2 when it cannot run (bad arguments, no `meta.json`).

## Memory upkeep

Arm B's totals include the work of keeping memory: recording lessons, re-checking them, fixing a
stale one. `AGENTS.md` makes that unconditional, and the benchmark does not change that wording.
So the report separates it, and shows A against B both with and without it.

Each tool call and each assistant message (a turn) of a run is classified from the stream:

- **Upkeep**: edits or writes under `edukai/`; `npm run edukai:recheck|index|validate` (and `new`,
  `verify`, `supersede`); `good2go edukai ...`; a Bash command that writes inside `edukai/`
  (`sed -i`, `tee`, `>`, `mv`, `cp`, `rm`, ... on a path there, or after a `cd edukai/...`); and the
  `edukai` skill call.
- **Use**: reads, searches and listings of `edukai/`, and `npm run edukai:brief|search|...`.
- **Task**: everything else, and the final answer.

A message is one assistant message id (the stream repeats it once per content block). It is split
by its calls, not given whole to one class: every call weighs one, spread equally over the parts of
a mixed Bash command. A source edit plus `npm run edukai:recheck` in one message is half task and
half upkeep, and `sed ... && npm run edukai:recheck` is one task part and one upkeep part. A command
is cut at `;`, `&&`, `||`, `|` and newlines after heredoc bodies are removed (the line that opens a
heredoc is kept, so `cat <<EOF > edukai/x.md` still writes to `edukai/`); a filter after a pipe
(`| tail -8`) belongs to the part before it. A message with only text is task. The message's turn
(so turns can be fractional), its tool call and its weighted tokens follow those shares, and a
call counts one in total, so the three classes sum to the run's tool calls.

The run's cost is shared out by weighted tokens: input 1, output 5, cache read 0.05, cache creation
1.25 for the five-minute cache and 2 for the one-hour cache (2 when the stream has no breakdown).
These are ratios of Sonnet 5.5's prices ($2, $10, $0.10, $2.50 and $4 per million tokens) fitted to
the pilot's bills: rebuilt from the result event's usage they match every pilot run's `costUsd`
within 1%. They are an estimate for any other model. The output tokens are the run's real total
from the result event, shared by content length (characters of text, thinking and `tool_use` input
JSON) of each class's blocks. The three parts sum to the run's `costUsd` and output tokens. The
result is stored in each run file as `split` (`task`, `use`, `upkeep`, `method`; the method is
`upkeep-split-v2`).

In the report, each task has a table of A, B (and C) with the total, the figure excluding upkeep
(task work plus use) and the upkeep itself, for cost, turns and tool calls, with B and C against A
both ways. Each kind gets the median of its per-task deltas. Medians are over passing runs.

What this is, and is not:

- **The cost split is an estimate.** It is the real cost divided by a token-weight rule, not a bill,
  and the weights are ratios fitted to the pilot's `claude-sonnet-5-5` bills (see above). The
  turn and tool-call counts follow the classification, with each call weighing the same however
  much work it did.
  "Turns" here are assistant messages; they are not the `num_turns` the result event reports, which
  is about one per tool call, so the two are never mixed.
- **Per-message output counts in the stream are partial** (an early snapshot, stop reason null), so
  they are not used: the total comes from the result event and the shares from content length.
- **The classification is a heuristic over command text.** Mixed messages and commands are split
  by call and by part, with equal weight per call, so a long task call beside a short re-check
  shares the message's tokens equally and moves some task cost into upkeep, or the reverse. A write
  to `edukai/` made some other way (a script, `git checkout`, a heredoc to a variable path) is
  missed.
- **Upkeep is a real cost.** The memory section of `AGENTS.md` asks for it, so every user of
  edukai pays it. "Excluding upkeep" answers a narrower question (what the rest of the work cost),
  not what edukai costs.
- **It does not measure hook output.** Text a hook puts in front of the agent costs input tokens
  inside whichever turn reads it, so it is not separated; `hookInjections` and `hookChars` still
  show its size. Nor does it measure the cost of the skill's text being loaded beyond the turns
  that call it, or what upkeep saves a later session (one run cannot show that).
- **It does not say upkeep is waste.** It says how much of B's total is upkeep, so a reader can
  decide how to weigh it.

Runs whose `split` was made by another method, or have none while others do, make the report open
with a warning that their upkeep figures are not comparable; `--reanalyse` brings them to one
method. Results made before the split existed are still read (the field is optional) and are reported
without the upkeep section. To fill it in without any model call:

```bash
npm run bench:report -- test/bench/results/<stamp> --reanalyse
```

This recomputes every run's split from `transcripts/<id>.jsonl` and writes it into
`runs/<id>.json`, changing nothing else, then prints the report. A run with no transcript is left
as it was and named.

## Limits

- **Small n.** A few repetitions per arm. Medians are not significance tests; read the ranges, and
  treat a difference that is smaller than the spread between runs as no difference.
- **Authored lessons.** The authors wrote the lessons for these tasks, so the discovery figures are
  an upper bound for memory that is relevant and correct. Real bundles are written under less
  favourable conditions.
- **Small synthetic fixture.** 40 to 70 small files. Results do not transfer to large codebases.
- **One model, one Claude Code version.** The figures are for the model and version in the footer.
- **Totals include the hooks.** The `Stop` hook can make arm B spend extra turns recording lessons.
  That cost is kept in the totals and reported, not hidden.
- **Not run in CI.** It needs a real Claude Code install and an account, and it spends money.

### Known limits

- `callsBeforeTarget` is a heuristic: a `Grep` or `Glob` path matches generously, and a `Bash`
  command is matched by the target's basename.
- Budget-stop detection matches `/budget/i` on the result subtype. It has not been seen on a real
  stop.
- The `Stop` hook's effect on the number of turns is unverified.
- Transcripts could contain secrets an agent chooses to print. Do not publish them without reading
  them.
- A run can overshoot its allowance by one turn; the reservation of 1.5 times the allowance
  allows for that.
- `d1` and `t1` are expected to show small differences, and the report should say so honestly
  rather than dress them up.
- An agent can rewrite the `package.json` scripts, so the `npm test` checks in `d1`, `d2` and `c1`
  are weaker than the hidden-test checks beside them (`d3` runs `node --test` directly).
- The pilot ran before the `edukai` skill was installed in arms B and C: its agents called
  `Skill edukai` (as the hooks' text tells them to) although no such skill was installed. Pilot figures are not comparable with
  runs made after this change.
- The allowed Bash rules are prefix rules (`Bash(npm:*)` and the like). Whether a command with a
  leading variable, such as `PARCEL_FAKE_CARRIERS=1 npm run test:full`, matches them is not yet
  confirmed; if it does not, the run is denied that command in every arm. Denied calls are listed
  in each run's `grade.detail` (`run: permission denied: …`) and counted in the runner's log line,
  without failing the run; look at them in the pilot before reading `d3`.
- A runner that is interrupted removes its working copies, but the runs in flight leave no result
  file, so what they spent is not in `meta.json`; a resume runs them again.
