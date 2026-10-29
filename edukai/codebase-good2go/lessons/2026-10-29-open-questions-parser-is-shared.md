---
type: Lesson
title: Open questions are parsed by g2g-qparse.mts, shared by the command, validate, the brief and the viewer
description: A section headed Open Questions holds - [ ] items; the pure parser is in g2g-qparse.mts so the hook-safe brief can use it.
tags: [questions, hooks]
confidence: observed
generated: { by: claude-code/claude-sonnet-5-5, at: 2026-10-29T14:12:56Z }
verified:
  - { by: claude-code/claude-sonnet-5-5, at: 2026-10-29T14:12:59Z }
stale_after: 2026-11-28T14:12:59Z
sources:
  - resource: src/g2g-qparse.mts
    digest: sha256:1884abebddae1a08
  - resource: src/g2g-questions.mts
    digest: sha256:914e2fe93f4c7916
---

The convention (`Open Questions`, singular warned, `[ ]` open, `[x]` answered with a link, ids derived from concept plus text, never stored) is parsed once in `src/g2g-qparse.mts`. `g2g-questions.mts` adds file access and the `answer` and `reopen` edits; `g2g-view.mts` turns errors into validation issues and counts per concept for the viewer; `g2g-hook.mts` counts open ones for the session brief. The parser has no imports beyond `g2g-rank.mts` because the hook may not import `g2g-core.mts`. Change the grammar in `g2g-qparse.mts` only, and update the playbook section "Open questions" with it.
