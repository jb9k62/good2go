---
type: Lesson
title: "good2go hooks installs at user, project or local scope"
description: "The default is **user** scope: ~/.claude/settings.json and pi's user folder, calling good2go from PATH; it refuses to write when good2go is not on PATH (--force overrides)."
tags: [hooks, security]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:29:38Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:30:08Z }
stale_after: 2026-11-10T09:30:08Z
sources:
  - resource: src/g2g-install-hooks.mts
    digest: sha256:101c029c8251e17c
check:
  - { file: src/g2g-install-hooks.mts, contains: "settings.local.json" }
  - { file: src/g2g-install-hooks.mts, contains: "const PROJECT_BIN = 'node_modules/@jb9k62/good2go/dist/good2go.mjs'" }
---

The default is **user** scope: `~/.claude/settings.json` and pi's user folder, calling `good2go` from `PATH`; it refuses to write when `good2go` is not on `PATH` (`--force` overrides). The reason is trust: a cloned repository must not be able to make a hook run its code. `--project` writes `.claude/settings.json` and `.pi/extensions/` and runs the project's own `node_modules/@jb9k62/good2go/dist/good2go.mjs` only if that file exists (no npx; POSIX shell only). `--local` (added 2026-10-11) is `--project` written to `.claude/settings.local.json`, uncommitted and yours alone, Claude Code only; `--local --pi` is refused. Other flags: `--dry-run`, `--remove`, `--check`, `--claude`, `--pi`. It edits only entries it owns.

## Caveats

- `--project` and `--local` let a repository supply the code that runs at session start.
- Restart the agent after installing; both read configuration at start.
