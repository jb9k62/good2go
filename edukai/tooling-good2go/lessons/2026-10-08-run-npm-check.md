---
type: Lesson
title: Run npm run check before finishing
description: npm run check is the pre-commit gate, and it now validates both of this repository's bundles.
tags: [ci, testing]
confidence: observed
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:03:17Z }
verified:
  - { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:07:51Z }
  - { by: process:edukai-recheck, at: 2026-10-29T14:12:59Z }
  - { by: claude-code/claude-sonnet-5-5, at: 2026-10-10T18:14:15Z }
stale_after: 2026-11-28T14:12:59Z
sources:
  - resource: package.json
    digest: sha256:be08d7e6eb564cbe
check:
  - { file: package.json, contains: "npm run test:views && npm run g2g:validate && npm run edukai:validate" }
---

Run `npm run check` before you call a change finished. It is one command that chains the
rest, in this order: `npm run typecheck` (the tools and the widget workspace), `npm test`
(`node --test test/*.test.mts`, plus the widget workspace's tests), `npm run build` (compiles
`src/` to `dist/`, as the published package is), `npm run test:views` (the Chromium view tests), then `g2g:validate` and `edukai:validate` on this repository's own
`design/` and `edukai/` bundles.

## Caveats

- Green does not prove the views render: the browser tests skip when there is no Chromium.
  Install Playwright's Chromium, or set `OKF_CHROMIUM`, to make them run.
- CI runs `check` on Node 24 and 26.
