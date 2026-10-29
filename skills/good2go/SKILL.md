---
name: good2go
description: >
  Scaffold and maintain an OKF (Open Knowledge Format) knowledge bundle in any project:
  a design bundle (index, log, ADRs, concepts; `okf/` by default), a validator and self-contained graph viewer
  (viz.html), Mermaid parse and render gates, and optional interactive explainers: callouts,
  click-to-check quizzes and React "micro-world" widgets that let a reader play with how the
  system behaves. Use when asked to "bootstrap an okf" or set up structured design docs, when
  writing a guided tour, tutorial or explainer of code or a change (especially agent-written
  code someone must understand before building on it), when adding a quiz or interactive
  widget to docs, when moving a bundle to a new OKF spec version, or when updating a project's
  okf tools to a newer good2go release or when adding another bundle such as ops.
license: MIT
compatibility: "Node 24+. npm. Chromium via playwright for the render gate. Harnesses: Claude Code and pi."
---

# good2go

Scaffolds the **app-knowledge** flavour of an [OKF](references/okf-spec/SPEC.md) doc pack into
a project and keeps it honest. The design bundle comes first: an index, a dated log, an ADR
area and concept folders for decisions, architecture, domain model, API and the guided tours
that make them understandable. Its folder defaults to `okf/` (`--design-dir` changes it).

This file is the judgement. The commands are the `good2go` command of the npm package
`@jb9k62/good2go`; ask it, do not trust a copy of its flags here.

| File | When |
| --- | --- |
| [references/PLAYBOOK.md](references/PLAYBOOK.md) | Any bundle work: layout, frontmatter, links, the gates, the review checklist, spec version changes |
| [references/EXPLAINERS.md](references/EXPLAINERS.md) | Before writing an `Explainer`, a quiz, or a widget |
| [references/okf-spec/SPEC.md](references/okf-spec/SPEC.md) | The OKF spec itself (vendored; `UPSTREAM.json` says which commit) |
| `packages/okf-widgets/README.md` (in the project) | Before adding or changing a widget |

## Setup

`npm i -g @jb9k62/good2go` installs the `good2go` command. `good2go hooks` then wires the
memory hooks for Claude Code and pi at user scope, so a cloned repository cannot make them run
its code (`good2go hooks --project` is the alternative for a project devDependency). In a project, `npm i -D @jb9k62/good2go && npx good2go init . --name "Project Name"`
scaffolds the design bundle, adds the `okf:*` npm scripts and copies these skills into
`.claude/skills/` and `.agents/skills/`. Without a `package.json`, use `npx @jb9k62/good2go@<version> init`.

Run `good2go --help` for every command and `good2go init --help`, `good2go new --help`,
`good2go search --help` and `good2go edukai --help` for their flags.
The scaffolded scripts are the checks: `npm run g2g:fix`, `g2g:validate`, `g2g:build-view`,
`g2g:view`, `g2g:mermaid`, `g2g:mermaid:render`, `g2g:search`, `g2g:recheck`, `g2g:questions`. The Mermaid
gates need `npm i -D @mermaid-js/mermaid-cli@11 playwright && npx playwright install chromium`;
without them they exit 2 ("could not run"). A plain re-run of `init` keeps authored files and refreshes the skills copies you have not edited.

Invoke with `/skill:good2go` (pi), `/good2go` (Claude Code), or just ask: "bootstrap
an okf for this project", "write an explainer for this change with a quiz".

## Procedure

1. **Scaffold** (above). Add `--widgets` when the project will have explainers; it can come later.
2. **Author.**
   - First ADR, `<design dir>/adr/0001-...`: the decision to keep design knowledge in an OKF
     bundle (where, why, what was rejected). Copy `adr/template.md`; add a row to `adr/readme.md`.
   - First concepts in `<design dir>/<slug>/`: overview, architecture, domain model, API, from
     `okf-concept-template.md`.
   - Explainers: from `okf-explainer-template.md`, following EXPLAINERS.md: background,
     intuition, details, then a quiz.
   - **Check every claim against the code before it goes in** (the playbook's checklist).
3. **Verify.** Run `g2g:fix`, `g2g:validate` (expect 0 issues), `g2g:build-view`, `g2g:mermaid` and
   `g2g:mermaid:render` (and `g2g:widgets:typecheck` and `g2g:widgets:test` with widgets). Exit
   codes: **0** pass, **1** broken (file and line named), **2** could not run. Read 2 as
   "unproven", never as "fine". Then open `viz.html` in light and dark: the gates prove it
   works, not that it reads well.
4. **Commit** the bundle, `packages/okf-widgets/`, the authoring templates and `package.json`.
   Gitignore `viz.html`.

## Bundles

Bundles stay separate because they have different readers and different rules: design (`okf/`,
the team), memory (`edukai/`, the agent; `init --edukai`), and any other such as `ops/`
(`good2go new ops --name ... --intent ...`). Other bundles take the same gates
(`good2go validate ops`, `good2go view ops`); `good2go new` lists the bundle in `.good2go.json`, so
`npm run g2g:build-view` builds every listed bundle and a landing page, and `npm run g2g:view -- ops`
opens one.

This skill covers the design bundle and other people-written bundles. Lessons are the
**`edukai` skill's**. Never put lessons in the design bundle, or design docs in `edukai/`. Two
memory-side features work on a design bundle: `supersedes` / `superseded_by` (an ADR that
replaces another; the validator checks the pair) and `g2g:recheck`, which reports concepts whose
pinned `sources` changed (pin them with `good2go edukai verify <concept> --bundle okf --by human:<id>`,
and only after a person has reviewed them).

## Updating

Raise the package version (`npm i -D @jb9k62/good2go@latest`); the tools come with it. There is
no updater command, and authored files are never touched. Finish with `npm run g2g:validate`.

## Finding things in a bundle

Do not read a whole bundle to answer a question. `npm run g2g:search -- <command>` ranks
concepts by text and by what the spec says about them (trust tier, stale, deprecated, links):
`facets`, `search "query"`, `show <id> --outline` then `--section`, `related`, `stale`. Treat a
`stale` or `unverified` hit as a lead to check, not a fact. See the playbook's "Finding concepts".

## Open questions

Unsettled points go under a `## Open Questions` heading in the concept they belong to, one
`- [ ]` item per question (`Open Question` is read the same but warned about). Do not hunt for
them by reading: run `npm run g2g:questions -- --json` for every open question with its id,
concept and line. When the bundle or the code answers one, propose
`npm run g2g:questions -- answer <id> --by <concept or file:line>` to the user rather than
marking it silently; it ticks the box and links the answer, and `reopen <id>` undoes it. Never
delete a question to close it. `g2g:validate` fails an answered question with no link that
resolves, and warns about a bullet with no checkbox.

## Writing rules

- Root `index.md` and `log.md` are reserved (no `type`). Every other `.md` needs YAML
  frontmatter on line 1 with a non-empty `type`. Working notes without a type live outside
  the bundle.
- `generated: { by: <agent>/<version>, at: 2026-06-30T14:00:00Z }`. Timestamps are ISO 8601
  with an offset. Omit `status` while it is `stable`; add `verified` only after a person has
  actually reviewed the text.
- Short concepts, plain words, link instead of repeating. Bundle-root links
  (`[text](/path/concept.md)`) or relative ones; a link to a missing file is an issue.
- Mermaid: `fill`, `stroke` and `color` on every `classDef`; any `%%{init}%%` on one line.
- Every `erDiagram` is followed by the generated key that reads each relationship in words.
  Never write it by hand: `npm run g2g:fix`. For a complicated schema, or when asked, add a
  ` ```widget ` with `sql-erd` and the schema's SQL.
- Callouts `> [!definition] Term`; quizzes in a ` ```quiz ` block (exactly one `- [x]` per
  question); widgets in a ` ```widget ` block naming a registered widget.

## Widgets

`packages/okf-widgets` is copied into the project and **becomes the project's code**: a
registry, a kit, styles on the viewer's theme variables, and worked examples with pure, tested
models. Keep the examples as references or delete them; write the project's own widgets beside
them, importing its real pure code through the `@app` alias where possible. Its `README.md`
has the steps. Teach a concept as a **ladder** of small widgets, one idea each: by hand on a
tiny world, then the failure predicted before it is shown, then at scale (EXPLAINERS.md,
"Ladders").

## OKF spec version

The spec is vendored at `references/okf-spec/`; the viewer implements `OKF_VERSION` and reports
a bundle that declares another. To move a bundle, follow the playbook's "Moving a bundle to a
new OKF version".
