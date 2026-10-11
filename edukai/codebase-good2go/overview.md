---
type: Overview
title: The good2go codebase
description: What each tool and adapter must never do, and why
tags: [overview, codebase, invariants]
generated: { by: claude-code/sonnet-5.5, at: 2026-10-11T09:35:00Z }
---

good2go is an npm package, `@jb9k62/good2go` (not yet published; see the tooling overview).
Everything shares that name: the package, the `good2go` command, both skills and the tools,
which are `src/g2g-*.mts`. Projects depend on the package and hold no copies of the tools. Each
tool runs somewhere different, and each place takes something away. So the quickest way into
this codebase is to learn what each file must *not* do, and why.

Start with the two strictest files. `g2g-rank.mts` imports nothing at all. The viewer strips
its types and pastes it into `viz.html` as a plain script, so the command line and the search
box share one ranking. A single import would break that. `g2g-hook.mts` is nearly as
strict: `node:` built-ins and `./g2g-rank.mts`, and nothing else. It runs from the installed
package in projects whose `node_modules` may not exist, and whatever it prints is put in
front of an agent.

The viewer is one generated file with no build step, but not everything is inside it. The
ranking and the project's widget bundle are inlined. Cytoscape, marked, Mermaid and
highlight.js load from a CDN, each pinned by an integrity hash. That split explains the gates:
the render gate needs the network, and the parse gate does not.

Hooks have one route. `good2go hooks` writes Claude Code's settings entries and installs a pi
extension, and both call `good2go hook run`; the old Claude plugin and pi package are gone.
The default scope is the user, so a cloned repository cannot make a hook run its code.
`--project` and `--local` (uncommitted, Claude Code only) are explicit opt-ins that run the
project's own copy. Last, a test insists that every registered widget appears in a demo tour,
so a new widget is not done until a tour uses it.

## Current understanding

- [Everything is named good2go; tools are src/g2g-*](/codebase-good2go/lessons/2026-10-11-everything-is-named-good2go-and-the-tools-live-in-src-as-g2g.md)
- [A project depends on the package and holds no copy of the tools](/codebase-good2go/lessons/2026-10-11-a-project-depends-on-the-package-and-holds-no-copy-of-the-to.md)
- [good2go hooks is the only route to the memory hooks](/codebase-good2go/lessons/2026-10-11-good2go-hooks-is-the-only-route-to-the-memory-hooks.md)
- [good2go hooks installs at user, project or local scope](/codebase-good2go/lessons/2026-10-11-good2go-hooks-installs-at-user-project-or-local-scope.md)
- [g2g-rank.mts imports nothing so the viewer can inline it](/codebase-good2go/lessons/2026-10-08-rank-has-no-imports.md)
- [g2g-hook.mts imports only node: built-ins and g2g-rank.mts](/codebase-good2go/lessons/2026-10-08-hook-is-dependency-free.md)
- [The viewer loads its libraries from a pinned CDN](/codebase-good2go/lessons/2026-10-08-viewer-uses-a-pinned-cdn.md)
- [The harness adapters call good2go hook, not a file path](/codebase-good2go/lessons/2026-10-08-adapters-call-good2go-hook.md)
- [Every registered widget must appear in a demo tour](/codebase-good2go/lessons/2026-10-08-every-widget-has-a-tour.md)

## Open questions

- Project-scope hooks use POSIX shell, so Windows needs Git Bash or WSL; not tested here.
- `good2go hooks` has no test for a harness started with a different `PATH`.
