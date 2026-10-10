#!/usr/bin/env node
/**
 * Report which scaffolded templates the installed good2go package has changed since a project
 * was scaffolded.
 *
 *   good2go update [--dir <project>] [--write] [--allow-downgrade]
 *
 * Runs only when someone runs it: no network, no git, no background check. The tools themselves
 * are not copied into projects any more (they run from the installed package), so there is
 * nothing to refresh in scripts/ and this never touches it.
 *
 * Inputs: the project's install manifest `.okf-bootstrap.json` at its root (the legacy
 * `scripts/.okf-bootstrap.json` is read when the root has none), shaped
 * `{ version, name, templates: { <path under templates/>: sha256 } }`, and the templates this
 * package ships: the `templates/` directory next to this file, which works from
 * skills/okf-bootstrap/assets/ and from a compiled dist/ with a sibling templates/.
 *
 * A template is listed when its sha256 in the package differs from the one the manifest recorded
 * at install time, and the project's file is not already the release's template. Files you
 * authored are never compared with their template just because they differ.
 *
 *   (no flags)         Report only. Writes nothing.
 *   --write            Write the release's rendered copy of each listed template under
 *                      <project>/.okf-update/<project path>, for a hand diff. Project files and
 *                      the manifest are never modified.
 *   --dir <project>    The project (default: the current directory).
 *   --allow-downgrade  Go on when the manifest's version is newer than this package's.
 *
 * Exit codes: 0 nothing to do, or the report (and with --write the copies) written. 1 is not
 * used. 2 could not run (no manifest, bad manifest, templates missing, downgrade refused).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = '.okf-bootstrap.json';
const LEGACY_MANIFEST = path.join('scripts', MANIFEST);
const UPDATE_DIR = '.okf-update';
const PACKAGE_NAMES = ['@jb9k62/good2go', 'okf-bootstrap'];
const USAGE = 'usage: good2go update [--dir <project>] [--write] [--allow-downgrade]';

// Each template and where bootstrap.mts scaffolds it. Only files that exist in the project are
// reported, so a project without the memory bundle is not asked about it.
const TEMPLATE_MAP: ReadonlyArray<readonly [template: string, dest: string]> = [
  ['okf/index.md', 'okf/index.md'],
  ['okf/log.md', 'okf/log.md'],
  ['okf/adr/readme.md', 'okf/adr/readme.md'],
  ['okf/adr/template.md', 'okf/adr/template.md'],
  ['edukai/index.md', 'edukai/index.md'],
  ['edukai/log.md', 'edukai/log.md'],
  ['concept.md', 'okf-concept-template.md'],
  ['explainer.md', 'okf-explainer-template.md'],
];

class UpdateError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

interface Manifest {
  version: string;
  name?: string;
  templates: Record<string, string>;
  file: string;
}
interface Args {
  write: boolean;
  allowDowngrade: boolean;
  dir: string | null;
}
type Kind = 'release changed' | 'release changed, project edited';
interface Row {
  template: string;
  dest: string;
  kind: Kind;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function kebab(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'okf';
}

/** Same placeholder rule as bootstrap.mts, so a release template renders as a fresh scaffold would. */
function render(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `<${k}>`);
}

/** A template matches a project file when the file is the template with its placeholders filled in. */
function matchesTemplate(template: string, text: string): boolean {
  const pattern = template
    .split(/\{\{\w+\}\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s\\S]*?');
  return new RegExp(`^${pattern}$`).test(text);
}

function compareVersions(a: string, b: string): number {
  const x = a.replace(/^v/, '').split('.').map(Number);
  const y = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function parseArgs(argv: string[]): Args | null {
  const out: Args = { write: false, allowDowngrade: false, dir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--write') out.write = true;
    else if (a === '--allow-downgrade') out.allowDowngrade = true;
    else if (a === '--dir') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new UpdateError(2, `--dir needs a value\n${USAGE}`);
      out.dir = value;
    } else if (a === '-h' || a === '--help') {
      console.log(USAGE);
      return null;
    } else throw new UpdateError(2, `Unknown argument: ${a}\n${USAGE}`);
  }
  return out;
}

/** This package's version: the first package.json above this file named good2go (or okf-bootstrap). */
function packageVersion(): string {
  let dir = HERE;
  for (;;) {
    const file = path.join(dir, 'package.json');
    if (fs.existsSync(file)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { name?: unknown; version?: unknown };
        if (typeof pkg.name === 'string' && PACKAGE_NAMES.includes(pkg.name) && typeof pkg.version === 'string') {
          return pkg.version;
        }
      } catch {
        // an unreadable package.json is not ours; keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new UpdateError(2, `No package.json named ${PACKAGE_NAMES.join(' or ')} above ${HERE}`);
    dir = parent;
  }
}

function readManifest(target: string): Manifest {
  const file = [MANIFEST, LEGACY_MANIFEST].map((r) => path.join(target, r)).find((f) => fs.existsSync(f));
  if (file === undefined) {
    throw new UpdateError(
      2,
      `No ${MANIFEST} in ${target}, so this tool cannot tell which templates the release changed.\n` +
        'Scaffold the project with good2go first (good2go bootstrap).',
    );
  }
  const shown = path.relative(target, file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new UpdateError(2, `${shown} is not valid JSON (${(e as Error).message})`);
  }
  const m = parsed as { version?: unknown; name?: unknown; templates?: unknown } | null;
  const t = m?.templates;
  const ok =
    typeof m === 'object' &&
    m !== null &&
    typeof m.version === 'string' &&
    typeof t === 'object' &&
    t !== null &&
    !Array.isArray(t) &&
    Object.values(t).every((h) => typeof h === 'string');
  if (!ok) throw new UpdateError(2, `${shown} does not have the shape {"version", "templates": {path: sha256}}`);
  return {
    version: m.version as string,
    ...(typeof m.name === 'string' ? { name: m.name } : {}),
    templates: t as Record<string, string>,
    file: shown,
  };
}

/** The templates directory beside this file: skills/okf-bootstrap/assets/templates or dist/templates. */
function templatesDir(): string {
  const dir = path.join(HERE, 'templates');
  if (!fs.existsSync(dir)) throw new UpdateError(2, `No templates/ directory beside ${HERE}`);
  return dir;
}

function classify(target: string, manifest: Manifest, templates: string): Row[] {
  const rows: Row[] = [];
  for (const [template, dest] of TEMPLATE_MAP) {
    const local = path.join(target, dest);
    const source = path.join(templates, template);
    if (!fs.existsSync(local) || !fs.existsSync(source)) continue;
    const upstream = fs.readFileSync(source);
    const installed = manifest.templates[template];
    const text = upstream.toString('utf8');
    const projectIsRelease = matchesTemplate(text, fs.readFileSync(local, 'utf8'));
    // Release unchanged since install: nothing to report, whether or not the project was edited.
    if (installed !== undefined ? installed === sha256(upstream) : projectIsRelease) continue;
    // The project already holds the release's template: it was adopted by hand.
    if (projectIsRelease) continue;
    // A file that has not changed since install would have matched the *old* template, which is
    // not on disk; so a project that differs from the new one is reported as possibly edited only
    // when the manifest cannot say (no recorded hash).
    rows.push({ template, dest, kind: installed === undefined ? 'release changed, project edited' : 'release changed' });
  }
  return rows;
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 0;
  const target = path.resolve(args.dir ?? process.cwd());
  const manifest = readManifest(target);
  const version = packageVersion();
  const templates = templatesDir();

  if (!args.allowDowngrade && compareVersions(manifest.version, version) > 0) {
    throw new UpdateError(
      2,
      `${manifest.file} was written by ${manifest.version}, newer than the installed ${version}. Pass --allow-downgrade to go on.`,
    );
  }

  const rows = classify(target, manifest, templates);
  if (rows.length === 0) {
    console.log(`up to date: no template changed between ${manifest.version} and ${version}`);
    return 0;
  }
  console.log(`good2go update: scaffolded with ${manifest.version}, installed ${version}`);
  console.log(`  project: ${target}\n`);
  console.log('Templates the release changed (your files are never overwritten):');
  for (const r of rows) {
    const copy = path.posix.join(UPDATE_DIR, r.dest);
    console.log(`  ${r.kind.padEnd(32)} ${r.dest}   ${args.write ? 'hand diff' : 'would write'} ${copy}`);
  }
  console.log('  Your files are yours: merge by hand if useful.');

  if (!args.write) {
    console.log('\nReport only: nothing was written. Run again with --write to write the copies.');
    return 0;
  }
  const now = new Date().toISOString();
  const vars: Record<string, string> = {
    PROJECT_NAME: manifest.name ?? path.basename(target),
    PROJECT_SLUG: kebab(manifest.name ?? path.basename(target)),
    TODAY: now.slice(0, 10),
    NOW: now.replace(/\.\d{3}Z$/, 'Z'),
    VERSION: version,
  };
  for (const r of rows) {
    const dest = path.join(target, UPDATE_DIR, r.dest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, render(fs.readFileSync(path.join(templates, r.template), 'utf8'), vars));
  }
  console.log(`\nWrote ${rows.length} template cop${rows.length === 1 ? 'y' : 'ies'} under ${UPDATE_DIR}/.`);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof UpdateError) {
    console.error(e.message);
    process.exitCode = e.code;
  } else {
    console.error(`good2go update could not run: ${(e as Error).message}`);
    process.exitCode = 2;
  }
}
