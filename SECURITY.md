# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through GitHub's
private vulnerability reporting: go to the repository's **Security** tab and choose
**Report a vulnerability** (or open <https://github.com/jb9k62/good2go/security/advisories/new>).

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
- **Files written.** Each command writes only what its `--help` names:
  - `good2go init`: the design bundle folder (`okf/` by default) and `edukai/` with `--edukai`,
    `.good2go.json`, concept and explainer templates, `AGENTS.md` (a short pointer to the memory
    bundle, appended once), `package.json` (npm scripts and the dependency), the skills in
    `.claude/skills/` and `.agents/skills/`, and with `--widgets` the `packages/okf-widgets`
    workspace. A re-run keeps files you have authored; only `--force` overwrites them.
  - `good2go new`: the bundle folder you name.
  - `good2go view`, `search`, `edukai`: `viz.html` and the memory index inside the bundle's
    project, plus search's cache under `node_modules/.cache` or, with no `node_modules`, a private
    per-user folder in the temp directory.
  - `good2go skills`: skill folders under `~/.claude/skills`, `~/.pi/agent/skills` and, only when
    asked for with `--agents`, `~/.agents/skills`; nothing existing is replaced without `--force`.
  - `good2go hooks`: user scope (the default) edits `~/.claude/settings.json` (or
    `$CLAUDE_CONFIG_DIR`) and writes `~/.pi/agent/extensions/edukai.ts` (or
    `$PI_CODING_AGENT_DIR`); `--project` writes `.claude/settings.json` and
    `.pi/extensions/edukai.ts` in the current folder; `--local` writes
    `.claude/settings.local.json` (yours alone, meant to stay uncommitted; Claude Code only). It touches only entries whose command is
    `good2go hook run` (or the project form) and a pi file it marked as its own, refuses a
    `settings.json` that is not valid JSON, and `--remove` and `--dry-run` exist.
- **What the memory hook runs.** The hook is `good2go hook run`: it reads the cache the project's
  `edukai/` writes and prints text for the agent. It never executes code from the project it runs
  in. At user scope (the default), the command it starts is the `good2go` the person installed
  themselves, found on `PATH`; `good2go hooks` will not write the configuration when `good2go` is
  not on `PATH`, and the extension and hook stay silent when it goes missing. The exception is
  `good2go hooks --project`: the hook then runs `node_modules/@jb9k62/good2go` from the project,
  which is code the repository (through its lockfile) supplies, at session start and on every
  read and edit. Use `--project` only for a repository you trust, and review the committed
  `.claude/settings.json` and `.pi/extensions/edukai.ts` like any other code. The project command
  is POSIX shell (`sh` or Git Bash); it is not written for plain `cmd.exe` or PowerShell.
- **Hook output is untrusted text.** Lessons are written by agents and people, and the hook puts
  them in front of an agent, prefixed `edukai:`. Review changes to `edukai/` as you review code.

## How releases are made

1. A maintainer bumps the version in `package.json`, updates the changelog, and pushes a
   `v<version>` tag (see [docs/RELEASING.md](docs/RELEASING.md)).
2. The `release` workflow checks that the tag and `package.json` agree, installs dependencies with
   `--ignore-scripts`, runs the full check suite, packs the tarball, smoke-tests it in a fresh
   project and stores that tarball.
3. A maintainer approves the `npm` environment, and the workflow publishes that same tarball with
   **npm trusted publishing**: GitHub issues a short-lived OIDC token for that run, so no long-lived npm token
   exists in the repository or in CI.
4. The first version was published by hand and has no attestation. Every later publish carries a **provenance attestation** that links the tarball to the workflow run and
   commit that built it.

To verify an installed copy, run this in your project:

```sh
npm audit signatures
```

It checks the registry signatures and the provenance attestations of the installed packages.
