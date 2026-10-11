---
type: Lesson
title: The poller times out a carrier call after ten seconds
description: One carrier response may take up to ten seconds before the poll counts as failed.
tags: [poller, timeouts]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:13Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:31Z }
stale_after: 2029-03-29T09:51:31Z
sources:
  - id: config
    resource: src/poller/config.ts
    digest: sha256:84c6ca22d14ffae4
check:
  - { file: src/poller/config.ts, contains: "TIMEOUT_MS = 10_000" }
---

The poller waits up to ten seconds for one carrier response before it counts the poll as failed and the retry policy takes over.[^config]

[^config]: The poller settings
