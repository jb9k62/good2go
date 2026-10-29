---
type: Lesson
title: "g2g-hook.mts imports only node: built-ins, g2g-rank.mts and g2g-qparse.mts"
description: The hook core never imports yaml or g2g-core, because it runs from the installed package, in projects whose node_modules may not exist.
tags: [hooks, edukai]
confidence: observed
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:03:18Z }
verified:
  - { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:08:56Z }
  - { by: claude-code/claude-sonnet-5-5, at: 2026-10-29T14:12:50Z }
stale_after: 2026-11-28T14:12:50Z
sources:
  - resource: src/g2g-hook.mts
    digest: sha256:1e94d59314bfdc9e
check:
  - { file: src/g2g-hook.mts, contains: "from './g2g-rank.mts'" }
  - { file: src/g2g-hook.mts, contains: "from './g2g-qparse.mts'" }
  - { file: src/g2g-hook.mts, lacks: "from 'yaml'" }
---

`g2g-hook.mts` may import three things: `node:` built-ins, `./g2g-rank.mts` and `./g2g-qparse.mts` (the open-questions parser, pure like rank, so the session brief can count open questions). It never
imports `g2g-core.mts` or `yaml`, and it never runs code from the project. The reason is where
it runs: from an installed package, in a project whose `node_modules` may not exist, with its
output put in front of an agent. An import that works in this repository can fail there. Keep
it this way. `test/edukai.test.mts` runs the hook from outside the repository to prove it
stands on its own.

## Caveats

- The check only looks for the two imports it names. It cannot tell you that no other
  dependency crept in. The test that runs the hook outside the repository is the real guard.
