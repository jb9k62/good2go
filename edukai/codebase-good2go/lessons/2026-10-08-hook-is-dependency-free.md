---
type: Lesson
title: "g2g-hook.mts imports only node: built-ins and g2g-rank.mts"
description: The hook core never imports yaml or g2g-core, because it runs from an installed plugin with no project node_modules.
tags: [hooks, edukai]
confidence: observed
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:03:18Z }
verified:
  - { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:08:56Z }
  - { by: claude-code/claude-sonnet-5-5, at: 2026-10-10T18:14:15Z }
stale_after: 2026-11-09T18:14:15Z
sources:
  - resource: src/g2g-hook.mts
    digest: sha256:06cfcffd00ae1211
check:
  - { file: src/g2g-hook.mts, contains: "from './g2g-rank.mts'" }
  - { file: src/g2g-hook.mts, lacks: "from 'yaml'" }
---

`g2g-hook.mts` may import two things: `node:` built-ins and `./g2g-rank.mts`. It never
imports `g2g-core.mts` or `yaml`, and it never runs code from the project. The reason is where
it runs: from an installed package, in a project whose `node_modules` may not exist, with its
output put in front of an agent. An import that works in this repository can fail there. Keep
it this way. `test/edukai.test.mts` runs the hook from outside the repository to prove it
stands on its own.

## Caveats

- The check only looks for the two imports it names. It cannot tell you that no other
  dependency crept in. The test that runs the hook outside the repository is the real guard.
