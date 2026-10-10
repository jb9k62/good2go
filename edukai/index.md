---
okf_version: "0.2"
---

# good2go: agent memory

What agents have learned while working on **good2go**, kept so the next session starts
knowing it. This is the **memory bundle**. The design bundle, written for the team, is in
`design/`.

## Domains

One line per domain, written by `npm run edukai:index`. Do not edit between the markers.

<!-- edukai:index -->
* [The good2go codebase](/codebase-good2go/overview.md) - What each tool and adapter must never do, and why
* [Working in the good2go repository](/tooling-good2go/overview.md) - How to build, test and release the skill, and the traps that are easy to miss
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
