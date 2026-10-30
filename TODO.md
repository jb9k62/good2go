# TODO

## Cast validation in OKF tools

**How to integrate the cast system into good2go validation:**

The demo bundle defines `cast.json` with approved persona names (Sam, Noor, Dana, Amira, Lee) that map to their roles. Explainers declare which cast members they use via `cast: [Name1, Name2, ...]` frontmatter.

This can be baked into the toolchain:

1. **`g2g-core.mts` or a new validator**: Parse `cast.json` from a bundle root (if present) and extract approved names. Add a validation gate that checks every concept's frontmatter and markdown body for names not in the cast, flagging them as unknown personas.

2. **Error reporting**: When an explainer references an unapproved name, report it as a gate failure (exit code 1) with the file path, line, and suggestion ("did you mean X?").

3. **`g2g-view.mts`**: When rendering a concept that declares a cast, highlight personas in the UI or link them to their role definition (from `cast.json`).

4. **Scaffolding**: When `g2g-init.mts` creates a new bundle, offer to generate a `cast.json` template if the project has explainers.

5. **Search ranking**: In `g2g-search.mts`, boost concepts that cite the cast and penalize those with undefined personas.

6. **Bundle validation in CI**: Add a test in `test/init.test.mts` that checks the demo bundle's cast is consistent across all concepts—no typos in names, no referenced-but-undefined personas.

**Why**: Keeps persona definitions centralized and stable. Names stay fixed; roles can evolve. Tooling catches copy-paste errors ("Samm", "SAM") early. Tours stay readable; validation is data-driven.

## Read the design folder from `.good2go.json`

`search`, `recheck`, `view` and `mermaid` each default their bundle to `okf`, and the generated
npm scripts work around that by passing the folder every time. Have the tools walk up from the
working directory to `.good2go.json` and use its `designDir` as the default bundle, so
`good2go validate` and `good2go recheck` work in any layout and the CI template names no folder.
The same file is the place for ADR-0005's role-to-folder map (`ops`, and so on).

## Optional watch mode for `build-view`

Add a `--watch` flag to `good2go build-view` (and the `g2g:build-view` script) that rebuilds
`viz.html` whenever a file in a listed bundle changes, so the viewer can stay open while a
concept is being written. Off by default, so the one-shot build and its exit-code contract are
unchanged.

## Reader notes in the viewer, handed to an agent

Let a reader select text or content, attach a note to it (plain text or Markdown), accumulate
several notes, and then hand the lot to an agent to act on. A note and the passage it points at
should travel together (concept file, heading, the selected text, a line), so the agent can find
the place without searching. Lean on `hunk` for the review mechanics rather than re-implementing
them.

**What `hunk` is (0.24.1, checked).** A terminal diff and file viewer, not a library. A running
session is a local daemon that other processes control with `hunk session ...`. Notes are anchored
to `file` plus a line (`--new-line` or `--old-line`) and carry a summary and optional rationale.
`hunk session comment list --type user --json` returns the notes a reader wrote in the TUI (press
`c`), and `hunk session comment apply --stdin` loads a JSON batch of notes
(`{"comments":[{"filePath","newLine","summary"}]}`) into a live session. `hunk open <path>` views
a whole file, and `hunk diff` reviews changes. It makes no sense of Markdown structure, headings
or the viewer's `viz.html`. Not yet tried: whether notes can be written on a file shown with
`hunk open` rather than in a diff.

### Options

1. **Review in the terminal; the viewer only points there.** A `good2go review <concept>` command
   opens the concept file in `hunk`, the reader writes notes in the TUI, and an agent reads them
   with `hunk session comment list --type user --json`. The viewer adds a "review in hunk" button
   that copies the command. Cheapest, fully reuses `hunk`, and leaves
   [ADR-0004](design/adr/0004-viz-html-stays-one-file.md) alone, but the reader leaves the
   browser and has no rendered view (diagrams, quizzes) while annotating.
2. **Take notes in the viewer; `hunk` is the hand-off format.** The viewer captures a selection,
   finds the matching source line in the concept's Markdown, and keeps notes in the page
   (`localStorage`, or a file download). A `good2go notes` command turns them into the `comment
   apply` batch for a live `hunk` session, or into plain JSON/Markdown for any agent. The best
   reading experience, and `viz.html` stays offline and static, but mapping a rendered selection
   back to a source line is the hard part (rendered text differs from Markdown, and a diagram or
   widget has no line at all), and `hunk` is then only the receiving end.
3. **Close the loop with `hunk diff`.** Whichever way the notes are made, review what the agent
   did with them in `hunk diff` (the agent explains each change through `--agent-context`, the
   reader replies with notes, and the cycle repeats). This is the part `hunk` is built for, and
   it combines with either option above.

**Decision: option 2.** Comment in the HTML page, keep the web UX, and hand the notes to `hunk`.
Option 3 stays the way to review what the agent did. Option 1 is dropped.

To settle when this is built:

- **Anchoring.** Resolve a selection to `file` plus a source line by matching its text in the
  concept's Markdown (the page has the source). A selection that matches nothing, or sits in a
  diagram or widget, anchors to the nearest heading or the block's first line, and says so in
  the note.
- **Hand-off.** `good2go notes` turns the accumulated notes into the `hunk session comment
  apply` batch for a live session. Without `hunk` it prints a Markdown list for any agent, so
  `hunk` stays optional and is not a dependency.
- **Getting notes out of a static page.** `viz.html` makes no requests and cannot run a command,
  so notes are kept in `localStorage` and leave as a downloaded file or copied text that the
  command reads. Settle which, and keep it consistent with
  [ADR-0004](design/adr/0004-viz-html-stays-one-file.md).
- **Try first:** whether notes can be written on a plain file shown with `hunk open`, or only in
  a diff. If only in a diff, the batch has to target a diff that contains the lines.
