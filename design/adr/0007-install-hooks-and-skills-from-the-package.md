---
type: Architectural Decision
title: "ADR-0007: Install the hooks and skills from the package, per user by default"
description: Why `good2go hooks` writes the agent configuration, why the default is per user, and why the skills shrink to the judgement a command cannot give.
tags: [adr, distribution, hooks, skills, security]
generated: { by: claude-code/claude-sonnet-5-5, at: 2026-10-10T18:00:00Z }
sources:
  - resource: src/g2g-install-hooks.mts
  - resource: extensions/edukai.ts
  - resource: skills/good2go/SKILL.md
  - resource: skills/edukai/SKILL.md
---

# ADR-0007: Install the hooks and skills from the package, per user by default

- **Status:** accepted
- **Date:** 2026-10-10
- **Deciders:** the maintainers

## Context

After [ADR-0006](/adr/0006-publish-the-tools-to-npm.md) the tools are an npm package, but an
agent still reaches the skills and the memory hooks by three other routes: a Claude Code
plugin, a pi package, and `good2go skills` (skills only). A person who ran `npm i -g
@jb9k62/good2go` still has to learn which of those gives them the hooks.

ADR-0006 kept the hook in the plugin for two reasons that no longer hold. Node will not strip
types under `node_modules`, but the package now ships compiled JavaScript. And the hook had to
run where `node_modules` may not exist, which is true of a plugin folder but not of an
installed package.

Two things have not changed. A hook runs at the start of a session and on every file read and
edit, so it must start fast and must fail silent. And it must never run code that a cloned
repository supplies: opening an unfamiliar repository has to be safe.

The skills carry two kinds of content. Some is mechanics (which command to run, which flag),
which `good2go --help` and the generated npm scripts now say. The rest is judgement that no
command can give: what makes a concept page worth writing, how to review one, what deserves a
lesson, and how sure to be about it.

## Decision

We will install the hooks with a command, `good2go hooks`, and keep the skills as short
documents of judgement.

- **`good2go hooks` writes the configuration** for each harness found: Claude Code's
  `settings.json` entries (SessionStart, PostToolUse for Read and for Edit/Write/NotebookEdit,
  Stop), and a small pi extension. Each entry calls `good2go hook run`. The command is
  idempotent, takes `--dry-run` and `--remove`, edits only the entries it owns, and leaves the
  rest of the file alone.
- **The default scope is the user.** `npm i -g @jb9k62/good2go && good2go hooks` configures
  `~/.claude/settings.json` and pi's user folder. The code that runs is code the person
  installed, not code in a repository they opened.
- **`--project` is an explicit opt-in** that writes the project's `.claude/settings.json` and
  runs the project's own `node_modules/@jb9k62/good2go` (see the 2026-10-10 note). It prints the caveat that a repository
  can then run its own code at session start, which the harness's trust prompt only partly
  covers. A team that wants every clone covered can choose it.
- **`good2go hook run` is in-process and silent.** It answers from the cache `edukai:index`
  writes, exits 0 on any error or an old Node, and does not spawn a second process.
- **The skills shrink.** `SKILL.md` keeps triggers, authoring and review rules, and the lesson
  rules, and points at `good2go --help` for commands. `good2go init` copies the skills into
  the project (`.claude/skills/`, `.agents/skills/`) so a clone has them with no plugin;
  `good2go skills` stays for a personal install.
- **The plugin and the pi package are retired** (see the 2026-10-10 note): `good2go hooks` is
  the one route.

## Consequences

### Positive

- One install, `npm i -g @jb9k62/good2go && good2go hooks`, covers both harnesses.
- The default keeps the rule that a cloned repository cannot cause code to run through the hook.
- A clone carries its skills, so a teammate needs nothing beyond the package.
- Skills lose most of the text that goes stale when a flag changes.

### Trade-offs

- A global install is a step some people skip, and a project that only has the dependency gets
  no hooks until someone runs `good2go hooks`.
- Each hook call now starts `good2go` through the shell's `PATH`. A harness started from a
  launcher with a different `PATH` (a node version manager is the usual cause) can fail to find
  it; the hook then stays silent, and `good2go hooks --check` reports it.
- The written configuration can go stale when the package moves. `--check` compares it to the
  installed version.
- `--project` is a weaker trust position than the default, and it is on offer.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Keep the plugin and the pi package as the only route to hooks (or as a second route) | It is the route that needs a marketplace, a clone or a pi install beside the package, and it splits one product across three channels |
| `npx @jb9k62/good2go hook` as the hook command | Startup cost on every Read and Edit, with a 5-second timeout, and it needs the network when the cache is cold |
| Project scope as the default | Convenient for teams, but a repository then chooses what runs at session start |
| Drop the skills and put everything in `--help` | The authoring and review judgement has no home there, and an agent would not know to read it |
| Print the instructions through a `good2go guide` command instead of a skill | The harness cannot trigger it from a user's request, so the agent would have to know to ask |

## Note, 2026-10-10: one route, and how each scope calls good2go

The review of the first implementation changed three things above.

- **The Claude Code plugin and the pi package are retired.** `hooks/`, `.claude-plugin/`, and the
  `pi` key and `pi-package` keyword in `package.json` are gone. Two routes would print every
  brief twice for someone who used both, and kept the version in several files. `good2go hooks`
  is the only route; the version lives in `package.json` alone. `extensions/edukai.ts` stays only
  as the template the build copies to `dist/templates/pi-extension.ts`.
- **Both harnesses call `good2go` the same way.** At user scope the Claude entries and the pi
  extension run `good2go hook run` (pi: `good2go hook <command>`) by name, so they run the install
  the person put on `PATH`, never the absolute path of whichever copy ran `good2go hooks` (which,
  under `npx` in a cloned repository, would have been that repository's dependency). `good2go
  hooks` refuses to write user scope when `good2go` is not on `PATH` (`--force` overrides).
- **Project scope uses the project's file, not npx.** Claude runs
  `f="${CLAUDE_PROJECT_DIR:-.}/node_modules/@jb9k62/good2go/dist/good2go.mjs"; [ -f "$f" ] && node "$f" hook run || true`;
  the pi extension checks the same path exists before it runs `node` on it. That avoids npx's
  start-up cost on every read and edit, which this ADR rejected above, and is silent when the
  package is not installed. It is POSIX shell, so Windows needs Git Bash or WSL.
