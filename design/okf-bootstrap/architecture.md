---
type: Architecture
title: Architecture
description: The parts of okf-bootstrap, and how a scaffolded project ends up running the tools from the @jb9k62/good2go package.
tags: [architecture, skills, templates]
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:10:00Z }
sources:
  - resource: skills/okf-bootstrap/assets/bootstrap.mts
  - resource: package.json
  - resource: scripts/build.mts
  - resource: skills/okf-bootstrap/assets/good2go.mts
  - resource: .claude-plugin/plugin.json
---

# Architecture

okf-bootstrap has three layers. Skills tell an agent what to do. Tools do the mechanical work, and reach a project as the
npm package `@jb9k62/good2go` ([ADR-0006](/adr/0006-publish-the-tools-to-npm.md)).
Templates become the target project's own files. This repository also carries the harness
adapters and the demo, which are there to test and explain the rest.

## The layers

The diagram shows what lives in this repository and what a scaffolded project ends up with.
The arrows show how each part gets there.

```mermaid
flowchart TB
    subgraph repo["this repository"]
        skill["skills/okf-bootstrap<br/>SKILL.md, PLAYBOOK, EXPLAINERS, spec"]
        mem["skills/edukai<br/>lesson rules"]
        assets["assets/<br/>good2go + tools + templates"]
        build["scripts/build.mts<br/>compiles assets/ to dist/"]
        adapt["hooks/ + extensions/<br/>harness adapters"]
        demo["examples/demo/<br/>reference bundle"]
        maint["scripts/<br/>maintainer tools"]
        tests["test/<br/>unit + e2e"]
    end
    subgraph target["a scaffolded project"]
        docs["design bundle<br/>(okf/ by default)"]
        memdocs["edukai/ memory bundle"]
        pkg["node_modules/@jb9k62/good2go<br/>compiled dist/, the good2go command"]
        widgets["packages/okf-widgets<br/>optional React workspace"]
        viz["viz.html"]
    end
    skill --> assets
    assets --> build
    build -->|"npm publish"| pkg
    assets -->|"templates"| docs
    assets -->|"templates"| memdocs
    assets -->|"templates"| widgets
    pkg -->|"validate + render"| viz
    pkg -->|"init: copies templates"| docs
    mem --> memdocs
    adapt -->|"brief, cites, debt"| memdocs
    demo --> tests
    maint --> tests

    classDef skill fill:#e0e7ff,stroke:#3730a3,color:#1e1b4b
    classDef tool fill:#dcfce7,stroke:#166534,color:#0f2417
    classDef doc fill:#fef3c7,stroke:#b45309,color:#3b2503
    class skill,mem skill
    class assets,build,pkg,maint tool
    class docs,memdocs,viz,widgets,demo,adapt,tests doc
```

## The skills

`skills/okf-bootstrap/SKILL.md` is the entry point. Its frontmatter `description` is what a
harness matches against a request, and its body is the procedure to follow. It leaves the
detail to two guides: `references/PLAYBOOK.md` (layout, frontmatter, links, gates, review
checklist) and `references/EXPLAINERS.md` (tours, quizzes, widgets). It also vendors the OKF
spec under `references/okf-spec/`, with `UPSTREAM.json` recording the upstream commit.

`skills/edukai/SKILL.md` is the memory skill. It covers what is worth a lesson, what
confidence to claim, how to re-check, and how to supersede a lesson that stopped being true.
It has no tools of its own: it uses `okf-edukai.mts` and `okf-edukai-hook.mts` from the other
skill's assets.

## The tools

`assets/good2go.mts` is the command's dispatcher. It runs each tool as a child process, so
every tool keeps its own flags and exit codes. `npm run build` (`scripts/build.mts`) compiles
`assets/*.mts` to `dist/` with `tsconfig.build.json`, copies the templates and the skills
beside them, and `prepack` runs it so a publish cannot ship a stale `dist/`. Node will not
strip types under `node_modules`, which is why the package holds JavaScript.

`assets/bootstrap.mts` (the `good2go init` command) is the scaffold. It finds its templates
relative to its own file. Given a target directory, it writes the bundle skeleton (the design
bundle in `okf/`, or the folder `--design-dir` names), writes `.okf-bootstrap.json` at the
project root, adds a `@jb9k62/good2go` devDependency, and adds the `okf:` scripts (and, with
`--edukai`, the `edukai:` scripts) to `package.json`. It no longer copies tools into
`scripts/`. A re-run keeps authored files; only `--force` replaces them. `okf-new.mts` starts
a further small bundle, and `okf-skills.mts` installs the skills into an agent's skills
folder. The tools themselves are described in [the tools](/okf-bootstrap/tools.md).

## The templates

`assets/templates/` holds what a project receives:

- `okf/` (or the `--design-dir` folder) and `edukai/`: the reserved `index.md` and `log.md`, and the ADR index and template.
- `concept.md` and `explainer.md`: authoring aids. They are scaffolded outside the bundle, so
  the validator does not scan them.
- `okf-widgets/`: a React workspace with ten worked example widgets, their pure models and
  their tests. With `--widgets` it becomes the project's code, and is never replaced.

## The adapters

An adapter connects a harness to the memory bundle. `hooks/hooks.json` wires the Claude Code
plugin: a SessionStart hook, a PostToolUse hook on reads and edits, and a Stop hook. Each runs
`hooks/edukai-hook.mjs`, which loads `assets/okf-edukai-hook.mts`. `extensions/edukai.ts` is
the pi adapter for the same three moments, and it resolves the same core file from the assets
folder.

Both adapters are quiet in a project with no `edukai/`, and both swallow errors, because a
hook must never get in the agent's way. The commands they run are in
[agent memory](/okf-bootstrap/agent-memory.md).

## What is not in this repository

A scaffolded project holds no copy of the tools: it depends on the package, and upgrading is
`npm update`. This repository does not install its own package either. It runs the sources
from `skills/okf-bootstrap/assets/` and keeps no copy under `scripts/`
([ADR-0003](/adr/0003-run-the-tools-from-the-skill-assets.md)). Its own design bundle lives
in `design/`.
