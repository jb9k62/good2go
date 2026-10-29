---
type: Lesson
title: The reading pane's rail is set from a ResizeObserver, because an ancestor with a containment or transform would clip an expanded diagram
description: "An expanded Mermaid diagram is position: fixed, so a containment or transform above the prose confines it; the script measures the pane instead."
tags: [viewer, layout]
confidence: tested
generated: { by: claude-code/claude-haiku-5-5, at: 2026-10-11T12:22:10Z }
verified:
  - { by: claude-code/claude-haiku-5-5, at: 2026-10-11T12:59:51Z }
  - { by: process:edukai-recheck, at: 2026-10-29T14:12:59Z }
stale_after: 2026-11-28T14:12:59Z
sources:
  - resource: src/g2g-view.mts
    digest: sha256:49f0fc0ea4c949d5
  - resource: test/views.e2e.mts
    digest: sha256:1a4b6e337eda0c4e
check:
  - { file: src/g2g-view.mts, contains: "new ResizeObserver(" }
  - { file: src/g2g-view.mts, matches: "\\.prose \\.mermaid\\.expanded \\{\\s*position: fixed" }
---

The contents column beside the prose appears when the reading pane is at least 66rem wide. `src/g2g-view.mts` sets the `rail` class on `#detail-content` from a `ResizeObserver` on `#detail`, rather than with a container query. The reason: an expanded Mermaid diagram is `position: fixed; inset: 0`, and a containment or a transform on an ancestor of the prose confines a fixed element to that ancestor. In Chromium, `contain: layout` and `transform` on `#detail` each shrank the expanded diagram to the pane's width, while `container-type: inline-size` alone left it full-window.

## Caveats

- Other browsers were not checked, so a container query is unproven there; the script avoids the question.
- Do not add containment, a transform or a container to `#detail`, `#detail-content` or anything between them and a diagram. The status bar's transform is on a sibling of the prose, so it does not matter.
- The Chromium result came from a scratch script outside the repository. The views tests cover the same thing in the reading view, where the rail layout is on: an expanded diagram still fills the window.
