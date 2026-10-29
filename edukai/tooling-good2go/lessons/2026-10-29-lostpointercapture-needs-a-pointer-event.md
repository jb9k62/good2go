---
type: Lesson
title: A views e2e test that waits for lostpointercapture needs a pointer event
description: Chromium may hold lostpointercapture until the next pointer event, so a test that releases capture and waits with no input fails about one run in four.
tags: [testing, flaky]
confidence: tested
generated: { by: claude-code/claude-sonnet-5-5, at: 2026-10-29T14:12:50Z }
verified:
  - { by: claude-code/claude-sonnet-5-5, at: 2026-10-29T14:12:55Z }
stale_after: 2026-11-28T14:12:55Z
sources:
  - resource: test/views.e2e.mts
    digest: sha256:1a4b6e337eda0c4e
---

In the drag test (`test/views.e2e.mts`), `releasePointerCapture` queues `lostpointercapture`, and Chromium sometimes delivers it only with the next pointer event. Waiting for the class with the mouse still fails roughly one run in four; one real `mouse.move` with the button held makes it deterministic (40 of 40 passes). The viewer is correct: a real pointer never stops sending events. When a view test is flaky, reproduce it in a loop with `node --test --test-name-pattern=<name> test/views.e2e.mts` before changing anything.
