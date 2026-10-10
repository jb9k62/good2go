---
type: Overview
title: The good2go codebase
description: What each tool and adapter must never do, and why
tags: [overview, codebase, invariants]
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:35:00Z }
---

good2go is a handful of tools and two harness adapters. Each tool runs somewhere
different, and each place takes something away. So the quickest way into this codebase is to
learn what each file must *not* do, and why.

Start with the two strictest files. `g2g-rank.mts` imports nothing at all. The viewer strips
its types and pastes it into `viz.html` as a plain script, so the command line and the search
box share one ranking. A single import would break that. `g2g-hook.mts` is nearly as
strict: `node:` built-ins and `./g2g-rank.mts`, and nothing else. It runs from an installed
plugin, where the project's `node_modules` may not exist, and whatever it prints is put in
front of an agent.

The viewer is one generated file with no build step, but not everything is inside it. The
ranking and the project's widget bundle are inlined. Cytoscape, marked, Mermaid and
highlight.js load from a CDN, each pinned by an integrity hash. That split explains the gates:
the render gate needs the network, and the parse gate does not.

Two more rules tie files together. Both adapters find the hook core by its path under
`src/`, so moving that file breaks the pi extension and the Claude Code
hook together. And a test insists that every registered widget appears in a demo tour, so a
new widget is not done until a tour uses it.

## Current understanding

- [g2g-rank.mts imports nothing so the viewer can inline it](/codebase-good2go/lessons/2026-10-08-rank-has-no-imports.md)
- [g2g-hook.mts imports only node: built-ins and g2g-rank.mts](/codebase-good2go/lessons/2026-10-08-hook-is-dependency-free.md)
- [The viewer loads its libraries from a pinned CDN](/codebase-good2go/lessons/2026-10-08-viewer-uses-a-pinned-cdn.md)
- [The harness adapters resolve the memory hook from the skill assets](/codebase-good2go/lessons/2026-10-08-adapters-resolve-from-assets.md)
- [Every registered widget must appear in a demo tour](/codebase-good2go/lessons/2026-10-08-every-widget-has-a-tour.md)

## Open questions

- None recorded yet.
