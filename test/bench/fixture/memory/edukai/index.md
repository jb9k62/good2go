---
okf_version: "0.2"
---

# Parcel tracker: agent memory

What agents have learned while working on Parcel tracker, kept so the next session starts
knowing it. This is the **memory bundle**.

## Domains

One line per domain, written by `npm run edukai:index`. Do not edit between the markers.

<!-- edukai:index -->
* [Parcel tracker's code](/codebase-parcel-tracker/overview.md) - How the poller, the report, the notifier and the API behave, as agents have found them in the code
* [Parcel tracker's tooling](/tooling-parcel-tracker/overview.md) - How to run the tests and what the test scripts leave out
<!-- /edukai:index -->

## How it is kept

- A **lesson** is one claim, with the files it rests on, in
  `<domain>/lessons/YYYY-MM-DD-short-claim.md`. Each domain has one `overview.md`.
- `npm run edukai:recheck` lists the lessons that need an agent: a cited file is gone, a check
  no longer holds, a source changed, or the lesson is past its `stale_after`.
- A lesson that stopped being true is superseded by a new one, never edited or deleted.
- `npm run edukai:search -- search "words"` finds a lesson; `npm run edukai:validate` checks
  the bundle.

Update history: [log.md](/log.md).
