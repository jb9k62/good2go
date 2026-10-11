---
type: Lesson
title: Dependencies install with a two-day cool-down, and CDN pins move with them
description: ".npmrc sets min-release-age=2 and ignore-scripts=true; a bump changes package.json, the viewer's CDN URL and SRI hash, and the Action SHAs together."
tags: [dependencies, security, npm]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T10:00:00Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:50:45Z }
stale_after: 2026-11-10T09:50:45Z
sources:
  - resource: .npmrc
    digest: sha256:bdd0d8a897bf5242
check:
  - { file: .npmrc, contains: "min-release-age=2" }
  - { file: .npmrc, contains: "ignore-scripts=true" }
---

`.npmrc` refuses any version published in the last two days (`min-release-age`, npm 11.10 or later;
older npm only warns) and skips install scripts. To bump: run `npx npm@11 install <pkg>@latest`, then
recompute the SRI hash of each CDN file in `src/g2g-view.mts`, then run `npm run build` (the e2e
tests pack `dist/`, and a stale one fails the consumer test). Actions are pinned by commit SHA with the
tag in a comment. marked 18 ships no `marked.min.js`; the viewer loads `lib/marked.umd.js`.

## Caveats

- Mermaid and `mmdc` must stay on the same major.
