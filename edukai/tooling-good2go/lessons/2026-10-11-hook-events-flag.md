---
type: Lesson
title: Headless Claude Code shows hook output in its stream only with --include-hook-events
description: Without --include-hook-events, claude -p stream-json shows only the SessionStart hook, so the benchmark would miss PostToolUse and Stop output.
tags: [benchmark, hooks, claude-code]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T11:40:30Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T11:40:30Z }
stale_after: 2026-11-10T11:40:30Z
sources:
  - resource: test/bench/lib/claude.mts
    digest: sha256:99dfc6a4ac8109ec
check:
  - { file: test/bench/lib/claude.mts, contains: "'--include-hook-events'" }
---

A benchmark run that reads hook output from `claude -p --output-format stream-json` must pass `--include-hook-events`. Without it only SessionStart appears in the stream, although a PostToolUse `edukai:` line still reaches the model, so the overhead edukai adds would be undercounted.
