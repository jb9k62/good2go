---
type: Lesson
title: The full suite needs test:full and PARCEL_FAKE_CARRIERS=1, or the integration tests skip silently
description: npm test runs unit tests only; the integration tests run through npm run test:full and skip without a message unless the fake carriers are switched on.
tags: [tests, integration]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:13Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:51:32Z }
stale_after: 2029-03-29T09:51:32Z
sources:
  - id: scripts
    resource: package.json
    digest: sha256:89057a0f204fc3a4
  - id: support
    resource: test/integration/support.ts
    digest: sha256:0b528e9546f0aa30
check:
  - { file: package.json, contains: "\"test:full\"" }
  - { file: test/integration/support.ts, contains: "PARCEL_FAKE_CARRIERS" }
---

`npm test` runs the unit tests only, so it can pass while the integration tests are red. They run through `npm run test:full`, and they skip silently, with a passing exit code, unless `PARCEL_FAKE_CARRIERS=1` is set in the environment.[^scripts]

[^scripts]: The npm scripts and the gate that skips the integration tests
