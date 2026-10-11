---
type: Overview
title: Parcel tracker's code
description: How the poller, the report, the notifier and the API behave, as agents have found them in the code
tags: [overview, poller, report, api]
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T10:00:00Z }
---

Parcel tracker follows parcels across several carriers. The **poller** is the only part that
asks a carrier for news: it gives each call a time limit and retries a failed poll a fixed number
of times. Carriers that can push reach the API through webhooks instead, routed by carrier id
through one map.

The weekly report has one rule that surprises people: a week is a UTC week for everyone, because
finance reconciles against the totals. What a customer sees in their own zone is decided after
the grouping, in the API layer.

Carriers are listed in several independent places, and one of them is a generated snapshot, so
adding a carrier is not a one-file change. The notifier holds back repeat messages for the same
parcel, and list endpoints cap their page size.

## Current understanding

- [Adding a carrier touches four places, and the snapshot is generated](/codebase-parcel-tracker/lessons/2026-10-11-adding-a-carrier-touches-four-places.md)
- [A webhook for a carrier with no entry in the webhook map is rejected with a 404](/codebase-parcel-tracker/lessons/2026-10-11-webhooks-for-unlisted-carriers-get-a-404.md)
- [Report weeks are UTC by decision; display zones apply after grouping](/codebase-parcel-tracker/lessons/2026-10-11-report-weeks-are-utc-by-decision.md)
- [The poller retries a failed poll five times](/codebase-parcel-tracker/lessons/2026-10-11-the-poller-retries-five-times.md)
- [The notifier holds back a second message for the same parcel for thirty seconds](/codebase-parcel-tracker/lessons/2026-10-11-the-notifier-holds-back-messages-for-thirty-seconds.md)
- [List endpoints cap the page size at fifty](/codebase-parcel-tracker/lessons/2026-10-11-list-endpoints-cap-the-page-size-at-fifty.md)

## Open questions

- Which carriers will get webhooks next?
