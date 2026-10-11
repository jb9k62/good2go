# Benchmark TODO

What the first full run (`reports/2026-10-11-sonnet-5-5.md`: 45 runs, three repetitions, Sonnet 5.5,
Claude Code 2.1.296, about $3.25) could not show, and how to get closer to real-world results.
Read this with the standing caveats in `docs/BENCHMARK.md`.

## What the first run can and cannot claim

- It shows that on tasks with hidden project knowledge, edukai raised correctness (d2: 0/3 to 3/3,
  d3: 1/3 to 3/3).
- It does not show a saving in tokens or turns where both arms passed (d1 cost +54%, controls
  +44% to +48%, t1 +134%), and the hooks added little over the memory files (arm C tracked B).
- We wrote the lessons for these tasks, the fixture has 45 files, and each cell has three runs.
  Every point below is about narrowing one of those gaps.

## Making the measurement more accurate

### Statistics

- [ ] **More repetitions where it matters.** Five or more per cell on d1 and d3, where the cost
      delta is within noise. Use `--out` on an existing folder to resume and extend; check the
      seed behaviour first, because a resume reuses the recorded seed.
- [ ] **Report intervals, not just medians.** Bootstrap a confidence interval for each paired
      delta, and say plainly when it crosses zero. Add a paired-by-seed comparison if the task
      order is made identical across arms.
- [ ] **Survivor bias.** Medians use passing runs only, so a failing arm that quits early looks
      cheap (A on d3 spent about $0.03 and gave up). Add a "cost per success" figure (total spend
      over passing runs, failures included) and a "cost of the first correct answer" comparison.
- [ ] **Score partial credit.** Pass/fail hides near misses. Split hidden tests into named
      checks and report how many each run satisfied.
- [ ] **Track variance across days.** Re-run a fixed subset on a later date and with the next
      Claude Code release, so a harness or model change shows up as a shift, not as noise.

### Harness and isolation

- [ ] **Permission denials.** The first run had 44 denied tool calls in B and C, and some in A
      (`python3`, heredoc `cat >>` edits, `sed -i`, `good2go edukai ...`). Decide one allow-list
      that every arm shares and that a real user would plausibly have, then re-run. Check whether
      d2's three A failures survive it. Count denials per arm in the report.
- [ ] **A real sandbox.** The runs happen in temp directories but the agent has `Bash(node:*)`,
      which can read the environment and the rest of the disk. Use a container or a user with no
      access to the repository, the home directory or credentials. Until then, transcripts may
      hold secrets an agent chose to print.
- [ ] **Commit before measuring.** Results record `gitSha` with `-dirty` when the benchmark is
      uncommitted. Refuse a full run on a dirty tree unless `--allow-dirty` is given.
- [ ] **Pin the lesson set per run.** Record a hash of the memory overlay and the task's
      `memory-extra` in each result so a later edit to a lesson can't be mistaken for a model
      change.
- [ ] **Verify the budget-stop path.** Budget-stop detection matches `/budget/i` on the result
      subtype and has never been seen on a real stop. Provoke one with a tiny
      `--per-run-usd` on a cheap model and keep the transcript as a test fixture.
- [ ] **Verify the Stop hook.** Its effect on turns is untested (it returned nothing in the
      calls made so far). Capture a real run where it fires.
- [ ] **Per-turn cost.** The upkeep split shares the run's cost by weighted tokens, because the
      stream gives no per-message price. If Claude Code starts exposing per-message cost, use it
      and drop the fitted price ratios.
- [ ] **`callsBeforeTarget` is a heuristic.** Grep and Glob over a parent folder count as touching
      every target below it, and Bash is matched by file name. Replace it with the first call
      whose result contained the target's content, using tool results rather than inputs.

### Fairness of the arms

- [ ] **A "good AGENTS.md" arm.** The strongest alternative to edukai is not nothing; it is a
      hand-written `AGENTS.md` holding the same facts. Add arm D: the lessons' content as plain
      `AGENTS.md` bullets, no bundle, no hooks. This separates what edukai's structure, search and
      freshness checks add from what any written-down knowledge adds.
- [ ] **A "memory written by the agent" arm.** In the real workflow the lessons are written by an
      agent over earlier sessions, not authored for the task. Run a first phase where an agent
      explores the fixture on unrelated tasks and records lessons with the edukai skill, then
      benchmark with that bundle. This tests the lessons that actually get written, including
      the wrong and irrelevant ones.
- [ ] **Distractor and wrong lessons.** The overlay has 7 correct lessons. Real bundles hold
      stale, vague, over-broad and contradictory ones. Add a bundle with a mix and measure the
      cost of being misled, not only the cost of the trap in t1.
- [ ] **Memory that grows.** Re-run the same tasks with 8, 40 and 150 lessons, to see where the
      brief and search start to cost more than they save.
- [ ] **Separate upkeep from use by design.** Today the same run both uses and maintains memory.
      Run B twice: once as shipped, once with upkeep forbidden by the prompt in both arms, so the
      upkeep cost is measured by difference and not only estimated from the transcript.

### Tasks

- [ ] **More tasks per kind.** Six tasks is one data point per scenario. Aim for at least five
      discovery tasks, three controls and three traps, so a kind-level number is not the median
      of two.
- [ ] **A trap with consequences.** t1's wrong lesson is flagged `[failed]` by the hook, so a
      careful agent catches it. Add traps where the lesson is wrong but not yet flagged
      (`inferred` confidence, no re-runnable check), and where it is right but narrower than it
      sounds.
- [ ] **Different failure modes for A.** The A failures were wrong-fix (d2) and gave-up-early
      (d3). Add tasks where A succeeds but slowly (a long search), because that is where a token
      saving would appear.
- [ ] **Prompts that look like real requests.** Real prompts are vaguer than ours and arrive
      mid-session. Write each task's prompt in two registers (precise, and a one-line bug report)
      and report both.

## Seeding a better fixture

The current fixture ("Parcel tracker, expanded") is synthetic, small and written by the same
people who wrote the lessons. Ways to get closer to real-world results:

- [ ] **Use real repositories.** Pick three to five open-source projects of 5,000 to 200,000 lines
      in different languages and shapes (a library, a web service, a CLI, a monorepo). Pin each to
      a commit so runs are reproducible.
- [ ] **Mine real tasks from their history.** Take closed issues and merged pull requests that
      came with tests. Check out the parent commit, give the agent the issue text as the prompt,
      and use the pull request's tests as the hidden grader (the SWE-bench pattern). The fix is
      then known to be correct and the task was not designed around a lesson.
- [ ] **Write the lessons from the history, not from the task.** For each project, record lessons
      from earlier commits and review comments (a rule that had to be re-explained, a build quirk,
      an architectural constraint), then see which later tasks they help. Tasks they don't help are
      the controls for free. Hold out some tasks so no lesson was written knowing the answer.
- [ ] **Let an agent write the bundle.** Have an agent work through the project's earlier issues
      with edukai enabled and keep whatever it records. Measure on later issues. This also yields a
      realistic mix of good, vague and wrong lessons.
- [ ] **Realistic size and noise.** Add the clutter real repositories have: stale docs, dead code,
      vendored directories, generated files, large lockfiles, many near-identical modules. Discovery
      only gets expensive when the code is bigger than a single read.
- [ ] **Knowledge that code can't reveal.** Seed facts that really live outside the repository and
      that no search will find: a deployment gotcha, a flaky-test workaround, a team convention
      stated in a review, a deprecated service still referenced in config. These are the cases
      memory should win, and the current fixture has only one (the silent test skip).
- [ ] **Multi-session tasks.** Memory's promise is that session two starts knowing what session one
      learned. Run pairs: session one explores and records, session two repeats a related task in
      a fresh process. Measure session two's cost and correctness against a fresh arm A.
- [ ] **Monorepo and multi-language cases.** Memory may pay off most when an agent must pick the
      right sub-project or toolchain. Include at least one monorepo with two languages and a
      non-obvious test entry point.
- [ ] **Non-Node tooling.** The fixture runs on `node --test`. Add Python, Go or Java projects so
      slow or awkward test runners (and their silent skips) are represented.
- [ ] **Keep a held-out set.** Tune the lessons and prompts on one set of tasks and report on
      another, so the numbers aren't a record of how well we fitted the fixture.

## Other models and harnesses

- [ ] **Haiku 5.5.** Only `--model` changes. Cheaper, so more repetitions fit the budget; a weaker
      model may gain more from memory, or follow the memory instructions less well.
- [ ] **Opus or Fable class.** The strongest models may find d2 and d3 unaided; check whether the
      correctness gap closes.
- [ ] **pi.** The pi extension is not benchmarked yet. The runner and the arms are Claude Code
      specific; pi needs its own invocation and transcript parser, behind the same `RunResult`.
- [ ] **Compare harness versions.** Re-run on the next Claude Code release and keep the report
      beside this one, labelled by version and date.

## Reporting

- [ ] **Publish the method with the numbers.** Link the arm definitions, the allow-list, the
      memory overlay hash and the split method in every report footer.
- [ ] **A one-page summary.** The report is long. Add a top section with pass rate, cost per
      success and the three or four deltas a reader needs, and move the per-task tables below it.
- [ ] **Cost in tokens as well as dollars.** Prices change; keep raw input, output and cache
      tokens prominent so results can be re-priced later.
- [ ] **Don't oversell.** Keep the report's wording: upkeep is a real cost, "excluding upkeep" is
      an estimate, discovery rows are an upper bound.
