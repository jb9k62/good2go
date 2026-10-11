---
type: Lesson
title: The first benchmark raised correctness on d2 and d3 but did not lower cost where both arms passed
description: On Sonnet 5.5, A passed d2 0/3 and d3 1/3 against 3/3 for edukai, while edukai cost more on d1, the controls and t1.
tags: [benchmark, results]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T11:40:31Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T11:40:31Z }
stale_after: 2026-11-10T11:40:31Z
sources:
  - resource: test/bench/reports/2026-10-11-sonnet-5-5.md
    digest: sha256:3a5beb117ded2948
  - resource: test/bench/TODO.md
    digest: sha256:94c5e2d5241732a3
check:
  - { file: test/bench/reports/2026-10-11-sonnet-5-5.md, contains: "Pooled pass rate: A 4/9, B 9/9, C 9/9" }
---

In the first full run (45 runs, Sonnet 5.5, Claude Code 2.1.296, about $3.25) native Claude Code passed 4 of 9 discovery runs and edukai with hooks 9 of 9, with memory files alone also 9 of 9. Where both arms passed, edukai cost 54 percent more on d1, 44 to 48 percent on the controls and 134 percent on t1, with d3 level. The lessons were authored for the tasks, so read this as an upper bound for correctness and not as a saving. See `test/bench/TODO.md` for what would firm it up.
