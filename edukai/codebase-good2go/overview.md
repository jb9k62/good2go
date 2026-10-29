---
type: Overview
title: The good2go codebase
description: What each tool and adapter must never do, and why
tags: [overview, codebase, invariants]
generated: { by: claude-code/claude-sonnet-5-5, at: 2026-10-29T14:13:36Z }
---

good2go is an npm package, `@jb9k62/good2go` (not yet published; see the tooling overview).
Everything shares that name: the package, the `good2go` command, both skills and the tools,
which are `src/g2g-*.mts`. Projects depend on the package and hold no copies of the tools. Each
tool runs somewhere different, and each place takes something away. So the quickest way into
this codebase is to learn what each file must *not* do, and why.

Start with the two strictest files. `g2g-rank.mts` imports nothing at all. The viewer strips
its types and pastes it into `viz.html` as a plain script, so the command line and the search
box share one ranking. A single import would break that. `g2g-hook.mts` is nearly as
strict: `node:` built-ins, `./g2g-rank.mts` and `./g2g-qparse.mts` (the pure parser for open questions, so the session brief can count them), and nothing else. It runs from the installed
package in projects whose `node_modules` may not exist, and whatever it prints is put in
front of an agent.

The viewer is one generated file with no build step, but not everything is inside it. The
ranking and the project's widget bundle are inlined. Cytoscape, marked, Mermaid and
highlight.js load from a CDN, each pinned by an integrity hash. That split explains the gates:
the render gate needs the network, and the parse gate does not. Its CSS and browser script are
template literals in `g2g-view.mts`, so a backtick anywhere in them, even in a comment, breaks
the build. No ancestor of the reading pane may apply CSS containment or a transform, or an
expanded diagram is clipped to the pane.

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
- [g2g-hook.mts imports only node: built-ins, g2g-rank.mts and g2g-qparse.mts](/codebase-good2go/lessons/2026-10-08-hook-is-dependency-free.md)
- [The viewer loads its libraries from a pinned CDN](/codebase-good2go/lessons/2026-10-08-viewer-uses-a-pinned-cdn.md)
- [The viewer's browser script sits in a template literal, so a backtick in it breaks the typecheck and the viewer](/codebase-good2go/lessons/2026-10-11-the-viewer-s-browser-script-sits-in-a-template-literal-so-a.md)
- [The reading pane's rail is set from a ResizeObserver, because an ancestor with a containment or transform would clip an expanded diagram](/codebase-good2go/lessons/2026-10-11-the-reading-pane-s-rail-is-set-from-a-resizeobserver-because.md)
- [The reading pane's contents are built from its rendered headings, so each entry lands on its anchor](/codebase-good2go/lessons/2026-10-11-the-reading-pane-s-contents-are-built-from-its-rendered-head.md)
- [Open questions are parsed by g2g-qparse.mts, shared by the command, validate, the brief and the viewer](/codebase-good2go/lessons/2026-10-29-open-questions-parser-is-shared.md)
- [The harness adapters call good2go hook, not a file path](/codebase-good2go/lessons/2026-10-08-adapters-call-good2go-hook.md)
- [Every registered widget must appear in a demo tour](/codebase-good2go/lessons/2026-10-08-every-widget-has-a-tour.md)

## Open questions

- [ ] Project-scope hooks use POSIX shell, so Windows needs Git Bash or WSL; not tested here.
- [ ] `good2go hooks` has no test for a harness started with a different `PATH`.
