---
type: Reference
title: Decision records
description: The decisions recorded for good2go, and how to add one.
tags: [adr, decisions]
generated: { by: good2go/0.6.0, at: 2026-10-08T20:00:00Z }
---

# Decision records

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](/adr/0001-keep-this-repos-design-in-okf.md) | Keep this repository's design knowledge in an OKF bundle | accepted |
| [0002](/adr/0002-two-bundles-design-and-memory.md) | Keep design docs and agent memory in two separate bundles | accepted |
| [0003](/adr/0003-run-the-tools-from-the-skill-assets.md) | Run the tools from the skill's assets, not generated copies | accepted |
| [0004](/adr/0004-viz-html-stays-one-file.md) | Keep `viz.html` one self-contained file, with no bundler | accepted |
| [0005](/adr/0005-name-bundles-by-what-they-hold.md) | Name each bundle for what it holds: `design/`, and an optional `ops/` | accepted in part |
| [0006](/adr/0006-publish-the-tools-to-npm.md) | Publish the tools to npm as `@jb9k62/good2go` | accepted |
| [0007](/adr/0007-install-hooks-and-skills-from-the-package.md) | Install the hooks and skills from the package, per user by default | accepted |
| [0008](/adr/0008-rename-to-good2go-and-src-layout.md) | Name everything good2go, and move the sources to `src/` | accepted |

## Adding one

- Copy the [template](/adr/template.md) to `NNNN-short-title.md` and add a row above, linking
  the number (`0001`) to the new file.
- Record one decision, with at least one rejected alternative and why.
- Statuses are **proposed**, **accepted**, **superseded** or **deprecated**. To supersede a
  record, point the two at each other in frontmatter: `supersedes: /adr/NNNN-old.md` on the
  new one, and `status: deprecated` with `superseded_by: /adr/NNNN-new.md` on the old.
  `npm run g2g:validate` reports a pair that does not match, and never delete the old record.
