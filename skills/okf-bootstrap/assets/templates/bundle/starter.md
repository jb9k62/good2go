---
type: Reference
title: Read this first
description: How to add a page to this bundle, and what a good page looks like.
tags: [guide, authoring]
generated: { by: "good2go/new", at: {{NOW}} }
---

# Read this first

{{INTENT}}

This page explains how to add to the {{NAME}} bundle. Delete it once the bundle has real pages,
and remove its line from the index.

## Add a page

1. Create a markdown file in this folder, or in a subfolder named for a topic.
2. Start it with frontmatter. Only `type` is required; `title`, `description`, `tags` and
   `generated` make the page easier to find and to trust.
3. Write one idea per page. Link to another page with a bundle-root path and descriptive
   text, for example [the index](/index.md), not the bare path.
4. Link the new page from `index.md`, and add a line to [the log](/log.md).
5. Run `good2go validate` on this folder before you finish.

## Keep it honest

Write only what you have checked. Name where a claim comes from, and say when a page was
last reviewed.
