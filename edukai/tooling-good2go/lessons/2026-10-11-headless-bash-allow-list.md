---
type: Lesson
title: A headless run denies env-prefixed Bash commands unless an allow rule names them
description: Commands starting with VAR=1 or env, python3 and heredoc edits were denied by the benchmark's Bash allow-list until env and the variable were added.
tags: [benchmark, permissions, claude-code]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T11:40:30Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T11:40:30Z }
stale_after: 2026-11-10T11:40:30Z
sources:
  - resource: test/bench/lib/claude.mts
    digest: sha256:99dfc6a4ac8109ec
check:
  - { file: test/bench/lib/claude.mts, contains: "Bash(env:*)" }
---

In `claude -p` with `--allowedTools` Bash rules, `PARCEL_FAKE_CARRIERS=1 npm run test:full` and `env PARCEL_FAKE_CARRIERS=1 node --test ...` are denied unless `Bash(env:*)` and the variable's own rule are listed. Before they were, both arms could not run the silent-skip suite in d3, so the task was unmeasurable. `sed -i`, `python3` and heredoc writes are still denied, and agents fall back to Edit.
