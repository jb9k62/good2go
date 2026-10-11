---
type: Overview
title: Working in the good2go repository
description: How to build, test and release the skill, and the traps that are easy to miss
tags: [overview, tooling, ci]
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:35:00Z }
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

## Open questions

- The first publish (by hand, then trusted publishing and the `npm` environment) has not happened.
- Dependabot and `SECURITY.md` were added with the release workflow; not reviewed in memory.
