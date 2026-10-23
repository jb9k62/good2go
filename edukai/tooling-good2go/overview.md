---
type: Overview
title: Working in the good2go repository
description: How to build, test and release the skill, and the traps that are easy to miss
tags: [overview, tooling, ci]
generated: { by: claude-code/opus-5.5, at: 2026-10-23T09:06:00Z }
---

This repository is the source of the npm package `@jb9k62/good2go`: two agent skills, the
tools under `src/` and their tests. Nothing is published yet (`npm view` returns 404; the last
tag is `v0.6.0`, while `package.json` says 0.7.0). If you
remember one command, make it `npm run check`, and run it before you finish. It typechecks the
tools and the widget workspace, runs the unit tests and the Chromium view tests, and validates
this repository's own `design/` and `edukai/` bundles. One warning: the browser tests skip when
there is no Chromium, so a green run does not prove the views render.

The tools are TypeScript, and in this repository Node runs them directly by stripping the
types, so only erasable TypeScript is allowed and imports name the real `.mts` extension. The
published package cannot do that, because Node will not strip types under `node_modules`: `npm
run build` compiles `src/` into `dist/`, which is what ships. Projects never get copies of the
tools; they depend on the package. This repository's own npm scripts are named `g2g:` and
`edukai:` (never `okf:`) and run the tools from `src/`.

A release is a pushed `vX.Y.Z` tag. CI tests and packs one tarball, and a reviewer-approved job
publishes that file through npm trusted publishing, with no token. The version lives only in
`package.json` and the lock.

One thing is easy to break by accident: the demo's memory lessons hold digests of files under
`examples/demo/`. Edit one of those files and a lesson changes state, and so does a report that a
test pins.

Dependencies install with a two-day cool-down (`.npmrc`); a bump moves the CDN pins and Action SHAs too. The benchmark in `test/bench/` uses a stub `claude` in `npm test`; only `npm run bench -- --go`
spends money. Keep a report by copying it to `test/bench/reports/`; results are gitignored.

Last, never edit the vendored OKF spec by hand. `npm run spec -- status` tells you whether
upstream has moved, and `npm run spec -- update` brings the new version in.

## Current understanding

- [The package ships compiled JavaScript built into dist/](/tooling-good2go/lessons/2026-10-11-the-package-ships-compiled-javascript-built-into-dist.md)
- [A release is a pushed v-tag that publishes the tested tarball](/tooling-good2go/lessons/2026-10-11-a-release-is-a-pushed-v-tag-that-publishes-the-tested-tarbal.md)
- [npm scripts are g2g: and edukai:, not okf:](/tooling-good2go/lessons/2026-10-11-this-repository-s-npm-scripts-are-g2g-and-edukai-not-okf.md)
- [Run npm run check before finishing](/tooling-good2go/lessons/2026-10-08-run-npm-check.md)
- [The tools are TypeScript that Node runs with no build step](/tooling-good2go/lessons/2026-10-08-typescript-runs-directly.md)
- [The demo's lessons pin digests of files under examples/demo](/tooling-good2go/lessons/2026-10-08-demo-lessons-are-pinned.md)
- [The release version is written once, in package.json](/tooling-good2go/lessons/2026-10-08-version-is-in-package-json.md)
- [The vendored OKF spec is refreshed with npm run spec, never by hand](/tooling-good2go/lessons/2026-10-08-spec-is-vendored.md)
- [Dependencies install with a two-day cool-down, and CDN pins move with them](/tooling-good2go/lessons/2026-10-11-dependencies-install-with-a-two-day-cool-down.md)
- [Headless Claude Code shows hook output in its stream only with --include-hook-events](/tooling-good2go/lessons/2026-10-11-hook-events-flag.md)
- [A headless run denies env-prefixed Bash commands unless an allow rule names them](/tooling-good2go/lessons/2026-10-11-headless-bash-allow-list.md)
- [Benchmark results are gitignored, so a report is committed as a copy under test/bench/reports](/tooling-good2go/lessons/2026-10-11-bench-reports-are-tracked-copies.md)
- [The memory hooks read a cache that only edukai recheck or index writes](/tooling-good2go/lessons/2026-10-11-hooks-read-a-cache.md)
- [The first benchmark raised correctness on d2 and d3 but did not lower cost where both arms passed](/tooling-good2go/lessons/2026-10-11-first-benchmark-result.md)
- [The views e2e search test needs the demo retry policy fresh, which it is until 2027-10-20](/tooling-good2go/lessons/2026-10-23-the-views-e2e-search-test-needs-the-demo-retry-policy-fresh.md)

## Open questions

- The first publish (by hand, then trusted publishing and the `npm` environment) has not happened.
- Dependabot and `SECURITY.md` were added with the release workflow; not reviewed in memory.
- The benchmark's budget-stop detection and the Stop hook's turns are unseen; see `test/bench/TODO.md`.
- The views test for a divider drag that loses its pointer capture (`A: a drag whose capture is lost…`) failed in two of ten full `test:views` runs of the contents change, and passed in the other eight, in four runs of the untouched HEAD, and when run alone. It is not traced. Treat one failure of it as unproven until a run of the suite shows it again.
