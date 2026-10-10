---
type: Application
title: Overview
description: What good2go ships, who it is for, and what it deliberately leaves out.
tags: [overview, skills, bundles]
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:10:00Z }
sources:
  - resource: skills/good2go/SKILL.md
  - resource: skills/edukai/SKILL.md
  - resource: README.md
  - resource: package.json
---

# Overview

good2go is two agent skills, for [pi](https://pi.dev) and
[Claude Code](https://claude.com/claude-code), that set up and maintain knowledge bundles in
another project. It is not an application and has no runtime of its own. What ships is
markdown that tells an agent what to do, and a set of tools, published to npm as
`@jb9k62/good2go` with a `good2go` command ([ADR-0006](/adr/0006-publish-the-tools-to-npm.md)),
that the agent runs in the target project.

There are two bundles because there are two readers
([ADR-0002](/adr/0002-two-bundles-design-and-memory.md)):

| Bundle | Reader | Unit | Written when |
| --- | --- | --- | --- |
| design bundle (`okf/` by default, `--design-dir` to change) | the team, in a browser | a concept: one topic, many claims | the design changes |
| `edukai/` | the agent, through harness hooks | a lesson: one claim, with the files it rests on | an agent learns something |

## What ships

| Path | What it is |
| --- | --- |
| `skills/good2go/` | The design-bundle skill: `SKILL.md`, the playbook and explainer guides, the vendored OKF spec, the tools and the templates |
| `skills/edukai/` | The memory-bundle skill: when a lesson is worth writing, how sure to be, and what to do with one that stopped being true |
| `src/` | The tools (`good2go.mts` and `okf-*.mts`) and the templates a scaffold copies. `npm run build` compiles them to `dist/` for the package; `g2g-start.mjs` is only for this repository's own npm scripts |
| `hooks/`, `extensions/` | The harness adapters: Claude Code hooks and a pi extension that read the memory bundle at the moments it matters |
| `scripts/` | Maintainer tools only: build the package, install the skill, refresh the vendored spec, regenerate screenshots |
| `design/` | This repository's own design bundle (this one) |
| `test/` | Unit tests and Chromium end-to-end tests |
| `examples/demo/` | A made-up service documented with both bundles; the reference for a scaffolded project |
| `vendor/knowledge-catalog` | A git submodule pinning the upstream spec commit |

## What it leaves out

Each of these is a choice, not a gap.

- **No service.** The tools are an npm dev dependency of the target project, run with
  `good2go` (or `npx @jb9k62/good2go@<version>` where there is no `package.json`). They read
  the project's own files and write `viz.html` next to the bundle. Nothing calls home, and
  no tool is copied into the project.
- **No build step in a project.** The sources are TypeScript that Node runs directly, and this
  repository runs them that way. Node will not strip types under `node_modules`, so only the
  published package is compiled, at publish time. A project needs no compiler, and its
  `package.json` `"type"` is never changed. See
  [the tools](/good2go/tools.md).
- **No hosted viewer.** `viz.html` is one self-contained file, and its libraries come from a
  pinned CDN ([ADR-0004](/adr/0004-viz-html-stays-one-file.md)).
- **No automatic writing.** The scaffold creates the skeleton and the gates. A person or an
  agent writes the concepts, and the skill's rule is that no claim goes in until it has been
  checked against the code.

## Reading on

- [Architecture](/good2go/architecture.md): the parts and how a scaffolded project uses them
- [The tools](/good2go/tools.md): one entry per script, and the rule each must keep
- [Quality gates](/good2go/gates.md): the exit-code contract and what each gate proves
- [Testing and CI](/good2go/testing.md): how this repository checks itself
