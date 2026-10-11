---
type: Lesson
title: List endpoints cap the page size at fifty
description: Asking for a larger page returns fifty items, not an error.
tags: [api, paging]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:13Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:30Z }
stale_after: 2029-03-29T09:51:30Z
sources:
  - id: paging
    resource: src/api/paging.ts
    digest: sha256:6d3064d274125529
check:
  - { file: src/api/paging.ts, contains: "MAX_PAGE = 50" }
---

A caller that asks for more than fifty items per page gets fifty; there is no error and no header saying so.[^paging]

[^paging]: The paging helper
