# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through GitHub's
private vulnerability reporting: go to the repository's **Security** tab and choose
**Report a vulnerability** (or open <https://github.com/jb9k62/okf-bootstrap/security/advisories/new>).

Include the version (`good2go --version`), the steps to reproduce, and what you expect the impact
to be. You should get an acknowledgement within a week. Fixes are released as a new patch or minor
version, and the advisory is published with credit to the reporter unless you ask otherwise.

## Supported versions

Only the latest minor release of `@jb9k62/good2go` receives security fixes. Upgrade to the latest
release rather than backporting a fix to an older line.

## What the package does

- **No install scripts.** The package declares no `preinstall`, `install` or `postinstall` script,
  so installing it runs no code of its own. Keep it that way when changing `package.json`.
- **Runtime network.** The `good2go` command and its tools make no network requests and never check
  for updates. The viewer page it writes (`viz.html`) loads a few libraries from public CDNs
  (jsDelivr and cdnjs) when opened in a browser, each pinned to an exact version with a
  subresource integrity hash, so a tampered file fails to load rather than running. That is the
  current design, kept deliberately for now ([ADR-0004](design/adr/0004-viz-html-stays-one-file.md)); the
  page needs network access to render, and inlining the libraries would remove that.
- **Files read.** The tools read the project files they are pointed at (design documents, memory
  lessons, and the source files that lessons cite, which are only hashed, never executed).
- **Files written.** The tools write only under the paths the documentation names, such as the
  design bundle folder (`okf/` by default), `edukai/`, the `viz.html` and cache files inside
  them, and `.okf-bootstrap.json`, `okf-*-template.md` and `.okf-update/` in the project root. A re-run keeps files you have authored; only `--force` overwrites them.
- **The memory hook never runs project code.** The hook that tells an agent what its lessons say
  imports only Node built-ins and the bundled ranking module, and it never executes code from the
  project it runs in.

## How releases are made

1. A maintainer bumps the version in every place it is recorded, updates the changelog, and pushes
   a `v<version>` tag (see [docs/RELEASING.md](docs/RELEASING.md)).
2. The `release` workflow checks that the tag and the manifests agree, runs the full check suite,
   packs the tarball and smoke-tests it in a fresh project.
3. A maintainer approves the `npm` environment, and the workflow publishes with **npm trusted
   publishing**: GitHub issues a short-lived OIDC token for that run, so no long-lived npm token
   exists in the repository or in CI.
4. The publish carries a **provenance attestation** that links the tarball to the workflow run and
   commit that built it.

To verify an installed copy, run this in your project:

```sh
npm audit signatures
```

It checks the registry signatures and the provenance attestations of the installed packages.
