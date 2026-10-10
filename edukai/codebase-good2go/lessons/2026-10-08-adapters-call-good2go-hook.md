---
type: Lesson
title: The harness adapters call good2go hook, not a file path
description: Claude Code runs `good2go hook run` and the pi extension runs `good2go hook <command>`; `good2go hooks` installs both.
tags: [hooks, adapters]
confidence: observed
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:03:18Z }
verified:
  - { by: claude-code/claude-sonnet-5-5, at: 2026-10-10T18:14:14Z }
stale_after: 2026-11-09T18:14:14Z
sources:
  - resource: extensions/edukai.ts
    digest: sha256:81038f6a950757c0
  - resource: src/g2g-install-hooks.mts
    digest: sha256:1791b61926fdc5a5
check:
  - { file: extensions/edukai.ts, contains: "pi.exec('good2go'" }
  - { file: src/g2g-install-hooks.mts, contains: "const USER_COMMAND = 'good2go hook run'" }
---

The memory hooks are thin adapters around one command, `good2go hook`. Claude Code is
configured with `good2go hook run` (written into its `settings.json` by `good2go hooks`), and the
pi extension `extensions/edukai.ts` runs `good2go hook <command>` through `pi.exec`. Neither holds
logic or a path into this repository: they find the tool on PATH, or, with `--project`, in the
project's own `node_modules`. This replaced an earlier layout where both adapters imported
`src/g2g-hook.mts` by a relative path, so moving that file no longer breaks them.

## Caveats

- User-scope hooks stay silent when `good2go` is not on PATH; `good2go hooks --check` says so.
