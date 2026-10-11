---
type: Lesson
title: A webhook for a carrier with no entry in the webhook map is rejected with a 404
description: Webhook handlers are looked up by carrier id; there is no fallback parser.
tags: [webhooks, api]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:12Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:31Z }
stale_after: 2029-03-29T09:51:31Z
sources:
  - id: map
    resource: src/api/webhooks.ts
    digest: sha256:c7288745c0ee0e08
check:
  - { file: src/api/webhooks.ts, contains: "HttpError(404" }
---

Incoming webhooks are routed by carrier id through one map. A carrier that is not in the map gets a 404, even when it is a known carrier.[^map]

[^map]: The webhook map and its handler
