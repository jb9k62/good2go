---
type: Reference
title: The viewer
description: How one viz.html is built, what it inlines, and what it loads from a CDN.
tags: [viewer, viz, search]
generated: { by: pi/deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-10-08T20:20:00Z }
sources:
  - resource: src/g2g-view.mts
  - resource: src/g2g-rank.mts
  - resource: src/templates/okf-widgets/README.md
  - resource: test/views.e2e.mts
---

# The viewer

`g2g-view.mts` walks a bundle, checks it, builds a graph of its concepts, and writes one
`viz.html` next to the bundle (or wherever `--out` says). The file is generated, so it is
gitignored. A project builds it again with `npm run g2g:build-view` (every bundle, plus a landing page) or opens it with `npm run g2g:view -- <bundle>`.

## One file, two sources of content

The page is one file, but its parts arrive in two ways
([ADR-0004](/adr/0004-viz-html-stays-one-file.md)):

- **Inlined when the page is generated.** The viewer reads the ranking (`g2g-rank.mts`) from
  beside the tool, strips its types with Node's `stripTypeScriptTypes`, and removes its
  `export ` prefixes so it runs as a plain script. The project's built widget bundle is
  inlined the same way. Both are guarded against a literal `</script` in the source, which
  would end the block early.
- **Loaded from a CDN when the page opens.** Cytoscape (the graph), marked (markdown), Mermaid
  (diagrams) and highlight.js load from jsdelivr and cdnjs. Each is pinned to an exact version
  with a subresource-integrity hash, so a changed file does not run. This is why the render
  gate needs network access.

Inlining the ranking puts one demand on it: `g2g-rank.mts` must stay pure, with no imports. It
has to be valid as a plain script in the page and as a module in Node. In return, one ranking
serves both `g2g-search` and the search box, so the two cannot disagree.

## The widget bundle

A ` ```widget ` block names a widget registered in the project's `packages/okf-widgets`. The
viewer mounts it by calling the bundle's `mount(element, name, source)`, passing whatever
follows the name in the block. The bundle is inlined so the page stays one file. Its default
path is `packages/okf-widgets/dist/okf-widgets.js` relative to the tool, and `--widgets`
overrides that.

A widget that cannot mount never leaves a blank space. Without a built bundle, the block
shows a build hint. With an unknown name, it lists the registered ones.

The template package ships fourteen worked example widgets, each with a pure model and a test.
Two concepts are taught as ladders of small widgets, one idea per rung
([ADR-0009](/adr/0009-micro-worlds-teach-in-ladders.md)). Once scaffolded, it is the project's code: the examples are there to learn from, and a project
writes its own widgets beside them.

## What the page does

- **A concept graph with a reading pane.** Nodes are sized by incoming links, and selecting
  one focuses its neighbours. Layouts switch between graph, tree and table, and colour
  switches between type, trust and freshness.
- **Ranked search in a modal**, with the same ranking as `g2g-search`: results on the left, a
  preview on the right, with type, trust and freshness filters and a plain "contains" mode.
- **Mermaid diagrams**, rendered one at a time. A diagram that fails shows a visible error
  and its source. Each has pan/zoom controls, which the render gate checks are wired.
- **Callouts** (`> [!definition] Term`), click-to-check quizzes, and widgets.
- **Deep links.** The URL hash carries the view's state; see [The route](#the-route). The page
  title comes from the bundle's `index.md` H1.
- **Small comforts.** A theme that follows the system setting and is remembered, an IDE-style
  status bar with reading progress, and raw-path link text replaced by the linked concept's
  title.

## The route

The URL hash is the viewer's state, so a link opens the same view and Back and reload land
where they did. The grammar is `#<concept-id>[?<params>]`, and the bare `#<concept-id>` form
still works. A tour is a concept, so tours route the same way. Params are left out when they
hold their default:

| Param | Meaning |
| --- | --- |
| `s` | the section: the id of a level 2 or 3 heading |
| `search=1` | the search modal is open |
| `q` | the search text |
| `mode` | the search mode, when it is not the default |
| `type`, `trust`, `fresh` | the three filters |

Loading a link opens the concept, scrolls to the section and restores the search modal, its
query and the filters. Contents entries write their section into the hash. Opening a concept
or a search result adds a history entry; filter, query and modal changes replace the current
one, so Back moves between concepts and not between keystrokes.

The rule is that one module owns the route. `parseRoute` and `formatRoute` are pure, and
they are the only code that reads or writes the hash's grammar. `go` is the only function
that pushes a history entry, `syncRoute` is the only one that replaces the current entry,
and `applyRoute` takes a URL to the UI. The filters and the search are read from the URL
once, at load; after that the UI is the source and `syncRoute` writes it back, so the two
cannot drift apart silently.

## Versions

The viewer implements OKF v0.2. It reports the version a bundle declares and adds a note when
the two differ. It does not refuse another version; it reads it as best it can.

It pins Mermaid 12, and `g2g-mermaid.mts` must stay on the same major. That way a diagram one
accepts is a diagram the other accepts.
