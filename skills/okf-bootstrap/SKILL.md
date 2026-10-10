---
name: okf-bootstrap
description: >
  Scaffold and maintain an OKF (Open Knowledge Format) knowledge bundle in any project:
  a design bundle (index, log, ADRs, concepts; `okf/` by default), a validator and self-contained graph viewer
  (viz.html), Mermaid parse and render gates, and optional interactive explainers: callouts,
  click-to-check quizzes and React "micro-world" widgets that let a reader play with how the
  system behaves. Use when asked to "bootstrap an okf" or set up structured design docs, when
  writing a guided tour, tutorial or explainer of code or a change (especially agent-written
  code someone must understand before building on it), when adding a quiz or interactive
  widget to docs, when moving a bundle to a new OKF spec version, or when updating a project's
  okf tools to a newer okf-bootstrap release or when adding another bundle such as ops.
license: MIT
compatibility: Node 24+. npm. Chromium via playwright for the render gate. Harnesses: Claude Code and pi.
---

# OKF Bootstrap

Scaffolds the **app-knowledge** flavour of an [OKF](references/okf-spec/SPEC.md) doc pack into
a project and keeps it honest. The design bundle is the first bundle bootstrapped: an index,
a dated log, an ADR area and concept folders for decisions, architecture, domain model, API and
the guided tours that make them understandable. Its folder is configurable and defaults to
`okf/`. Other bundles are added later with `good2go new` (see "Bundles").

The tools are the npm package `@jb9k62/good2go` and its `good2go` command. A project depends
on the package and holds no copies of the tools. The supported harnesses are Claude Code and pi.

Read these as the task needs them (paths relative to this file):

| File | When |
| --- | --- |
| [references/PLAYBOOK.md](references/PLAYBOOK.md) | Any bundle work: layout, frontmatter, links, the gates, the review checklist, version migration |
| [references/EXPLAINERS.md](references/EXPLAINERS.md) | Before writing an `Explainer` concept, a quiz, or a widget |
| [references/okf-spec/SPEC.md](references/okf-spec/SPEC.md) | The OKF spec itself (vendored; `UPSTREAM.json` says which commit) |
| `packages/okf-widgets/README.md` (in the project) | Before adding or changing a widget |

## Invocation

pi: `/skill:okf-bootstrap [targetDir] [flags]`. Claude Code: `/okf-bootstrap [targetDir] [flags]`
(or `/okf-bootstrap:okf-bootstrap` as a plugin). Or just ask: "bootstrap an okf for this
project", "write an explainer for this change with a quiz", "add a widget that shows X".

Scaffold with `good2go init`. In a project with a `package.json`, install the package first:

```bash
npm install -D @jb9k62/good2go
npx good2go init <targetDir> --name "Project Name" [--design-dir okf] [--widgets] [--edukai]
```

With no `package.json`, run it without installing, pinned to a version:
`npx @jb9k62/good2go@<version> init <targetDir> --name "Project Name"`.

| Flag | Effect |
| --- | --- |
| `--name` | Title for the design bundle's `index.md` (default: the target's folder name) |
| `--slug` | Concept folder id (default: kebab-case of the name) |
| `--design-dir` | The design bundle's folder (default `okf`); recorded so every command finds it |
| `--widgets` | Also scaffold `packages/okf-widgets` (React micro-worlds), add it to the npm workspaces, and build it before `okf:view` and the render gate |
| `--edukai` | Also scaffold `edukai/`, the agent memory bundle (see "Bundles"), add the `edukai:` scripts, and write a short marked snippet into `AGENTS.md` once |
| `--tools-only` | Refresh the npm scripts and manifest only; add `--widgets` or `--edukai` to add either to a project that already has its design bundle |
| `--no-scripts` | Leave `package.json` alone |
| `--force` | Replace the authored files (index, log, ADR index and template, authoring templates) with fresh templates. Never touches `packages/okf-widgets` |

A plain re-run keeps every authored file and lists what it kept, so re-running costs
`log.md` nothing.

## Procedure

1. **Scaffold** with the command above. Pass `--widgets` when the project will have explainers
   (tours, tutorials, onboarding); it can be added later.
2. **Install.**
   ```bash
   npm install
   npm install -D @mermaid-js/mermaid-cli@11 playwright
   npx playwright install chromium
   ```
   Without the last two, the Mermaid gates exit 2 ("could not run"): a failure, never a pass.
3. **Author.**
   - First ADR: `<design dir>/adr/0001-...` recording the decision to keep design knowledge in
     an OKF bundle (where it lives, why, what was rejected). Copy `adr/template.md` and add a
     row to `adr/readme.md`.
   - First concepts in `<design dir>/<slug>/`: overview, architecture, domain model, API. Start
     from `okf-concept-template.md`. Every non-reserved `.md` needs a `type`, every internal
     link must resolve, and every timestamp is an ISO 8601 datetime with an offset.
   - Explainers: start from `okf-explainer-template.md` and follow
     [EXPLAINERS.md](references/EXPLAINERS.md): background, intuition, details, then a quiz.
   - **Check every claim against the code before it goes in** (the playbook's checklist).
4. **Verify.** All must pass before committing:
   ```bash
   npm run okf:fix               # writes the relationship key under every ER diagram
   npm run okf:validate          # frontmatter, links, timestamps, ER keys: expect 0 issues
   npm run okf:view              # (builds widgets,) validates, writes viz.html
   npm run okf:mermaid           # every mermaid block parses in mmdc
   npm run okf:mermaid:render    # headless Chromium: diagrams, quizzes, widgets all work
   npm run okf:widgets:typecheck && npm run okf:widgets:test   # with --widgets
   ```
   Exit codes are shared: **0** pass, **1** something is broken (file and line named), **2**
   the gate could not run. Read 2 as "unproven", never as "fine". Then open `viz.html` and
   look, in light and dark: the gates prove it works, not that it reads well.
5. **Commit** the bundle, `packages/okf-widgets/`, the two authoring templates and
   `package.json`. Gitignore `viz.html` (generated).

## Bundles

A project can hold several OKF bundles. They stay separate because they have different
readers and different rules.

| Bundle | Folder | Reader | Added with |
| --- | --- | --- | --- |
| Design | `okf/` by default, set by `init --design-dir` | The team, in `viz.html` | `good2go init` (always first) |
| Memory | `edukai/` | The agent, through harness hooks | `good2go init --edukai` |
| Ops, or any other | Your choice, for example `ops/` | Whoever the bundle is for | `good2go new` |

```bash
npx good2go new ops --name "Operations" --intent "Runbooks, on-call and escalation for the service"
```

`new` scaffolds an index, a log and a starter page into `<dir>`, and the bundle then takes the
same gates: `good2go validate ops`, `good2go view ops`, `good2go search search "query" --bundle ops`.

This skill covers the design bundle and any other people-written bundle. Reading and writing
lessons is the **`edukai` skill** (installed beside this one); use it for anything under
`edukai/`. Never put lessons in the design bundle, or design docs in `edukai/`. Two things from
the memory side also work on a design bundle: `supersedes` / `superseded_by` in frontmatter
(an ADR that replaces another; the validator checks the pair), and `npm run okf:recheck`, which
reports concepts whose pinned `sources` changed (`good2go edukai verify <concept> --bundle okf --by <actor>`
pins them).

## Updating

Update by raising the package version: `npm install -D @jb9k62/good2go@latest`. The tools
come with it. What the project already holds is the scaffolded templates, which `good2go update`
compares with the installed release. It runs only when someone runs it.

1. **Dry run.** `npx good2go update` lists which scaffolded templates the installed release
   changed, and the changelog entries since the version in the manifest. It writes nothing.
2. **Summarise** the changes in plain words, from that report.
3. **Ask the user** before applying. A template the user edited is never overwritten: the
   release's copy goes beside it for a hand diff.
4. **Apply** with `npx good2go update --apply`. It refuses on a dirty git tree, so commit or
   stash first and `git diff` is the undo. `--allow-dirty` only when the user asks for it.
5. **Verify** with `npm run okf:validate`.

Exit codes: **0** up to date, dry run ok, or applied. **1** `--apply` refused or could not
complete and the report names what needs a person. **2** could not run.

A project scaffolded before the package existed holds copies in `scripts/okf-*.mts`. Install
the package, run `npx good2go init . --tools-only`, and delete the old copies.

## Finding things in a bundle

Do not read a whole bundle to answer a question. `npm run okf:search -- <command>` (that is,
`good2go search`) ranks concepts by text and by what the spec says about them (trust tier,
stale, deprecated, links): `facets` (the tags and types in use), `search "query" [--fresh --tag t --trust human --cites src/file.ts]`,
`show <id> --outline` then `--section <heading>`, `related <id>`, `stale`. Add `--json`. The
viewer's search box runs the same ranking. Treat a `stale` or `unverified` hit as a lead to
check, not a fact. Details: the playbook's "Finding concepts".

## Writing rules (short version)

- Root `index.md` and `log.md` are reserved (no `type`). Every other `.md` needs YAML
  frontmatter on line 1 with a non-empty `type`. Working notes without a type live outside
  the bundle.
- `generated: { by: <agent>/<version>, at: 2026-06-30T14:00:00Z }`. Omit `status` while it is
  `stable`; add `verified` only after a person has actually reviewed the text.
- Short concepts, plain words, link instead of repeating. Bundle-root links
  (`[text](/path/concept.md)`) or relative ones; a link to a missing file is an issue.
- Mermaid: `fill`, `stroke` and `color` on every `classDef`; any `%%{init}%%` on one line.
- Every `erDiagram` is followed by the generated key that reads each relationship in words.
  Never write it by hand: run `npm run okf:fix`; `okf:validate` fails without it. For a
  complicated schema, or when asked, add a ` ```widget ` with `sql-erd` and the schema's SQL:
  see EXPLAINERS.md.
- Callouts `> [!definition] Term`; quizzes in a ` ```quiz ` block (exactly one `- [x]` per
  question); widgets in a ` ```widget ` block naming a registered widget.

## Widgets: what ships and what is yours

`packages/okf-widgets` is copied into the project and **becomes the project's code**. It ships
a registry (`src/index.tsx`), a kit (`useWorld`, `Presets`, `Choice`, `Slider`, `Toggle`,
`Scrubber`, `Facts`, `BarChart`, `Note`, `ModelNote`, `SourceProblem`), styles built on the viewer's theme
variables, and ten worked examples with pure, tested models: `utc-week`, `retry-backoff`,
`sql-erd` (takes a schema's SQL from the block), and the computer-science set `cache-policy`,
`http-concurrency` (takes requests from the block), `css-specificity` (takes rules from the
block), `bloom-filter`, `rate-limiter`, `binary-search` and `consistent-hash`. Keep the examples as references or delete them; write the project's
own widgets next to them, importing the project's real pure code through the `@app` alias
where possible. Its `README.md` has the step-by-step.

## OKF spec version

The spec is vendored at `references/okf-spec/` (`UPSTREAM.json` records the upstream commit
and version); the viewer implements `OKF_VERSION` and reports a bundle that declares another.
To move a project's bundle to a new version, follow the playbook's "Moving a bundle to a new
OKF version" section. Maintainers update the vendored spec with `npm run spec -- status` and
`npm run spec -- update` in the okf-bootstrap repository.
