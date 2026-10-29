---
type: Lesson
title: The viewer loads its libraries from a pinned CDN
description: Cytoscape, marked, Mermaid and highlight.js come from a CDN with integrity hashes, so the render gate needs network.
tags: [viewer, cdn]
confidence: observed
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:03:18Z }
verified:
  - { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:08:56Z }
  - { by: claude-code/claude-sonnet-5-5, at: 2026-10-23T09:39:28Z }
stale_after: 2026-11-22T09:39:28Z
sources:
  - resource: src/g2g-view.mts
    digest: sha256:97ad44148d220287
  - resource: test/views.e2e.mts
    digest: sha256:50d91a7dbfb7c1a9
check:
  - { file: src/g2g-view.mts, contains: "cdn.jsdelivr.net/npm/mermaid@12." }
  - { file: src/g2g-view.mts, contains: 'integrity="sha384-' }
---

`viz.html` does not carry its big libraries. Cytoscape, marked, Mermaid and highlight.js load
from jsdelivr and cdnjs when the page opens. Each URL names an exact version and carries a
subresource-integrity hash, so a CDN file that has changed does not run. This is why the
render gate needs network access, and why it exits 2 without it. The ranking and the widget
bundle are handled differently: they are inlined, so the page stays one file with no build
step.

## Caveats

- To bump a library, change three things together: the URL, the integrity hash and the
  devDependency. `test/views.e2e.mts` serves the pinned versions from `node_modules` when
  they are installed, and fails when the two drift apart.
- The parse gate runs offline; the render gate cannot. Read exit 2 as "unproven", never as a
  pass.
