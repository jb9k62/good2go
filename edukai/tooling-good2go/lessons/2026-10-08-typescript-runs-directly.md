---
type: Lesson
title: The tools are TypeScript that Node runs with no build step
description: The tools run by type stripping, so only erasable TypeScript is allowed and no package.json "type" change is needed.
tags: [typescript, node]
confidence: observed
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:03:17Z }
verified:
  - { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:07:52Z }
  - { by: process:edukai-recheck, at: 2026-10-08T20:16:39Z }
  - { by: claude-code/claude-sonnet-5-5, at: 2026-10-10T18:14:16Z }
stale_after: 2026-11-09T18:14:16Z
sources:
  - resource: tsconfig.json
    digest: sha256:f97ed0c469a14703
  - resource: package.json
    digest: sha256:c8a3b5ec8cc3d1de
check:
  - { file: tsconfig.json, matches: erasableSyntaxOnly }
  - { file: package.json, matches: '"node": ">=24"' }
---

Every tool under `src/` is TypeScript that Node runs as it is. Node
strips the types and runs what is left, so this repository has no build step, and a target project's
`package.json` `"type"` is never changed. The price is a smaller language: Node can only
strip syntax it can delete without changing what runs. `tsconfig.json` sets
`erasableSyntaxOnly` to hold that line, so enums, namespaces and parameter properties are
out, and every import names the real `.mts` extension. `package.json` declares Node `>=24`.

## Caveats

- The published package is the exception: `npm run build` compiles `src/` to `dist/`
  because Node will not strip types under `node_modules`. Running from source needs no build.
- The check proves the flag is set, not that every file obeys it. `npm run typecheck` proves
  that.
- A `.mts` file is always an ES module, whatever the nearest `package.json` says. A plain
  `.ts` file would not have that guarantee.
