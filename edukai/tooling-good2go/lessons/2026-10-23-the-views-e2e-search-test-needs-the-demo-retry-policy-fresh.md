---
type: Lesson
title: The views e2e search test needs the demo retry policy fresh, which it is until 2027-10-20
description: test/views.e2e.mts expects the human-reviewed, fresh retry policy to lead a search for "retry policy"; its stale_after was moved to 2027-10-20, and past that date the views suite fails in a cascade.
tags: [testing, demo, e2e]
confidence: observed
generated: { by: claude-code/opus-5.5, at: 2026-10-23T08:46:00Z }
verified:
  - { by: claude-code/opus-5.5, at: 2026-10-23T08:47:49Z }
  - { by: process:edukai-recheck, at: 2026-10-29T14:12:59Z }
stale_after: 2026-11-28T14:12:59Z
supersedes: /tooling-good2go/lessons/2026-10-23-the-views-e2e-search-test-fails-once-the-demo-retry-policy-p.md
sources:
  - resource: test/views.e2e.mts
    digest: sha256:1a4b6e337eda0c4e
  - resource: examples/demo/okf/parcel-tracker/retry-policy.md
    digest: sha256:e8b6d46043e715ba
check:
  - { file: test/views.e2e.mts, contains: "a human-reviewed concept leads" }
  - { file: examples/demo/okf/parcel-tracker/retry-policy.md, contains: "stale_after: 2027-10-20T00:00:00Z" }
---

The views e2e test "ranked search lists results with trust and freshness" searches the demo for
"retry policy" and asserts that the first row is human-reviewed and "fresh, Nd left"[^1]. That
row is `parcel-tracker/retry-policy.md` only while it is fresh. Its `stale_after` ran out on
2026-10-20, which turned CI red; it was moved to 2027-10-20[^2]. Past that date the retries tour
ranks first, the assertion fails, and the search modal it leaves open makes about 25 later views
tests time out on clicks ("#search-modal intercepts pointer events"). When that happens, move the
date forward again, or make the test independent of the clock.

[^1]: test/views.e2e.mts
[^2]: examples/demo/okf/parcel-tracker/retry-policy.md
