---
type: Reference
title: The tools
description: One entry per script under assets/, what it does, and the rule it must keep.
tags: [tools, scripts, reference]
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:15:00Z }
sources:
  - resource: skills/okf-bootstrap/assets/bootstrap.mts
  - resource: skills/okf-bootstrap/assets/okf-view.mts
  - resource: skills/okf-bootstrap/assets/okf-mermaid.mts
  - resource: skills/okf-bootstrap/assets/okf-search.mts
  - resource: skills/okf-bootstrap/assets/okf-core.mts
  - resource: skills/okf-bootstrap/assets/okf-rank.mts
  - resource: skills/okf-bootstrap/assets/okf-edukai.mts
  - resource: skills/okf-bootstrap/assets/okf-edukai-hook.mts
  - resource: skills/okf-bootstrap/assets/okf-start.mjs
  - resource: skills/okf-bootstrap/assets/okf-update.mts
  - resource: skills/okf-bootstrap/assets/good2go.mts
  - resource: skills/okf-bootstrap/assets/okf-new.mts
  - resource: skills/okf-bootstrap/assets/okf-skills.mts
  - resource: scripts/build.mts
  - resource: AGENTS.md
---

# The tools

Everything under `skills/okf-bootstrap/assets/` is TypeScript that Node 24 runs directly, by
stripping the types. The one exception is `okf-start.mjs`: it is plain JavaScript, because it
has to load before anything can be stripped. Projects do not receive these files. `npm run
build` compiles them to JavaScript in `dist/`, and that is what the package
`@jb9k62/good2go` publishes ([ADR-0006](/adr/0006-publish-the-tools-to-npm.md)). A project
runs them with the `good2go` command; this repository runs the sources.

| File | What it does |
| --- | --- |
| `good2go.mts` | The command's dispatcher. Runs each tool below as a child process, so each keeps its own flags and exit codes. Subcommands `init`, `new`, `validate`, `fix`, `view`, `mermaid`, `search`, `recheck`, `edukai`, `hook`, `update`, `skills` |
| `bootstrap.mts` | `good2go init`: writes the bundle skeleton, adds the `@jb9k62/good2go` devDependency and the npm scripts, writes `.okf-bootstrap.json` at the project root. Copies no tools. `--design-dir`, `--widgets`, `--edukai`, `--tools-only`, `--no-scripts`, `--force` |
| `okf-new.mts` | `good2go new`: starts a further small bundle (index, log, one starter page) in a new folder. `--name`, `--intent`, `--project-dir`, `--force`; never overwrites a file |
| `okf-skills.mts` | `good2go skills`: copies the skills (instructions and references only) into an agent's skills folder. `--claude`, `--pi`, `--agents`, `--force`, `--dir` |
| `okf-view.mts` | The validator and the viewer, and the render gate under `--check-render`. `--validate`, `--fix`, `--strict`, `--out`, `--widgets` |
| `okf-mermaid.mts` | The Mermaid parse gate: extracts every fenced `mermaid` block and runs it through `mmdc`. `--json`, `--timeout`, `--jobs` |
| `okf-search.mts` | Ranked, freshness-aware search over a bundle. Commands `facets`, `search`, `show`, `related`, `stale`; `--bundle`, `--json`, `--explain`, `--no-cache`, `--strict` |
| `okf-core.mts` | Parsing shared by the viewer and search: frontmatter, trust tier, staleness, links. Loads `yaml` on the first parse, so a search answered from its cache never loads it |
| `okf-rank.mts` | The ranking and its inverted index. Run by `okf-search`, and inlined into `viz.html` for the viewer's search box |
| `okf-edukai.mts` | The memory bundle's tool: `new`, `verify`, `supersede`, `index`, `recheck`. `verify`, `supersede` and `recheck` also work on a design bundle with `--bundle okf` |
| `okf-edukai-hook.mts` | What the harness adapters run (`brief`, `cites`, `debt`, `hook`) and the code that derives a lesson's state |
| `okf-start.mjs` | Loaded first by this repository's own npm scripts: turns on Node's compile cache, so a tool's TypeScript is stripped once. Not copied to projects, and not in the package |
| `okf-update.mts` | Reports which scaffolded templates the installed package has changed since the project was scaffolded. Runs offline; `--write` puts the release's copies under `.okf-update/` for a hand diff. It never modifies a project file |

## The rules each must keep

These are not matters of style. Each rule exists because breaking it breaks something a user
depends on, and the test suite enforces the first two.

- **`okf-rank.mts` stays pure.** No imports, and nothing that touches `fs`, `path`, `process`
  or the DOM. The viewer inlines it into the page with its types stripped, so one ranking
  serves the CLI and the search box. An import here would either break the page or force a
  bundler on it ([ADR-0004](/adr/0004-viz-html-stays-one-file.md)).
- **`okf-edukai-hook.mts` stays dependency-free.** It imports only `node:` built-ins and
  `./okf-rank.mts`, never `okf-core.mts` or `yaml`, and it never runs code from the project.
  It runs from an installed plugin where the project's `node_modules` may not exist, and its
  output is put in front of an agent. A test runs it outside the repository to prove it. The
  plugin keeps its own copy, so the package never supplies the hook.
- **Tools stay dependency-light.** Nothing under `assets/` imports from outside `assets/`, and
  templates are resolved relative to the tool's own file. That way the compiled copy in
  `dist/` finds its sibling `templates/` as the source finds its own.
- **Erasable TypeScript only.** No enums, namespaces or parameter properties, and imports name
  the real `.mts` extension. `tsconfig.json` sets `erasableSyntaxOnly`, which is what lets
  this repository run the tools with no build step, and keeps the publish-time compile a
  plain type strip.
- **`okf-start.mjs` stays plain.** No TypeScript, and no imports beyond `node:` built-ins. A
  tool must still run without it, only slower. Only this repository's npm scripts use it.
- **Exit codes are the contract.** Every gate returns 0 (pass), 1 (broken, named by file) or
  2 (could not run). It never returns 0 when the check did not run; see
  [quality gates](/okf-bootstrap/gates.md).

## Why a package, not copies

A project depends on `@jb9k62/good2go` instead of committing the tools. Its repository holds
its knowledge and a one-line dependency, the lockfile records the version, and an upgrade is
`npm update`, which Dependabot and Renovate already understand. The cost is that a project can
no longer edit a tool in place, and the tools are a download from a registry. The templates
are still copied, because they become the project's own files; `okf-update.mts` reports when
a release changes one. This repository is the exception: it runs the tools where they live
([ADR-0003](/adr/0003-run-the-tools-from-the-skill-assets.md)).

## Legacy migration (to be removed)

Projects scaffolded before 0.7.0 hold copies of the tools in `scripts/okf-*.mts` and a manifest
at `scripts/.okf-bootstrap.json`. Two pieces of code exist only to carry them over. This logic
is deprecated. It stays for one or two minor releases after 0.7.0 and is planned for removal
in 0.9.0. The CLI keeps nothing else legacy.

- **`bootstrap.mts` migration.** On a run in an old project it reads the legacy manifest, removes
  each recorded `scripts/okf-*` file whose hash still matches, names (and keeps) any the
  project edited, deletes the legacy manifest, and removes `scripts/` if it is then empty.
- **`okf-update.mts` fallback.** When the project has no root `.okf-bootstrap.json`, it reads
  the legacy manifest path instead.

To remove it in 0.9.0, delete:

- `LEGACY_MANIFEST` in `bootstrap.mts`, the `readManifest(LEGACY_MANIFEST)` fallback in
  `previousManifest()`, and the migration block under "tooling" (the `migrated` and
  `editedCopies` lists with the loop and the cleanup that use them, and their reporting).
- `LEGACY_MANIFEST` in `okf-update.mts`, and its use in `readManifest`, so only the root
  manifest is read.
- The tests: the `migration from a scripts/ install` block in `test/bootstrap.test.mts`, and the
  `reads the legacy scripts/.okf-bootstrap.json` case with the `legacy` option of its helper in
  `test/update.test.mts`.

Then drop the notes about migrating from `SKILL.md` and the changelog if they remain.
