# Memory update log

## 2026-10-08
* **Creation**: Established the good2go memory bundle (OKF v0.2): root `index.md` and
  `log.md`, then the first lessons in `tooling-good2go/` and `codebase-good2go/`.
* **Copy-edit**: reworded every lesson body and both overviews to be plainer (by
  `claude-code/opus-5.5`). No claim, source, check or verification changed, so nothing was
  superseded.

## 2026-10-11
* **Catch-up** (by `claude-code/sonnet-5.5`): the work of 2026-10-09 to 10-11 was done in sessions
  without the memory hooks, so it was summarised afterwards. In order: ADRs 0005/0006 proposed
  bundle names and npm distribution (10-09); the package became `@jb9k62/good2go` with a
  `good2go` command, `okf/` became `design/`, the tools stopped being copied into projects
  (0.7.0, unpublished); `good2go hooks` and skills copied by `init` replaced the Claude plugin and
  pi package (ADR-0007); everything was renamed good2go, sources moved to `src/` as `g2g-*`, and
  `okf-update` and the legacy migration were dropped (ADR-0008); a review pass hardened the hooks,
  input validation and the release workflow; the npm scripts became `g2g:`; `hooks --local` was
  added. Seven lessons were added; the overviews were rewritten. No older lesson's claim changed.

## 2026-10-11

Benchmark session: five lessons added to tooling-good2go (the stream flag for hook events, the
headless Bash allow-list, why reports are copied to test/bench/reports, the hooks' cache, and the
first benchmark result). The tooling overview was rewritten to cover them and the two-day
dependency cool-down. No earlier lesson's claim changed.
