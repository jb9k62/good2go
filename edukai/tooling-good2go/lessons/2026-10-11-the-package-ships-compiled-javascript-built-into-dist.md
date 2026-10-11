---
type: Lesson
title: "The package ships compiled JavaScript built into dist/"
description: "npm run build (scripts/build.mts) compiles src/ with tsconfig.build.json into dist/ (removing it first), then copies src/templates/, skills/ and the pi extension template beside it and marks dist/good."
tags: [build, npm]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:29:38Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:30:09Z }
stale_after: 2026-11-10T09:30:09Z
sources:
  - resource: scripts/build.mts
    digest: sha256:d55e703a3e5c2cb3
  - resource: tsconfig.build.json
    digest: sha256:b922506a91d7939f
check:
  - { file: scripts/build.mts, contains: "chmodSync(cli, 0o755)" }
  - { file: package.json, contains: "\"prepack\": \"npm run build\"" }
---

`npm run build` (`scripts/build.mts`) compiles `src/` with `tsconfig.build.json` into `dist/` (removing it first), then copies `src/templates/`, `skills/` and the pi extension template beside it and marks `dist/good2go.mjs` executable; that file is the package's `bin`. It is compiled because Node refuses to strip types under `node_modules`. `dist/` is gitignored and `npm run check` runs the build. Running the tools from `src/` in this repository needs no build.

## Caveats

- `scripts/g2g-start.mjs` (Node's compile cache) is only for this repository's own npm scripts; it is not shipped or copied into projects.
