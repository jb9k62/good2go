---
type: Lesson
title: The viewer's browser script sits in a template literal, so a backtick in it breaks the typecheck and the viewer
description: The viewer's CSS and browser script are template literals in g2g-view.mts; a backtick, even in a comment, ends the literal early.
tags: [viewer, build]
confidence: tested
generated: { by: claude-code/claude-haiku-5-5, at: 2026-10-11T12:22:11Z }
verified:
  - { by: claude-code/claude-haiku-5-5, at: 2026-10-11T12:59:52Z }
stale_after: 2026-11-10T12:59:52Z
sources:
  - resource: src/g2g-view.mts
    digest: sha256:eae5530e4005b50a
check:
  - { file: src/g2g-view.mts, contains: 'const JS = `' }
---

`src/g2g-view.mts` holds the viewer's CSS (`const CSS`) and its browser script (`const JS`) as JavaScript template literals. A backtick anywhere in that text, even in a comment, ends the literal early: `tsc` then reports TS1005 at that line, and running the viewer fails with ERR_INVALID_TYPESCRIPT_SYNTAX. A `${` would start an interpolation instead. Backslashes are doubled in the source, so `\\n` in the file is `\n` in the page.

## Caveats

- Both failures were reproduced: a backtick added to a comment in the contents section failed `npm run typecheck`, and failed `node src/g2g-view.mts` until it was removed.
- Write plain quotes in comments inside the script.
