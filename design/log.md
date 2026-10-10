# Bundle update log

## 2026-10-10
* **Renamed**: the project, package, skills and plugin are all `good2go`; the sources moved
  from `skills/okf-bootstrap/assets/` to `src/`, the tools became `g2g-*`, and the updater and
  the legacy migration were removed ([ADR-0008](/adr/0008-rename-to-good2go-and-src-layout.md)).
* **Implemented**: [ADR-0006](/adr/0006-publish-the-tools-to-npm.md) in 0.7.0: the tools ship as
  the `@jb9k62/good2go` package and projects no longer hold copies. [ADR-0005](/adr/0005-name-bundles-by-what-they-hold.md)
  is accepted in part: the design bundle is the first one bootstrapped and its folder is
  configurable (`--design-dir`), and `good2go new` scaffolds any further bundle.

## 2026-10-09
* **Proposed**: two decision records, neither implemented yet. Bundles named for what they
  hold, with `design/` as the default and an optional `ops/`
  ([ADR-0005](/adr/0005-name-bundles-by-what-they-hold.md)), and the tools published to npm
  as `@jb9k62/good2go` ([ADR-0006](/adr/0006-publish-the-tools-to-npm.md)).

## 2026-10-08
* **Creation**: Established the good2go OKF v0.2 bundle: root `index.md`, `log.md`, the
  ADR area, and the first concepts and tours.
* **Self-hosting**: the tools run from `src/`, not from generated
  copies under `scripts/`, so this bundle is checked by the same tools it ships
  ([ADR-0003](/adr/0003-run-the-tools-from-the-skill-assets.md)).
* **Memory bundle**: added `edukai/` beside this bundle, with the first lessons about the
  repository ([ADR-0002](/adr/0002-two-bundles-design-and-memory.md)).
* **Copy-edit**: rewrote the prose of the concepts, decision records and tours to be plainer
  and to teach as they go. Diagrams, quizzes and frontmatter are unchanged. Corrected four
  claims on the way: `okf:recheck` has nothing to report until a concept is pinned (ADR-0001),
  CI validates the bundles but does not run the memory re-check (ADR-0001), `npm run check`
  includes the Chromium view tests, and tests compare the version in all four places
  ([testing and CI](/good2go/testing.md)).
