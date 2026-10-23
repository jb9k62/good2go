---
type: Lesson
title: The views e2e search test fails once the demo retry policy passes its stale_after date
description: test/views.e2e.mts expects the human-reviewed, fresh retry policy to lead a search for "retry policy"; after its stale_after (2026-10-20) it drops below the retries tour and the suite cascades.
tags: [testing, demo, e2e]
confidence: tested
generated: { by: claude-code/opus-5.5, at: 2026-10-23T08:40:35Z }
verified:
  - { by: claude-code/opus-5.5, at: 2026-10-23T08:40:47Z }
stale_after: 2026-11-22T08:40:47Z
sources:
  - resource: test/views.e2e.mts
    digest: sha256:50d91a7dbfb7c1a9
  - resource: examples/demo/okf/parcel-tracker/retry-policy.md
    digest: sha256:d5c46fb185328b55
check:
  - { file: test/views.e2e.mts, contains: "a human-reviewed concept leads" }
  - { file: examples/demo/okf/parcel-tracker/retry-policy.md, contains: "stale_after: 2026-10-20T00:00:00Z" }
---

The views e2e test "ranked search lists results with trust and freshness" searches the demo for
"retry policy" and asserts that the first row is human-reviewed and "fresh, Nd left"[^1]. That
row is `parcel-tracker/retry-policy.md` only while it is fresh; its `stale_after` is
2026-10-20[^2]. After that date the retries tour ranks first, the assertion fails, and the
search modal it leaves open makes about 25 later views tests time out on clicks. On 2026-10-23,
with that date moved to December, all 79 views tests passed. So a wall of views failures with
"#search-modal intercepts pointer events" is this date, not the change under test.

## Caveats

- The fix (move the date, or make the test independent of the clock) is the maintainers' call;
  this lesson records the cause only.

[^1]: test/views.e2e.mts
[^2]: examples/demo/okf/parcel-tracker/retry-policy.md
