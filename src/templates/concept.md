---
type: Application
title: CONCEPT TITLE
description: One-sentence summary of what this concept is and who it is for.
tags: [TAG-A, TAG-B]
generated: { by: <agent>/<version>, at: YYYY-MM-DDTHH:MM:SSZ }
sources:
  - resource: PATH/TO/FILE.EXT
---

# CONCEPT TITLE

Lead paragraph: what this concept covers, and who it is for.

## SECTION HEADING

Write the body in clean markdown. Keep concepts short: link to another concept instead of
repeating its content.

- Link to a concept inside this bundle with a bundle-root path and descriptive link text, for
  example [the architecture](/SLUG/architecture.md), not the raw path. Bundle-root links don't
  resolve when browsing the markdown on GitHub; the viewer resolves them.
- A file outside the bundle (the README, source code) doesn't get a bundle link: name it in
  `sources` above, or refer to it as a code path in the text, for example `src/example.ts`.
- A fenced mermaid block renders as a diagram in the viewer's detail panel.

<!-- Optional. A question nobody has answered yet goes under this heading, one item each, so
     `npm run g2g:questions` can list it. Delete the comment markers to use it.

## Open Questions

- [ ] What do we not know yet?
-->

## Notes on the frontmatter above (delete this section)

- `type` is the only required field. Pick one that matches the node palette (Application,
  Architecture, Data Model, API Reference, Reference, Architectural Decision, Process, Metric,
  Playbook); anything else still works but renders in a neutral grey.
- `generated.by` names the producer as `<agent>/<version>` (or `human:<id>`), and every
  timestamp is an ISO 8601 datetime with an offset, such as `2026-06-30T14:00:00Z`. A bare
  date is reported by `g2g:validate`.
- `sources` should point at the code or document this concept describes, not at a summary
  document the text was copied from. A path from the project root also feeds
  `npm run g2g:recheck`: after `npx good2go edukai verify <concept> --bundle okf
  --by <actor>` pins it, the re-check reports when that file changes.
- Record what is unsettled under a `## Open Questions` heading, one `- [ ]` item per question.
  When it is settled, `npm run g2g:questions -- answer <id> --by <concept or file>` ticks it
  and links the answer; it does not delete it. An empty section is a warning.
- Leave `status` out. It defaults to `stable`. Set it to `draft` while still writing, or
  `deprecated` once the concept no longer applies.
- Don't add `verified` until a person has actually reviewed this text: an unreviewed
  `verified` entry defeats the viewer's "unverified" badge.
