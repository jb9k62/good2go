# TODO

## Remove the legacy `scripts/okf-*` migration (target: 0.9.0)

0.7.0 moved the tools into the `@jb9k62/good2go` package. Two pieces of code exist only to carry
projects scaffolded earlier across, and are deprecated: delete them once the minor releases after
0.7.0 have given everyone time to run `good2go init --tools-only` once.

- `bootstrap.mts`: `LEGACY_MANIFEST`, the fallback in `previousManifest()`, and the "tooling" migration block that removes `scripts/okf-*` copies.
- `okf-update.mts`: the `scripts/.okf-bootstrap.json` fallback in `readManifest`.
- Tests: the migration block in `test/bootstrap.test.mts` and the legacy-manifest case in `test/update.test.mts`.
- Docs: the migration notes in the README, `SKILL.md` and the changelog (`design/okf-bootstrap/tools.md` has the same list).

## Cast validation in OKF tools

**How to integrate the cast system into okf-bootstrap validation:**

The demo bundle defines `cast.json` with approved persona names (Sam, Noor, Dana, Amira, Lee) that map to their roles. Explainers declare which cast members they use via `cast: [Name1, Name2, ...]` frontmatter.

This can be baked into the toolchain:

1. **`okf-core.mts` or a new validator**: Parse `cast.json` from a bundle root (if present) and extract approved names. Add a validation gate that checks every concept's frontmatter and markdown body for names not in the cast, flagging them as unknown personas.

2. **Error reporting**: When an explainer references an unapproved name, report it as a gate failure (exit code 1) with the file path, line, and suggestion ("did you mean X?").

3. **`okf-view.mts`**: When rendering a concept that declares a cast, highlight personas in the UI or link them to their role definition (from `cast.json`).

4. **Scaffolding**: When `bootstrap.mts` creates a new bundle, offer to generate a `cast.json` template if the project has explainers.

5. **Search ranking**: In `okf-search.mts`, boost concepts that cite the cast and penalize those with undefined personas.

6. **Bundle validation in CI**: Add a test in `test/bootstrap.test.mts` that checks the demo bundle's cast is consistent across all concepts—no typos in names, no referenced-but-undefined personas.

**Why**: Keeps persona definitions centralized and stable. Names stay fixed; roles can evolve. Tooling catches copy-paste errors ("Samm", "SAM") early. Tours stay readable; validation is data-driven.
