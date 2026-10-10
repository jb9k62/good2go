---
type: Lesson
title: The harness adapters resolve the memory hook from the skill assets
description: Both the pi extension and the Claude Code hook load g2g-hook.mts from src/.
tags: [hooks, adapters]
confidence: observed
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:03:18Z }
verified:
  - { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:07:52Z }
  - { by: claude-code/claude-sonnet-5-5, at: 2026-10-10T17:42:19Z }
stale_after: 2026-11-09T17:42:19Z
sources:
  - resource: extensions/edukai.ts
    digest: sha256:5b1448323ccc1c88
  - resource: hooks/edukai-hook.mjs
    digest: sha256:bb43295a8a0c66d7
check:
  - { file: extensions/edukai.ts, contains: "'../src/g2g-hook.mts'" }
  - { file: hooks/edukai-hook.mjs, contains: "'../src/g2g-hook.mts'" }
---

The pi extension and the Claude Code hook are thin adapters around one file,
`src/g2g-hook.mts`, and each finds it by a path relative to
itself. `extensions/edukai.ts` (the pi adapter) builds the path from `import.meta.url`.
`hooks/edukai-hook.mjs` (what Claude Code runs) imports
`../src/g2g-hook.mts`. So where that file lives is part of the
contract: move or rename it, and both harnesses lose their memory hooks at once. Both adapters
also load the compile cache first, never run code from the project, and stay quiet in a
project with no `edukai/index.md`.

## Caveats

- Breaking both adapters at once is the intended early warning, but no test that runs inside
  this repository catches it. If you move the file, update both adapters in the same change.
