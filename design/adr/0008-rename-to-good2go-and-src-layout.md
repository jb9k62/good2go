---
type: Architectural Decision
title: "ADR-0008: Name everything good2go, and move the sources to src/"
description: Why the project, package, skills and plugin share one name, why the tools moved out of the skill into src/ and became g2g-*, and why the updater and the legacy migration were removed.
tags: [adr, naming, layout, distribution]
generated: { by: claude-code/claude-sonnet-5-5, at: 2026-10-10T18:30:00Z }
sources:
  - resource: package.json
  - resource: src/good2go.mts
  - resource: src/g2g-init.mts
  - resource: scripts/build.mts
  - resource: skills/good2go/SKILL.md
  - resource: skills/edukai/SKILL.md
---

# ADR-0008: Name everything good2go, and move the sources to src/

- **Status:** accepted
- **Date:** 2026-10-10
- **Deciders:** the maintainers

## Context

After [ADR-0006](/adr/0006-publish-the-tools-to-npm.md) the tools are an npm package, but the
repository still described an older shape. The project was called `okf-bootstrap`, the package
`@jb9k62/good2go`, and the skill `okf-bootstrap`. The tools sat in
`skills/okf-bootstrap/assets/` as `okf-*.mts`, so code lived inside a skill, and the
package build had to reach into a skills folder to compile it. Two things in the old
shape no longer earned their place: `okf-update.mts`, which reported changed templates, and
the migration that carried pre-0.7.0 projects from `scripts/okf-*.mts` copies to the package.
`npm update` does the first job, and the migration was already planned for removal.

## Decision

- **One name.** The project, the npm package, the skills and the Claude Code plugin are all
  `good2go`. `okf` stays the name of the *format*, the default design folder, the `okf:*` npm
  scripts and the `okf-widgets` workspace, because those name the thing, not the tool.
- **Sources live in `src/`.** They compile to `dist/` (`scripts/build.mts`), so they are a
  package's source, not a skill's asset. The templates sit at `src/templates/`.
- **Skills carry no code.** `skills/good2go/` (and `skills/edukai/`) hold `SKILL.md` and
  references only.
- **Tools are `g2g-*`:** `g2g-core`, `g2g-rank`, `g2g-view`, `g2g-mermaid`, `g2g-search`,
  `g2g-edukai`, `g2g-hook` (the runtime ones), and `g2g-install-hooks`, `g2g-new`,
  `g2g-skills`, `g2g-init` (the scaffolding ones). `g2g-start.mjs` is this repository's compile-cache
  loader. `good2go.mts` is the dispatcher.
- **The manifest is `.good2go.json`** at the project root.
- **`okf-update.mts` and the legacy migration are removed**, in 0.7.0 and not 0.9.0 as
  [the tools note](/good2go/tools.md) once planned. A project upgrades with `npm update`, and a
  re-run of `good2go init` keeps authored files.

## Consequences

- One name to search for, install and remember.
- Everything that named the old paths changed: npm scripts, the plugin hook, the pi extension,
  the tests, the edukai lessons' sources and the design bundle's `sources`.
- A project scaffolded before 0.7.0 no longer migrates itself. It keeps working with its
  copies, and may delete them by hand and add the dependency.
- Nobody is told when a release changes a template. That is a loss; a project can diff the
  package's `templates/` by hand.
- Old links and the old skill name break. The project is young enough that this is cheap now.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep `okf-bootstrap` as the skill name | Two names for one product, and the skill is no longer where the code is |
| Keep the sources under the skill | They compile to `dist/`; a skill is a prompt, not a package root |
| Rename everything `okf-*`, including the format's tools | `okf` is the format, and the tools are not the format |
| Keep the updater one more release | It had nothing left to update: scripts are no longer copied |
