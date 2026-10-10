---
type: Lesson
title: g2g-rank.mts imports nothing so the viewer can inline it
description: The ranking is pure TypeScript with no imports, which is what lets one copy run in Node and in the page.
tags: [viewer, ranking]
confidence: observed
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:03:18Z }
verified:
  - { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:08:56Z }
  - { by: claude-code/claude-sonnet-5-5, at: 2026-10-10T18:14:16Z }
stale_after: 2026-11-09T18:14:16Z
sources:
  - resource: src/g2g-rank.mts
    digest: sha256:3c3218ba19719d51
check:
  - { file: src/g2g-rank.mts, lacks: "import " }
---

`g2g-rank.mts` imports nothing, and it never touches `fs`, `path`, `process` or the DOM. Keep
it that way, because the file runs in two places. `g2g-search` loads it as a module in Node.
`g2g-view.mts` reads the same file, strips its types with Node's `stripTypeScriptTypes`,
removes each `export ` prefix and inlines the result into `viz.html` as a plain script. One
ranking then serves both the command line and the viewer's search box.

## Caveats

- "No imports" is not "no dependencies". The file uses only language built-ins, and that is
  exactly why a Node module and a browser script can both run it.
- The check looks for `import ` with a trailing space, which only a real import statement
  has. A comment in the file mentions imports, so a check for the word alone would be wrong.
