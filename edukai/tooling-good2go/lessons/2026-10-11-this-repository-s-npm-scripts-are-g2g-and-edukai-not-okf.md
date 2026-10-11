---
type: Lesson
title: "This repository's npm scripts are g2g: and edukai:, not okf:"
description: "The scripts for the design bundle are g2g:validate, g2g:fix, g2g:view, g2g:search, g2g:recheck, g2g:mermaid and g2g:mermaid:render; the memory bundle's are edukai:validate, edukai:index, edukai:brief,."
tags: [scripts, naming]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:29:38Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:30:09Z }
stale_after: 2026-11-10T09:30:09Z
sources:
  - resource: package.json
    digest: sha256:9e84fa4523d01049
check:
  - { file: package.json, contains: "\"g2g:validate\"" }
  - { file: package.json, contains: "\"edukai:brief\"" }
---

The scripts for the design bundle are `g2g:validate`, `g2g:fix`, `g2g:view`, `g2g:search`, `g2g:recheck`, `g2g:mermaid` and `g2g:mermaid:render`; the memory bundle's are `edukai:validate`, `edukai:index`, `edukai:brief`, `edukai:recheck`, `edukai:search` and `edukai:view`. The old `okf:*` names were renamed on 2026-10-11 and no longer exist, so an old document or CI line that calls `npm run okf:…` is wrong. They all start through `scripts/g2g-start.mjs`. Scaffolded projects get the same `g2g:` names.

## Caveats

- `npm run check` is the entry point for a full local run; see the lesson on it.
