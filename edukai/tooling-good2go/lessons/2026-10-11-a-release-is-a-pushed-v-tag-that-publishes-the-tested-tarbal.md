---
type: Lesson
title: "A release is a pushed v-tag that publishes the tested tarball"
description: "Bump the version in package.json (and the lock), move the changelog's ## Unreleased entries under a dated heading, commit, then push a tag vX.Y.Z."
tags: [release, npm]
confidence: observed
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:29:38Z }
verified:
  - { by: claude-code/sonnet-5.5, at: 2026-10-11T09:30:08Z }
  - { by: process:edukai-recheck, at: 2026-10-29T14:12:59Z }
stale_after: 2026-11-28T14:12:59Z
sources:
  - resource: .github/workflows/release.yml
    digest: sha256:daddde790f9737b8
  - resource: docs/RELEASING.md
    digest: sha256:8b35826ac8dcf3df
check:
  - { file: .github/workflows/release.yml, contains: "environment: npm" }
  - { file: .github/workflows/release.yml, contains: "--provenance --access public" }
---

Bump the version in `package.json` (and the lock), move the changelog's `## Unreleased` entries under a dated heading, commit, then push a tag `vX.Y.Z`. `.github/workflows/release.yml` fails if the tag is not `v` plus the package version, installs with `--ignore-scripts`, tests, packs and smoke-tests one tarball in its `verify` job, then the `publish` job (environment `npm`, a required reviewer) runs `npm publish` on that same tarball with `--provenance` through npm trusted publishing; there is no `NPM_TOKEN`. The first version has to be published by hand with `--provenance=false`, because trusted publishing needs an existing package. As of 2026-10-11 nothing is published: `npm view @jb9k62/good2go` returns 404 and the latest tag is `v0.6.0`, although `package.json` says 0.7.0.

## Caveats

- Full setup steps are in `docs/RELEASING.md`.
- The "nothing published" fact will go stale as soon as the first release is made.
