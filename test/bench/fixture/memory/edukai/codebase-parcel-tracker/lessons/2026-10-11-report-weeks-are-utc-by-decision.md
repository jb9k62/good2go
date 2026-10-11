---
type: Lesson
title: Report weeks are UTC by decision; display zones apply after grouping
description: Weekly totals are grouped on UTC weeks because finance reconciles against them; a viewer zone only changes how results are shown.
tags: [report, timezones]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:12Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:31Z }
stale_after: 2029-03-29T09:51:31Z
sources:
  - id: week
    resource: src/report/week.ts
    digest: sha256:2bb64a5b5a903002
  - id: rollup
    resource: src/report/rollup.ts
    digest: sha256:39101eaf9d130f2d
  - id: customerreport
    resource: src/api/customer-report.ts
    digest: sha256:4d40aee6af1bc622
check:
  - { file: src/report/week.ts, contains: "getUTCDay" }
  - { file: src/api/customer-report.ts, contains: "weeklyTotals(parcels)" }
---

A report week starts on Monday 00:00 UTC for everyone, by decision: the weekly totals are reconciled with finance and must not depend on who is looking. A viewer's time zone belongs to what the API layer shows that viewer, after the totals are grouped; it never goes inside the week calculation or the roll-up.[^week]

[^week]: The week calculation, the roll-up and the customer report
