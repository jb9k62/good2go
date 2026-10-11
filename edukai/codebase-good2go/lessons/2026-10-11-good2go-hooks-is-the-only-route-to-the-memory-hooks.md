---
type: Lesson
title: "good2go hooks is the only route to the memory hooks"
description: "Hooks reach an agent only through good2go hooks, which writes Claude Code settings entries (SessionStart, PostToolUse for Read and for Edit/Write/NotebookEdit, Stop) and installs a pi extension."
tags: [hooks, distribution]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:29:38Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:30:08Z }
stale_after: 2026-11-10T09:30:08Z
sources:
  - resource: src/g2g-install-hooks.mts
    digest: sha256:101c029c8251e17c
  - resource: extensions/edukai.ts
    digest: sha256:81038f6a950757c0
check:
  - { file: extensions/edukai.ts, contains: "pi.exec('good2go'" }
  - { file: src/g2g-install-hooks.mts, contains: "const USER_COMMAND = 'good2go hook run'" }
---

Hooks reach an agent only through `good2go hooks`, which writes Claude Code settings entries (SessionStart, PostToolUse for Read and for Edit/Write/NotebookEdit, Stop) and installs a pi extension. The Claude Code plugin (`hooks/`, `.claude-plugin/`) and the pi package route were removed, so do not look for or recreate them. Every entry runs `good2go hook run` (pi: `good2go hook <command>`); neither adapter holds logic or imports a path into this repository. `extensions/edukai.ts` is only the template the build copies to `dist/templates/pi-extension.ts`. Decided in ADR-0007.

## Caveats

- At user scope a harness started with a different `PATH` (a node version manager) can fail to find `good2go`; the hook then stays silent and `good2go hooks --check` says why.
