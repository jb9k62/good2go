---
type: Lesson
title: "A project depends on the package and holds no copy of the tools"
description: "Since 0.7.0 a project scaffolded with good2go init depends on @jb9k62/good2go; no scripts/okf-* or g2g-* copies are written."
tags: [init, distribution]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:29:38Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-14T18:25:46Z }
stale_after: 2026-11-13T18:25:46Z
sources:
  - resource: src/g2g-init.mts
    digest: sha256:3349ff7df0798f96
check:
  - { file: src/g2g-shared.mts, contains: "export const MANIFEST = '.good2go.json'" }
  - { file: src/g2g-init.mts, contains: "recordedBundles" }
  - { file: src/g2g-init.mts, contains: "--no-skills" }
---

Since 0.7.0 a project scaffolded with `good2go init` depends on `@jb9k62/good2go`; no `scripts/okf-*` or `g2g-*` copies are written. `init` writes `.good2go.json` (version, name, design folder, the list of every bundle folder, skill hashes; `good2go new` adds to the list), the npm scripts, and copies the skills into `.claude/skills/` and `.agents/skills/`. `--design-dir` picks the design folder (default `okf`, remembered), `--edukai` adds the memory bundle, `--no-skills` and `--no-scripts` skip parts. A re-run keeps authored files (only `--force` overwrites) and refreshes unedited skills. Upgrading is `npm update` then re-running `init`. There is no updater and no legacy migration (`okf-update` was removed); pre-0.7.0 copies are deleted by hand. `good2go new <dir>` scaffolds any further bundle.

## Caveats

- Nothing tells a project when a release changes a template; diff the package's `templates/` by hand.
