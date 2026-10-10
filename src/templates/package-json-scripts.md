# package.json: scripts to add for the OKF tooling

`good2go init` adds these for you when a `package.json` is present, and a
`@jb9k62/good2go` devDependency. This is the reference for editing by hand. The design bundle is
`okf/` below; use your own folder if you passed `--design-dir`.

## Dependencies

- Node 24+.
- `@jb9k62/good2go` (dev dep): the tools, as the `good2go` command. Upgrade with `npm update`.
- `@mermaid-js/mermaid-cli@11` (dev dep, optional): provides `mmdc`, the real Mermaid parser
  behind `okf:mermaid`. Keep it on Mermaid 11. First run downloads a Chrome build (~170 MB).
- `playwright` (dev dep, optional): drives headless Chromium for `okf:mermaid:render`. Also run
  `npx playwright install chromium` once. Without it that script exits 2: the gate cannot run,
  which is not the same as passing.

```bash
npm install -D @jb9k62/good2go
npm install -D @mermaid-js/mermaid-cli@11 playwright
npx playwright install chromium
```

## Scripts

```json
{
  "scripts": {
    "okf:validate": "good2go validate okf",
    "okf:fix": "good2go fix okf",
    "okf:view": "good2go view okf",
    "okf:mermaid": "good2go mermaid okf",
    "okf:mermaid:render": "good2go view okf --check-render",
    "okf:search": "good2go search",
    "okf:recheck": "good2go recheck --bundle okf"
  }
}
```

With `--edukai` it also adds `edukai:validate`, `edukai:index`, `edukai:recheck`, `edukai:brief`,
`edukai:search` and `edukai:view`, which call `good2go validate edukai --strict`,
`good2go edukai index`, `good2go recheck`, `good2go hook brief`, `good2go search --bundle edukai`
and `good2go view edukai`.

Every gate exits 0 when everything checked passes, 1 when something is broken, and 2 when it
could not run.
