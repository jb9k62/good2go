---
type: Lesson
title: "Everything is named good2go, and the tools live in src/ as g2g-* files"
description: "The project, the npm package (@jb9k62/good2go), the command and both skills are called good2go."
tags: [naming, layout]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:29:37Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:30:08Z }
  - { by: process:edukai-recheck, at: 2026-10-29T14:12:59Z }
stale_after: 2026-11-28T14:12:59Z
sources:
  - resource: package.json
    digest: sha256:be08d7e6eb564cbe
  - resource: src/good2go.mts
    digest: sha256:4719d1afaf65ef1a
  - resource: scripts/build.mts
    digest: sha256:d55e703a3e5c2cb3
check:
  - { file: package.json, contains: "\"good2go\": \"dist/good2go.mjs\"" }
  - { file: src/good2go.mts, exists: true }
---

The project, the npm package (`@jb9k62/good2go`), the command and both skills are called good2go. Earlier names (`okf-bootstrap`, `okf-*.mts`, `skills/okf-bootstrap/assets/`) are gone. The tools are `src/g2g-*.mts`, compiled by `scripts/build.mts` into `dist/`, and `src/good2go.mts` dispatches to them. Skills under `skills/` hold instructions only, no code. `okf` still names the *format*, the default design folder (`okf/`) and the `okf-widgets` workspace; this repository's own design bundle is `design/`. The project manifest is `.good2go.json`.

## Caveats

- Decided in ADR-0005 (bundle names) and ADR-0008 (the rename); see `design/adr/`.
- Old docs, links and the old skill name may still say `okf-bootstrap`; treat that as stale.
