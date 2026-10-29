---
type: Lesson
title: The release version is written once, in package.json
description: The tools read the version from package.json at run time; package-lock.json is bumped with it.
tags: [release, versioning]
confidence: observed
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:03:17Z }
verified:
  - { by: claude-code/claude-sonnet-5-5, at: 2026-10-10T18:14:16Z }
  - { by: process:edukai-recheck, at: 2026-10-29T14:12:59Z }
stale_after: 2026-11-28T14:12:59Z
sources:
  - resource: package.json
    digest: sha256:be08d7e6eb564cbe
  - resource: package-lock.json
    digest: sha256:14d6ec837229563d
  - resource: src/g2g-shared.mts
    digest: sha256:22156453a4ae53da
check:
  - { file: package.json, contains: '"version": "' }
  - { file: package-lock.json, contains: '"version": "' }
  - { file: src/g2g-shared.mts, contains: "export function packageVersion" }
---

A release has one version, in `package.json`. `packageVersion()` in `src/g2g-shared.mts` walks up
from a tool to the first `package.json` named `@jb9k62/good2go` and reads it, so `good2go
--version`, the version stamped into scaffolded frontmatter and `good2go hooks` all follow it.
`package-lock.json` carries it too and is bumped with `package.json`. To release, bump
`package.json` and the lock file, add a changelog entry, then tag. Earlier releases also kept the
version in two plugin manifests and in constants in the tools; those are gone.

## Caveats

- The checks here only prove that each file has a version field; the tests compare the values.
