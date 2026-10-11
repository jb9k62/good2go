---
type: Overview
title: Parcel tracker's tooling
description: How to run the tests and what the test scripts leave out
tags: [overview, tests]
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T10:00:00Z }
---

Tests use `node --test` on TypeScript that Node runs directly. There are two suites: the unit
tests, and the integration tests that need the fake carriers. A green unit run says nothing about
the integration suite, which is easy to miss because it does not announce when it is skipped.

## Current understanding

- [The full suite needs test:full and PARCEL_FAKE_CARRIERS=1, or the integration tests skip silently](/tooling-parcel-tracker/lessons/2026-10-11-the-full-suite-skips-silently-without-fake-carriers.md)

## Open questions

- None recorded yet.
