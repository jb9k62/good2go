---
type: Lesson
title: The memory hooks read a cache that only edukai recheck or index writes
description: A fresh checkout, or a benchmark working copy, shows no index yet until recheck has run; the benchmark runs it for the hooks arm.
tags: [hooks, benchmark, cache]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T11:40:31Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T11:40:31Z }
stale_after: 2026-11-10T11:40:31Z
sources:
  - resource: test/bench/lib/arms.mts
    digest: sha256:98ed3e6a43c03f84
check:
  - { file: test/bench/lib/arms.mts, contains: "'recheck'" }
---

The SessionStart brief and the cites hook read `node_modules/.cache/edukai`, which `good2go edukai recheck` and `index` write. A new clone or a fresh benchmark workdir therefore starts with "no index yet" and no lesson text on reads. The benchmark's setup runs `recheck` for arm B before its first commit for that reason.
