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
