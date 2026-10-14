#!/usr/bin/env node
/**
 * good2go build-view and good2go open: write the viewer for every bundle of a project, and a
 * landing page that links them.
 *
 *   good2go build-view [bundle...] [--widgets <f>] [--strict] [--project-dir <dir>]
 *   good2go open [bundle] [--widgets <f>] [--strict] [--no-open] [--project-dir <dir>]
 *
 *   build-view   With no bundle, builds <bundle>/viz.html for every bundle the project's
 *                .good2go.json lists, and writes viz.html at the project root: a landing page
 *                with a card per bundle (title, concepts, links, issues). With bundles named,
 *                builds just those and leaves the landing page as it was.
 *   open         Builds, then opens the result in the default browser: the landing page, or,
 *                given a bundle, that bundle's viewer. A bundle is a folder (design) or the
 *                last part of a listed one (a bundle listed as docs/ops opens as ops).
 *   --widgets    The built widget bundle to inline (passed to the viewer).
 *   --strict     Exit 1 if any bundle has conformance issues (they are still built).
 *   --no-open    With open: build and print the path, but start no browser.
 *   --project-dir  The project root (default: the working directory).
 *
 * Exit codes: 0 built, 1 issues under --strict, 2 could not run (no bundles, an unknown bundle,
 * a viewer that failed). The tools make no network requests; the viewer pages load their own
 * libraries from a CDN when opened.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { helpFromComment, MANIFEST, recordedBundles, siblingFile } from './g2g-shared.mts';

interface Summary {
  title: string;
  concepts: number;
  edges: number;
  issues: number;
  stale: number;
}
interface Built {
  dir: string;
  summary: Summary;
}

const LANDING = 'viz.html';

function usage(message: string): number {
  console.error(`good2go: ${message}\n\n${helpFromComment(import.meta.url)}`);
  return 2;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The landing page: one self-contained file, no scripts, readable in light and dark. */
function landingHtml(project: string, built: Built[]): string {
  const cards = built
    .map(({ dir, summary }) => {
      const facts = [
        `${summary.concepts} concept${summary.concepts === 1 ? '' : 's'}`,
        `${summary.edges} link${summary.edges === 1 ? '' : 's'}`,
      ];
      if (summary.stale) facts.push(`${summary.stale} stale`);
      const issues =
        summary.issues === 0
          ? '<span class="ok">no issues</span>'
          : `<span class="bad">${summary.issues} issue${summary.issues === 1 ? '' : 's'}</span>`;
      return (
        `<li><a href="${escapeHtml(dir)}/viz.html"><strong>${escapeHtml(summary.title)}</strong>` +
        `<code>${escapeHtml(dir)}/</code><span>${facts.join(' · ')} · ${issues}</span></a></li>`
      );
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(project)}: bundles</title>
<style>
:root { color-scheme: light dark; --bg: #fafafa; --fg: #1d1d1f; --muted: #5c5c66; --card: #fff; --line: #d9d9e0; --accent: #1b5fd1; --ok: #176b3a; --bad: #b3261e; }
@media (prefers-color-scheme: dark) { :root { --bg: #16161a; --fg: #ececf1; --muted: #a0a0ad; --card: #1f1f26; --line: #34343e; --accent: #7aa7ff; --ok: #6fd69a; --bad: #ff8a80; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 44rem; margin: 0 auto; padding: 3rem 1rem; }
h1 { margin: 0 0 .25rem; font-size: 1.6rem; }
p { margin: 0 0 1.5rem; color: var(--muted); }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .75rem; }
a { display: grid; gap: .15rem; padding: 1rem 1.15rem; background: var(--card); border: 1px solid var(--line); border-radius: 10px; color: inherit; text-decoration: none; }
a:hover, a:focus-visible { border-color: var(--accent); outline: none; }
strong { font-size: 1.1rem; color: var(--accent); }
code { color: var(--muted); font-size: .85rem; }
span { color: var(--muted); font-size: .9rem; }
.ok { color: var(--ok); } .bad { color: var(--bad); font-weight: 600; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(project)}</h1>
<p>${built.length} bundle${built.length === 1 ? '' : 's'}. Pick one to read it.</p>
<ul>
${cards}
</ul>
</main>
</body>
</html>
`;
}

/** Start the platform's opener without waiting for the browser; false when it could not start. */
async function openInBrowser(file: string): Promise<boolean> {
  const [cmd, args]: [string, string[]] =
    process.platform === 'darwin'
      ? ['open', [file]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', file]]
        : ['xdg-open', [file]];
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

async function main(argv: string[]): Promise<number> {
  const command = argv[0] === 'open' ? 'open' : 'build-view';
  const args = argv[0] === 'open' || argv[0] === 'build-view' ? argv.slice(1) : argv;
  const named: string[] = [];
  let widgets: string | null = null;
  let strict = false;
  let launch = true;
  let project = process.cwd();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const value = (): string | null => {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) return null;
      i++;
      return v;
    };
    if (a === '-h' || a === '--help') {
      console.log(helpFromComment(import.meta.url));
      return 0;
    } else if (a === '--widgets') {
      widgets = value();
      if (widgets === null) return usage('--widgets needs a file');
    } else if (a === '--project-dir') {
      const v = value();
      if (v === null) return usage('--project-dir needs a folder');
      project = path.resolve(v);
    } else if (a === '--strict') strict = true;
    else if (a === '--no-open') launch = false;
    else if (a.startsWith('-')) return usage(`unknown option ${a}`);
    else named.push(a);
  }
  if (command === 'open' && named.length > 1) return usage('open takes one bundle, or none for the landing page');
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) return usage(`project folder ${project} does not exist`);

  const listed = recordedBundles(project);
  // A name is a folder under the project, or the last part of a listed bundle.
  const resolve = (name: string): string | null => {
    const clean = name.replace(/\\/g, '/').replace(/\/+$/, '').replace(/^\.\//, '');
    if (clean && fs.existsSync(path.join(project, clean, 'index.md'))) return clean;
    return listed.find((d) => d.split('/').pop() === clean) ?? null;
  };
  let dirs: string[];
  if (named.length) {
    dirs = [];
    for (const name of named) {
      const dir = resolve(name);
      if (dir === null) {
        console.error(
          `good2go: no bundle "${name}" in ${project}` + (listed.length ? ` (the manifest lists: ${listed.join(', ')})` : ''),
        );
        return 2;
      }
      const rel = path.relative(project, path.resolve(project, dir));
      if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
        console.error(`good2go: ${name}: refused, it is not inside ${project}`);
        return 2;
      }
      dirs.push(dir);
    }
  } else {
    dirs = listed.filter((d) => fs.existsSync(path.join(project, d, 'index.md')));
    for (const d of listed) if (!dirs.includes(d)) console.warn(`good2go: ${d}/ is listed in ${MANIFEST} but has no index.md; skipped`);
    if (!dirs.length) {
      console.error(
        `good2go: no bundles to build: ${MANIFEST} lists none here. Run good2go init, or name a folder: good2go ${command} <bundle>`,
      );
      return 2;
    }
  }

  const viewer = siblingFile(import.meta.url, 'g2g-view');
  if (!viewer) {
    console.error('good2go: g2g-view is not next to g2g-build-view');
    return 2;
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'g2g-build-view-'));
  const built: Built[] = [];
  let withIssues = 0;
  try {
    for (const dir of dirs) {
      const summaryFile = path.join(scratch, dir.replace(/\//g, '_') + '.json');
      const viewArgs = [viewer, dir, '--summary', summaryFile];
      if (widgets !== null) viewArgs.push('--widgets', widgets);
      const r = spawnSync(process.execPath, viewArgs, { cwd: project, encoding: 'utf8' });
      let summary: Summary | null = null;
      try {
        summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8')) as Summary;
      } catch {
        // the viewer failed before it got that far
      }
      if (r.status !== 0 || summary === null) {
        process.stdout.write(r.stdout ?? '');
        process.stderr.write(r.stderr ?? '');
        console.error(`good2go: could not build ${dir}/`);
        return 2;
      }
      if (summary.issues) withIssues++;
      built.push({ dir, summary });
      console.log(
        `built ${dir}/viz.html  (${summary.concepts} concepts, ${summary.issues} issue${summary.issues === 1 ? '' : 's'})`,
      );
      if (summary.issues) console.log(`  run good2go validate ${dir} for the list`);
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  let target = path.join(project, dirs[0]!, 'viz.html');
  if (named.length === 0) {
    let title = path.basename(project);
    try {
      const m = JSON.parse(fs.readFileSync(path.join(project, MANIFEST), 'utf8')) as { name?: unknown };
      if (typeof m.name === 'string' && m.name.trim()) title = m.name.trim();
    } catch {
      // no manifest name: the folder's
    }
    target = path.join(project, LANDING);
    fs.writeFileSync(target, landingHtml(title, built), 'utf8');
    console.log(`built ${LANDING}  (landing page: ${built.length} bundle${built.length === 1 ? '' : 's'})`);
  }
  console.log(`\n${pathToFileURL(target).href}`);

  if (command === 'open' && launch) {
    if (!(await openInBrowser(target))) console.log('could not start a browser; open the file above yourself.');
  }
  return strict && withIssues ? 1 : 0;
}

process.exitCode = await main(process.argv.slice(2));
