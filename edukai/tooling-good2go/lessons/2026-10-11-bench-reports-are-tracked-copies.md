---
type: Lesson
title: Benchmark results are gitignored, so a report is committed as a copy under test/bench/reports
description: test/bench/results/ is ignored; copy report.md to test/bench/reports/<date>-<model>.md to keep it in git.
tags: [benchmark, git]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T11:40:31Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T11:40:31Z }
stale_after: 2026-11-10T11:40:31Z
sources:
  - resource: .gitignore
    digest: sha256:d6e13ba8e933ba02
  - resource: test/bench/reports/2026-10-11-sonnet-5-5.md
    digest: sha256:3a5beb117ded2948
check:
  - { file: .gitignore, contains: "test/bench/results/" }
---

`test/bench/results/` holds each run's JSON and transcripts and is gitignored, because transcripts can hold anything an agent printed. Keep a finished report by copying its `report.md` to `test/bench/reports/<date>-<model>.md` and committing that, with a line saying how it was produced. Read a transcript before ever publishing one.
