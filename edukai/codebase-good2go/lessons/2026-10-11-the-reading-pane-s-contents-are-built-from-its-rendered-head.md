---
type: Lesson
title: The reading pane's contents are built from its rendered headings, so each entry lands on its anchor
description: The contents list reads the h2 and h3 elements of the rendered body, so its entries scroll to the same elements the section anchors use.
tags: [viewer, contents]
confidence: tested
generated: { by: claude-code/claude-haiku-5-5, at: 2026-10-11T12:22:10Z }
verified:
  - { by: claude-code/claude-haiku-5-5, at: 2026-10-11T12:59:51Z }
stale_after: 2026-11-10T12:59:51Z
sources:
  - resource: src/g2g-view.mts
    digest: sha256:eae5530e4005b50a
  - resource: test/views.e2e.mts
    digest: sha256:1c16957e2bf2948b
check:
  - { file: src/g2g-view.mts, contains: 'root.querySelectorAll("h2, h3")' }
  - { file: src/g2g-view.mts, contains: 'heading.scrollIntoView({ behavior: "smooth", block: "start" })' }
---

The reading pane's contents list is built in the browser by `renderToc` in `src/g2g-view.mts`. It reads the `h2` and `h3` elements of the rendered body, after `addHeadingIds` has given each one its id, so an entry scrolls to the element that an in-page link to that section lands on. The Markdown stores none of it.

## Caveats

- The search preview is a separate path. Its contents (`tocFor`) are parsed from the Markdown lines with `Rank.HEADING_RE`, so the two lists can differ: a heading inside a blockquote callout is in the rendered body but not in the line parse. That difference is read from the code, not reproduced.
- The views tests check that the entries are the body's headings in order, and that a choice scrolls its heading to the top of the pane (the contents tests in `test/views.e2e.mts`).
