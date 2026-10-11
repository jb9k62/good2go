---
type: Lesson
title: The poller retries a failed poll five times
description: After the first failure the poller tries five more times before it gives up on a parcel.
tags: [poller, retries]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:13Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:31Z }
stale_after: 2029-03-29T09:51:31Z
sources:
  - id: retry
    resource: src/poller/config.ts
    digest: sha256:84c6ca22d14ffae4
  - id: retry
    resource: src/poller/retry.ts
    digest: sha256:94819a51d4ef39b0
check:
  - { file: src/poller/config.ts, contains: "RETRIES = 5" }
---

A failed poll is retried five times, each wait drawn at random under a capped exponential delay, before the parcel is reported as failed for that cycle.[^retry]

[^retry]: The retry settings and the retry loop
