---
type: Lesson
title: The notifier holds back a second message for the same parcel for thirty seconds
description: Status changes for one parcel within thirty seconds of the last message are not sent.
tags: [notifier]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:13Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:31Z }
stale_after: 2029-03-29T09:51:31Z
sources:
  - id: debounce
    resource: src/notifier/debounce.ts
    digest: sha256:15c3c874d617f349
  - id: notify
    resource: src/notifier/notify.ts
    digest: sha256:b699ed894ef0e8f1
check:
  - { file: src/notifier/debounce.ts, contains: "DEBOUNCE_MS = 30_000" }
---

A status change that arrives less than thirty seconds after the last message for the same parcel is dropped, not queued.[^debounce]

[^debounce]: The debounce window and where it is applied
