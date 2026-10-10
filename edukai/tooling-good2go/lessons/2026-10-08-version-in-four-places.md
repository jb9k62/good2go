---
type: Lesson
title: The release version lives in four places that must match
description: package.json, both plugin manifests and g2g-init.mts all carry the version, and tests compare them.
tags: [release, versioning]
confidence: observed
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:03:17Z }
verified:
  - { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:07:52Z }
  - { by: process:edukai-recheck, at: 2026-10-08T20:16:39Z }
  - { by: claude-code/claude-sonnet-5-5, at: 2026-10-10T17:42:21Z }
stale_after: 2026-11-09T17:42:21Z
sources:
  - resource: package.json
    digest: sha256:acb63c3efe5688f1
  - resource: package-lock.json
    digest: sha256:543c7909b5b776b4
  - resource: .claude-plugin/plugin.json
    digest: sha256:5086b8c85d50f8ef
  - resource: .claude-plugin/marketplace.json
    digest: sha256:009f67438d46b769
  - resource: src/g2g-init.mts
    digest: sha256:73d2be282c53136f
check:
  - { file: package.json, contains: '"version": "' }
  - { file: package-lock.json, contains: '"version": "' }
  - { file: .claude-plugin/plugin.json, contains: '"version": "' }
  - { file: .claude-plugin/marketplace.json, contains: '"version": "' }
  - { file: src/g2g-init.mts, contains: "const VERSION = '" }
---

A release has one version, written in four places that must match: `package.json`,
`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and the `VERSION` constant
in `g2g-init.mts` (`good2go.mts` has a copy too, and a test compares it), which is stamped into scaffolded frontmatter as the producer.
`package-lock.json` carries it too and is bumped with `package.json`. Tests catch a
mismatch: `test/init.test.mts` compares `VERSION` and the plugin manifest with
`package.json`, and the release-metadata test in `test/edukai.test.mts` compares
`package.json`, both manifests and `package-lock.json`. To release, bump all of them, add a
changelog entry, then tag.

## Caveats

- The checks here only prove that each file has a version field. They do not compare the
  values; the tests do.
