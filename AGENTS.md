# AGENTS.md

This repo holds two **agent skills** (for pi and Claude Code) that scaffold
[OKF](skills/good2go/references/okf-spec/SPEC.md) knowledge bundles into other projects:
`design/`, design docs for the team, and `edukai/`, what agents have learned (the memory bundle).
It is not an app. What ships is the compiled `src/` tools, `src/templates/`, `skills/` and the pi extension
(`extensions/edukai.ts`, copied by the build to `dist/templates/pi-extension.ts`); everything else (tests,
scripts, demo, docs) supports them.

## Agent memory

<!-- edukai -->
This project keeps agent memory in ./edukai/. Lines that start `edukai:` in messages and tool
results come from its memory hooks; treat them as project guidance. At the start of a session run
`npm run edukai:brief` and read the overview of the domain you will work in. Record what you
learn with the edukai skill. Before finishing, run `npm run edukai:recheck`.
<!-- /edukai -->

## Layout

| Path | What it is |
| --- | --- |
| `design/` | This repository's own design bundle (dogfood): concepts, ADRs and tours for the skill itself |
| `edukai/` | This repository's own memory bundle: lessons agents learned about this repository |
| `skills/good2go/SKILL.md` | The skill's entry point and its user-facing contract. Frontmatter `description` drives triggering |
| `src/g2g-init.mts` | Scaffolder (`good2go init`): copies templates into a target project and wires its npm scripts to the package |
| `src/good2go.mts` | The `good2go` command: dispatches to the tools. `g2g-new.mts` (`new`: any extra bundle), `g2g-install-hooks.mts` (`hooks`) and `g2g-skills.mts` (`skills`) sit beside it |
| `scripts/build.mts` | Compiles the tools to `dist/` for the npm package (`@jb9k62/good2go`); CI packs and smoke-tests the tarball |
| `src/g2g-view.mts` | Validator + graph viewer; emits one `viz.html` (~4500 lines) that loads its four libraries from pinned CDNs |
| `src/g2g-mermaid.mts` | Mermaid parse gate and headless-Chromium render gate |
| `src/g2g-search.mts` | Ranked, freshness-aware search (`search`, `show`, `related`, `facets`, `stale`) with an on-disk cache |
| `src/g2g-questions.mts` | Open questions: `good2go questions` lists them, `check` reports problems, `answer`/`reopen` mark one. The parsing is in `g2g-qparse.mts` (pure, shared with the session brief in `g2g-hook.mts`) |
| `src/g2g-rank.mts` | The ranking and its inverted index: pure, no imports. Run by `g2g-search` and inlined (types stripped) into `viz.html` for its search box |
| `src/g2g-core.mts` | Parsing shared by the viewer and search: frontmatter, trust tier, staleness, links. Loads `yaml` on the first parse, so a search answered from its cache never loads it |
| `src/g2g-edukai.mts` | The memory bundle's tool: `new`, `verify`, `supersede`, `index`, `recheck`. Writes the cache the hooks read |
| `scripts/g2g-start.mjs` | Loaded first by this repository's own npm scripts: Node's compile cache, so the tools' TypeScript is stripped once. No longer copied into projects; they run the compiled package |
| `src/g2g-hook.mts` | What the harness adapters run (`brief`, `cites`, `debt`, `hook`) and the code that derives a lesson's state. No dependencies |
| `skills/edukai/SKILL.md` | The memory skill: what is worth a lesson, how sure we are, what to do with one that failed its re-check |
| `extensions/edukai.ts` | Template for the pi extension `good2go hooks` installs: the same three moments, calling `good2go hook …` (from `PATH`, or the project's own copy at project scope). Declares the few pi types it uses |
| `src/g2g-shared.mts` | Helpers the tools share (templates, help text, skill copy, package version) |
| `src/templates/` | Files copied into target projects (`okf/`, concept and explainer templates, `okf-widgets/` React workspace) |
| `skills/good2go/references/` | `PLAYBOOK.md`, `EXPLAINERS.md`, and the vendored OKF spec |
| `examples/demo/okf/` | "Parcel tracker" demo bundle; used by `npm run demo`, tests and screenshots |
| `examples/demo/edukai/`, `examples/demo/src/` | The demo's memory bundle and the small source files its lessons cite; `examples/demo/README.md` is the walkthrough |
| `test/` | `init.test.mts`, `search.test.mts`, `edukai.test.mts` (unit), `render.e2e.mts` and `views.e2e.mts` (Chromium) |
| `scripts/` | Maintainer tools: `install-skill`, `okf-spec`, `screenshots`, `release-plan` (decides from `CHANGELOG.md` whether to open a release PR; see `docs/RELEASING.md`) |
| `vendor/knowledge-catalog` | Shallow git submodule pinning the upstream spec commit |
| `docs/images/` | README screenshots, **generated** by `npm run screenshots` |

## Commands

Node >= 24 is required. TypeScript runs directly (type stripping), with no build step.

```bash
npm ci
npm run check         # typecheck + unit tests + widget tests + views e2e + both bundles: run before finishing
npm run typecheck     # tsc for the tools, then the widget workspace
npm test              # node --test test/*.test.mts, plus the widget workspace's tests
npm run test:render   # Chromium: diagrams, quizzes, widgets (needs `npx playwright install chromium`)
npm run test:views    # Chromium: layouts, Graph/Tree/Table views, neighbourhood, colour modes
npm run g2g:validate  # this repository's own design/ bundle (types, links, timestamps)
npm run g2g:view      # build widgets, validate, write design/viz.html
npm run edukai:validate && npm run edukai:recheck   # the memory bundle: rules, then the queue
npm run edukai:brief  # what an agent is told when a session opens
npm run demo          # build widgets, then render examples/demo/okf to viz.html
npm run demo:edukai   # the demo's memory bundle: the session brief, then the re-check report
npm run spec -- status   # is the vendored OKF spec current? (0 yes, 1 moved, 2 offline)
```

The e2e tests skip without a browser; set `OKF_CHROMIUM` to a binary if Playwright's isn't
installed. They serve libraries from `node_modules`, so they run offline.

To see the viewer, run `npm run demo` and open `examples/demo/okf/viz.html` (gitignored).
For viewer changes, look at it in light **and** dark themes, in every view; passing tests
do not prove it reads well.

## Conventions

- **Erasable TypeScript only**: no enums, namespaces or parameter properties. Imports name
  the real `.mts` extension. `tsconfig.json` enforces this.
- **npm scripts start through `scripts/g2g-start.mjs`** (`node --import ./scripts/g2g-start.mjs src/g2g-….mts`):
  plain JavaScript that turns on Node's compile cache in a private folder. Keep it free of
  TypeScript and of imports beyond `node:` built-ins; a tool must still run without it.
- **Tools must stay dependency-light.** `g2g-init.mts`, `g2g-view.mts`, `g2g-mermaid.mts`,
  `g2g-search.mts`, `g2g-core.mts`, `g2g-rank.mts`, `g2g-edukai.mts` and `g2g-hook.mts` ship in the npm package as compiled JavaScript (Node won't strip types under `node_modules`). Don't import anything from outside
  `src/`, and resolve templates relative to the file itself.
- **`viz.html` is one file**: no build step. The ranking and the widget bundle are inlined; the
  four libraries (Cytoscape, marked, Mermaid, highlight.js) stay external scripts from jsDelivr and
  cdnjs, each pinned to an exact version with a subresource-integrity hash
  ([ADR-0004](design/adr/0004-viz-html-stays-one-file.md)). That is deliberate for now: keep the
  hashes in step when bumping one, and don't add a bundler or any other network fetch. The tools
  themselves (`good2go`) make no network requests.
- **Exit-code contract for every gate**: `0` pass, `1` broken (name file and line), `2`
  could not run. Never return 0 when a check didn't actually run.
- **Templates become the user's code.** Changes under `src/templates/` affect projects
  that already scaffolded; a plain re-run keeps authored files and the manifest is rewritten. Don't make a re-run overwrite authored content (only `--force` does).
- **Widgets**: `templates/okf-widgets` is an npm workspace with its own tests and typecheck.
  Keep models pure and separately tested from the React components.
- **Dependencies install with a cool-down.** `.npmrc` sets `min-release-age=2` (needs npm >= 11.10; older npm warns and ignores it). Don't add a version younger than two days. Actions are pinned by commit SHA with the tag in a comment. Library pins in `g2g-view.mts` must match the devDependency and carry a freshly computed SRI hash; marked is loaded from `lib/marked.umd.js`.
- **Spelling**: British ("colour", "licence", "neighbourhood"), matching the README and
  changelog.

## Changing things

- **`g2g-rank.mts` must stay pure** (no imports, no `fs`/`path`/`process`/DOM): the viewer inlines
  it into the page, so one ranking serves the CLI and the search box.

- **`g2g-hook.mts` must stay dependency-free**: it imports only `node:` built-ins,
  `./g2g-rank.mts` and `./g2g-qparse.mts` (the pure open-questions parser, same rule), never `g2g-core.mts` or `yaml`, and never runs code from the project. It
  runs from the installed package, and its output is put in front of an agent. A test enforces the imports and runs it outside the repo.
- **The demo's memory bundle is pinned.** Lessons in `examples/demo/edukai/` hold digests of
  files under `examples/demo/` (source files, and `okf/adr/0002-…` and `okf/parcel-tracker/api.md` (the demo keeps the default `okf/` folder, as a project scaffolded with the defaults has)).
  Editing one of those changes a lesson's state and the report a test pins; the three changes
  made on purpose are listed in `examples/demo/README.md`.

- **Skill behaviour or flags**: update `SKILL.md` (and `PLAYBOOK.md` if it touches authoring
  rules) in the same change, plus a test in `test/init.test.mts` for scaffolder changes.
- **Viewer features**: add to `test/views.e2e.mts` and show the demo bundle exercising it
  (add to `examples/demo/okf` if nothing there covers it).
- **User-visible changes**: add a line under `## Unreleased` in `CHANGELOG.md`. The `release-pr` workflow opens a release PR when that section has entries; start an entry `**Fix`, `**Security` or `**Breaking` to make the release a patch or a major (otherwise minor).
- **Releases**: the version lives only in `package.json` (and the lockfile); the tools read it at
  run time. See `docs/RELEASING.md`.
- **Vendored OKF spec**: never hand-edit `references/okf-spec/` or `vendor/`. Use
  `npm run spec -- update` (copies `SPEC.md`, `LICENSE.md`, writes `UPSTREAM.json`). CI
  runs `spec status` weekly and fails when upstream moves.
- **This repository's own bundles**: `design/` and `edukai/` live at the root, and `npm run check`
  validates both. The tools run from `src/`, not generated copies under
  `scripts/` ([ADR-0003](design/adr/0003-run-the-tools-from-the-skill-assets.md)); never scaffold
  `scripts/okf-*.mts` or `scripts/g2g-*.mts` into this repo.
- **Screenshots**: don't edit `docs/images/`; the `screenshots` workflow regenerates them
  and commits them to the `chore/screenshots` branch (never to `main`), with a pull request
  to merge. Run `npm run screenshots` only if you need them locally.

## CI

`.github/workflows/ci.yml`: `check` (Node 24 and 26), `render` (Chromium e2e), and `spec`
(vendored spec freshness). Keep `npm run check` green locally before pushing.

## Don't

- Commit `node_modules/`, `dist/`, `.cache/` or any `viz.html`; all are gitignored.
- Write claims into demo or template docs that the code doesn't back up; the skill's own
  rule is to check every claim against the code.
- Reformat or rewrite `g2g-view.mts` wholesale. It is large; make targeted edits.
