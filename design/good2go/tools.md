---
type: Reference
title: The tools
description: One entry per script under src/, what it does, and the rule it must keep.
tags: [tools, scripts, reference]
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:15:00Z }
sources:
  - resource: src/g2g-init.mts
  - resource: src/g2g-view.mts
  - resource: src/g2g-mermaid.mts
  - resource: src/g2g-search.mts
  - resource: src/g2g-core.mts
  - resource: src/g2g-rank.mts
  - resource: src/g2g-edukai.mts
  - resource: src/g2g-hook.mts
  - resource: scripts/g2g-start.mjs
  - resource: src/good2go.mts
  - resource: src/g2g-new.mts
  - resource: src/g2g-build-view.mts
  - resource: src/g2g-skills.mts
  - resource: scripts/build.mts
  - resource: AGENTS.md
---

# The tools

Everything under `src/` is TypeScript that Node 24 runs directly, by
stripping the types. The one exception is `g2g-start.mjs`: it is plain JavaScript, because it
has to load before anything can be stripped. Projects do not receive these files. `npm run
build` compiles them to JavaScript in `dist/`, and that is what the package
`@jb9k62/good2go` publishes ([ADR-0006](/adr/0006-publish-the-tools-to-npm.md)). A project
runs them with the `good2go` command; this repository runs the sources.

| File | What it does |
| --- | --- |
| `good2go.mts` | The command's dispatcher. Runs each tool below as a child process, so each keeps its own flags and exit codes. Subcommands `init`, `new`, `validate`, `fix`, `view`, `mermaid`, `search`, `recheck`, `edukai`, `hook`, `skills` |
| `g2g-init.mts` | `good2go init`: writes the bundle skeleton, adds the `@jb9k62/good2go` devDependency and the npm scripts, writes `.good2go.json` at the project root. Copies no tools. `--design-dir`, `--widgets`, `--edukai`, `--no-scripts`, `--force` |
| `g2g-new.mts` | `good2go new`: starts a further small bundle (index, log, one starter page) in a new folder. `--name`, `--intent`, `--project-dir`, `--force`; never overwrites a file; adds the folder to the manifest's `bundles` |
| `g2g-build-view.mts` | `good2go build-view` and `good2go open`: runs the viewer (`--summary`) on every bundle the manifest lists, writes a one-file landing page at the project root, and for `open` starts the default browser on it or on one bundle. `--widgets`, `--strict`, `--no-open`, `--project-dir` |
| `g2g-skills.mts` | `good2go skills`: copies the skills (instructions and references only) into an agent's skills folder. `--claude`, `--pi`, `--agents`, `--force`, `--dir` |
| `g2g-view.mts` | The validator and the viewer, and the render gate under `--check-render`. `--validate`, `--fix`, `--strict`, `--out`, `--widgets` |
| `g2g-mermaid.mts` | The Mermaid parse gate: extracts every fenced `mermaid` block and runs it through `mmdc`. `--json`, `--timeout`, `--jobs` |
| `g2g-search.mts` | Ranked, freshness-aware search over a bundle. Commands `facets`, `search`, `show`, `related`, `stale`; `--bundle`, `--json`, `--explain`, `--no-cache`, `--strict` |
| `g2g-core.mts` | Parsing shared by the viewer and search: frontmatter, trust tier, staleness, links. Loads `yaml` on the first parse, so a search answered from its cache never loads it |
| `g2g-rank.mts` | The ranking and its inverted index. Run by `g2g-search`, and inlined into `viz.html` for the viewer's search box |
| `g2g-edukai.mts` | The memory bundle's tool: `new`, `verify`, `supersede`, `index`, `recheck`. `verify`, `supersede` and `recheck` also work on a design bundle with `--bundle okf` |
| `g2g-hook.mts` | What the harness adapters run (`brief`, `cites`, `debt`, `hook`) and the code that derives a lesson's state |
| `g2g-start.mjs` | Loaded first by this repository's own npm scripts: turns on Node's compile cache, so a tool's TypeScript is stripped once. Not copied to projects, and not in the package |

## The rules each must keep

These are not matters of style. Each rule exists because breaking it breaks something a user
depends on, and the test suite enforces the first two.

- **`g2g-rank.mts` stays pure.** No imports, and nothing that touches `fs`, `path`, `process`
  or the DOM. The viewer inlines it into the page with its types stripped, so one ranking
  serves the CLI and the search box. An import here would either break the page or force a
  bundler on it ([ADR-0004](/adr/0004-viz-html-stays-one-file.md)).
- **`g2g-hook.mts` stays dependency-free.** It imports only `node:` built-ins and
  `./g2g-rank.mts`, never `g2g-core.mts` or `yaml`, and it never runs code from the project.
  It runs from an installed plugin where the project's `node_modules` may not exist, and its
  output is put in front of an agent. A test runs it outside the repository to prove it. The
  plugin keeps its own copy, so the package never supplies the hook.
- **Tools stay dependency-light.** Nothing under `src/` imports from outside `src/`, and
  templates are resolved relative to the tool's own file. That way the compiled copy in
  `dist/` finds its sibling `templates/` as the source finds its own.
- **Erasable TypeScript only.** No enums, namespaces or parameter properties, and imports name
  the real `.mts` extension. `tsconfig.json` sets `erasableSyntaxOnly`, which is what lets
  this repository run the tools with no build step, and keeps the publish-time compile a
  plain type strip.
- **`g2g-start.mjs` stays plain.** No TypeScript, and no imports beyond `node:` built-ins. A
  tool must still run without it, only slower. Only this repository's npm scripts use it.
- **Exit codes are the contract.** Every gate returns 0 (pass), 1 (broken, named by file) or
  2 (could not run). It never returns 0 when the check did not run; see
  [quality gates](/good2go/gates.md).

## Why a package, not copies

A project depends on `@jb9k62/good2go` instead of committing the tools. Its repository holds
its knowledge and a one-line dependency, the lockfile records the version, and an upgrade is
`npm update`, which Dependabot and Renovate already understand. The cost is that a project can
no longer edit a tool in place, and the tools are a download from a registry. The templates
are still copied, because they become the project's own files; a new release's templates
reach a project only when it re-runs `good2go init`, which keeps authored files. This
repository is the exception: it runs the tools where they live
([ADR-0003](/adr/0003-run-the-tools-from-the-skill-assets.md)).
