#!/usr/bin/env node
/**
 * Bootstrap an OKF knowledge bundle into a project: `good2go init`.
 *
 * The tools are not copied into the project. It depends on the `@jb9k62/good2go` package, and
 * the npm scripts this adds call its `good2go` command. Run from source, this is TypeScript
 * that Node runs directly (Node 24+); from the package it is compiled JavaScript.
 *
 * Scaffolds into a target project directory (default: current dir):
 *   <design>/index.md         : the design bundle's root index (reserved, no `type` needed);
 *                               <design> is okf/ unless --design-dir says otherwise
 *   <design>/log.md           : update history (reserved)
 *   <design>/adr/readme.md    : decision records index (type: Reference)
 *   <design>/adr/template.md  : ADR template (type: Reference)
 *   .okf-bootstrap.json       : the install manifest: version, name, the design folder, and the
 *                               sha256 of each template, which `good2go update` compares
 *   edukai/index.md, log.md   : with --edukai, the memory bundle: what agents have learned
 *   AGENTS.md                 : with --edukai, a short marked snippet pointing agents at it
 *   okf-concept-template.md   : authoring aid for a reference concept (outside the bundle)
 *   okf-explainer-template.md : authoring aid for a guided tour: callouts, widgets, a quiz
 *   .claude/skills/<skill>/   : the skills (SKILL.md and references, no tools), so a clone has them
 *   .agents/skills/<skill>/   : the same, for pi and other agents that read the shared location
 *   packages/okf-widgets/     : with --widgets, the React micro-world package (a workspace)
 *
 * and adds the okf: npm scripts and a `@jb9k62/good2go` devDependency to package.json.
 * Other bundles (ops, runbooks, notes) are made with `good2go new`.
 *
 * Re-running is safe: authored files (index.md, log.md in either bundle, the ADR index and
 * template, the two authoring templates) are kept if they already exist, and only --force
 * replaces them. The AGENTS.md snippet is written once and never replaced.
 * packages/okf-widgets is the project's own code once scaffolded, so it is never replaced,
 * not even by --force. A skill folder that already exists is kept (--force replaces it); the
 * skills are not recorded in the manifest.
 *
 * A project scaffolded by an older release holds copies of the tools in scripts/okf-*.mts.
 * A re-run removes each copy that still matches the hash the old manifest recorded, and keeps
 * (and names) one the project edited.
 *
 * Usage:
 *   good2go init [target-dir] [--name "Project Name"] [--slug project-slug] [--design-dir okf]
 *                [--widgets] [--edukai] [--tools-only] [--no-scripts] [--no-skills] [--force]
 *
 *   --name        Human title used in index.md (default: basename of target dir).
 *   --slug        Lowercase id for the concept dir (default: kebab-case of name).
 *   --design-dir  The design bundle's folder (default: okf, or the one the manifest records).
 *                 Choose it on the first run; a re-run never renames a folder.
 *   --widgets     Also scaffold packages/okf-widgets (React widgets for explainers), add it
 *                 to the npm workspaces, and build it before okf:view and the render gate.
 *   --edukai      Also scaffold edukai/, the agent memory bundle, add the edukai: scripts, and
 *                 write a short snippet into AGENTS.md (once; a marker guards it).
 *   --tools-only  Only migrate and refresh package.json (scripts, dependency) and remove old
 *                 script copies, leaving the bundle content untouched.
 *   --no-scripts  Do not add the `okf:` scripts to package.json.
 *   --no-skills   Do not copy the skills into .claude/skills/ and .agents/skills/.
 *   --force       Overwrite authored files with the templates again. This throws away
 *                 hand-written content, including log.md's history.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(HERE, 'templates');
// The producer stamped into scaffolded frontmatter (OKF actor convention: <producer>/<version>).
// Kept equal to package.json's version by the test suite.
const VERSION = '0.7.0';
const PACKAGE = '@jb9k62/good2go';
// The range written into a project's devDependencies: this release and compatible later ones.
const DEPENDENCY_RANGE = '^' + VERSION;
// Written into the target on every run: the version and name, the design folder, and the sha256
// of each template, so `good2go update` can tell a template a release changed from one edited.
const MANIFEST = '.okf-bootstrap.json';
// DEPRECATED, remove in 0.9.0 with the migration block below (TODO.md). Releases before the package kept it here, with the hash of each copied script.
const LEGACY_MANIFEST = path.join('scripts', '.okf-bootstrap.json');
// The templates the manifest records, keyed by their path under templates/. okf-update.mts has
// the same list (TEMPLATE_MAP), with where each is scaffolded.
const MANIFEST_TEMPLATES: readonly string[] = [
  'okf/index.md',
  'okf/log.md',
  'okf/adr/readme.md',
  'okf/adr/template.md',
  'edukai/index.md',
  'edukai/log.md',
  'concept.md',
  'explainer.md',
];
const WIDGETS_DIR = 'packages/okf-widgets';
const WIDGETS_PKG = 'okf-widgets';
// The snippet is written into AGENTS.md once; this marker is how a re-run knows it is there.
const EDUKAI_MARKER = '<!-- edukai -->';
const EDUKAI_SNIPPET = [
  EDUKAI_MARKER,
  'This project keeps agent memory in ./edukai/. Lines that start `edukai:` in messages and tool',
  'results come from its memory hooks; treat them as project guidance. At the start of a session run',
  '`npm run edukai:brief` and read the overview of the domain you will work in. Record what you',
  'learn with the edukai skill. Before finishing, run `npm run edukai:recheck`.',
  '<!-- /edukai -->',
].join('\n');

interface Options {
  dir: string;
  name: string | null;
  slug: string | null;
  designDir: string | null;
  scripts: boolean;
  skills: boolean;
  toolsOnly: boolean;
  force: boolean;
  widgets: boolean;
  edukai: boolean;
}

type Vars = Record<string, string>;

function kebab(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'okf';
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function render(text: string, vars: Vars): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `<${k}>`);
}

function parseArgs(argv: string[]): Options {
  const out: Options = {
    dir: '.',
    name: null,
    slug: null,
    designDir: null,
    scripts: true,
    skills: true,
    toolsOnly: false,
    force: false,
    widgets: false,
    edukai: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--name') out.name = argv[++i] ?? null;
    else if (a === '--slug') out.slug = argv[++i] ?? null;
    else if (a === '--design-dir') out.designDir = argv[++i] ?? null;
    else if (a === '--tools-only') out.toolsOnly = true;
    else if (a === '--no-scripts') out.scripts = false;
    else if (a === '--no-skills') out.skills = false;
    else if (a === '--force') out.force = true;
    else if (a === '--widgets') out.widgets = true;
    else if (a === '--edukai') out.edukai = true;
    else if (a === '-h' || a === '--help') {
      console.log(
        'usage: good2go init [target-dir] [--name "Project Name"] [--slug slug] [--design-dir okf]\n' +
          '                    [--widgets] [--edukai] [--tools-only] [--no-scripts] [--no-skills] [--force]',
      );
      process.exit(0);
    } else if (a.startsWith('-')) {
      console.error('Unknown flag: ' + a);
      process.exit(2);
    } else out.dir = a;
  }
  return out;
}

function copyFile(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeRendered(src: string, dest: string, vars: Vars): void {
  const text = fs.readFileSync(src, 'utf8');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, render(text, vars));
}

/** Copy a template directory, leaving out what a build or an install left behind. */
function copyTree(src: string, dest: string): void {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (from) => !/(^|[\\/])(node_modules|dist)([\\/]|$)/.test(path.relative(src, from)),
  });
}

const [major = 0] = process.versions.node.split('.').map(Number);
if (major < 24) {
  console.error(
    `Node ${process.versions.node} is too old for the OKF tools. They need Node 24+.`,
  );
  process.exit(2);
}

const opts = parseArgs(process.argv.slice(2));
const target = path.resolve(opts.dir);
const created: string[] = [];
const kept: string[] = [];
const shortPath = (p: string) => path.relative(target, p) || p;

/**
 * Authored content is never replaced without --force: log.md is a history, index.md and
 * adr/readme.md are indexes that get filled in by hand, and a re-run to refresh the tools
 * should not cost any of it.
 */
function writeUnlessPresent(dest: string, write: () => void): boolean {
  if (fs.existsSync(dest) && !opts.force) {
    kept.push(shortPath(dest));
    return false;
  }
  write();
  created.push(shortPath(dest));
  return true;
}

fs.mkdirSync(target, { recursive: true });
// A project keeps the name and the design folder it was scaffolded with: the manifest remembers
// them, so a re-run (or an update) renders templates the same way.
interface Manifest {
  name?: string;
  designDir?: string;
  files?: Record<string, string>;
}
function readManifest(rel: string): Manifest | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(target, rel), 'utf8')) as Manifest;
  } catch {
    return null;
  }
}
function previousManifest(): Manifest | null {
  return readManifest(MANIFEST) ?? readManifest(LEGACY_MANIFEST);
}
const previous = previousManifest();
const name = opts.name ?? (typeof previous?.name === 'string' ? previous.name : path.basename(target));
const slug = opts.slug ?? kebab(name);
const designDir = opts.designDir ?? (typeof previous?.designDir === 'string' ? previous.designDir : 'okf');
if (designDir.split(/[\\/]/).includes('..') || path.isAbsolute(designDir) || designDir === '' || designDir === '.') {
  console.error(`--design-dir must be a folder inside the project, not "${designDir}"`);
  process.exit(2);
}
const vars: Vars = {
  PROJECT_NAME: name,
  PROJECT_SLUG: slug,
  TODAY: today(),
  // OKF timestamps are ISO 8601 datetimes with an offset (SPEC §5).
  NOW: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  VERSION,
};

// --- bundle skeleton (skipped entirely by --tools-only) ---------------------
const okf = path.join(target, designDir);
if (opts.toolsOnly) {
  if (!fs.existsSync(okf)) {
    console.error(`--tools-only needs an existing ${designDir}/ bundle in ${target}`);
    process.exit(2);
  }
} else {
  fs.mkdirSync(path.join(okf, 'adr'), { recursive: true });
  // A design bundle named design/ would otherwise hold design/design/.
  for (const extra of [...new Set([designDir === 'design' ? 'architecture' : 'design', slug])]) {
    fs.mkdirSync(path.join(okf, extra), { recursive: true });
    if (!fs.existsSync(path.join(okf, extra, '.gitkeep'))) {
      fs.writeFileSync(path.join(okf, extra, '.gitkeep'), '');
    }
  }
  for (const rel of ['index.md', 'log.md', 'adr/readme.md', 'adr/template.md']) {
    const dest = path.join(okf, rel);
    writeUnlessPresent(dest, () => writeRendered(path.join(TEMPLATES, 'okf', rel), dest, vars));
  }
}

// --- memory bundle (--edukai) -------------------------------------------------
// Opt-in, and unlike okf/ it may be added to a project that already has a design bundle, so
// --tools-only does not skip it.
const edukai = path.join(target, 'edukai');
if (opts.edukai) {
  for (const rel of ['index.md', 'log.md']) {
    const dest = path.join(edukai, rel);
    writeUnlessPresent(dest, () => writeRendered(path.join(TEMPLATES, 'edukai', rel), dest, vars));
  }
  // For agents with no hooks (a skills-only install, or another harness): the same pointer,
  // in the file they read at the start of a session.
  const agents = path.join(target, 'AGENTS.md');
  const existing = fs.existsSync(agents) ? fs.readFileSync(agents, 'utf8') : null;
  if (existing !== null && existing.includes(EDUKAI_MARKER)) {
    kept.push('AGENTS.md (the edukai snippet is already there)');
  } else {
    const lead = existing === null ? '# AGENTS.md\n\n' : existing.replace(/\n*$/, '\n\n');
    fs.writeFileSync(agents, lead + EDUKAI_SNIPPET + '\n');
    created.push(existing === null ? 'AGENTS.md' : 'AGENTS.md (added the edukai snippet)');
  }
}
// A project that already has the memory bundle keeps its scripts, even on a plain re-run.
const hasEdukai = fs.existsSync(path.join(edukai, 'index.md'));

// --- tooling ----------------------------------------------------------------
// The tools live in the package, not the project. A project scaffolded before that holds copies
// in scripts/: remove each one that still matches what the old manifest recorded, and name any
// the project has edited, which are never deleted.
const migrated: string[] = [];
const editedCopies: string[] = [];
{
  const old = readManifest(LEGACY_MANIFEST);
  for (const [rel, hash] of Object.entries(old?.files ?? {})) {
    const file = path.join(target, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    if (sha256(file) === hash) {
      fs.rmSync(file);
      migrated.push(rel);
    } else {
      editedCopies.push(rel);
    }
  }
  if (old !== null) {
    fs.rmSync(path.join(target, LEGACY_MANIFEST));
    migrated.push(LEGACY_MANIFEST);
    // Leave scripts/ if the project put nothing else in it.
    try {
      fs.rmdirSync(path.join(target, 'scripts'));
    } catch {
      // Not empty, or not there: not ours to remove.
    }
  }
}
// The authoring templates are aids people edit, so they follow the bundle content's rule.
for (const [template, dest] of [
  ['concept.md', 'okf-concept-template.md'],
  ['explainer.md', 'okf-explainer-template.md'],
] as const) {
  // A tools-only run on a project that has been bootstrapped before (it has a manifest) does not
  // bring back an aid someone deleted.
  if (opts.toolsOnly && previous !== null) continue;
  const out = path.join(target, dest);
  writeUnlessPresent(out, () => copyFile(path.join(TEMPLATES, template), out));
}

// --- skills -------------------------------------------------------------------
// A clone carries its skills, so a teammate needs no plugin. The folder is the skills shipped
// beside this file (the package) or the repository's own (from source). Same rule as authored
// files: an existing skill folder is kept unless --force. Nothing is recorded in the manifest.
/** Copy a skill's SKILL.md and references; symlinks and the tools (assets, node_modules, dist) are left out. */
function copySkill(source: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (['assets', 'node_modules', 'dist'].includes(entry.name) || entry.name.includes('..')) continue;
    const from = path.join(source, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copySkill(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}
if (opts.skills) {
  const root = [path.join(HERE, 'skills'), path.resolve(HERE, '..', '..')].find((dir) =>
    fs.existsSync(path.join(dir, 'okf-bootstrap', 'SKILL.md')),
  );
  if (root === undefined) {
    console.warn('  no skills found beside this tool; skipped copying them (--no-skills hides this).');
  } else {
    const names = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, 'SKILL.md')))
      .map((e) => e.name)
      .sort();
    for (const home of ['.claude', '.agents']) {
      for (const skill of names) {
        const dest = path.join(target, home, 'skills', skill);
        if (fs.lstatSync(dest, { throwIfNoEntry: false }) && !opts.force) {
          kept.push(shortPath(dest) + '/');
          continue;
        }
        // rmSync removes a symbolic link itself, never what it points at.
        fs.rmSync(dest, { recursive: true, force: true });
        copySkill(path.join(root, skill), dest);
        created.push(shortPath(dest) + '/');
      }
    }
  }
}

// The manifest holds the hash of each template this version ships, so `good2go update` can tell
// which ones a release changed. It is generated, so it is always overwritten.
{
  const templates: Record<string, string> = {};
  for (const rel of MANIFEST_TEMPLATES) {
    if (fs.existsSync(path.join(TEMPLATES, rel))) templates[rel] = sha256(path.join(TEMPLATES, rel));
  }
  fs.writeFileSync(
    path.join(target, MANIFEST),
    JSON.stringify({ version: VERSION, name, designDir, templates }, null, 2) + '\n',
  );
}

// --- widgets ------------------------------------------------------------------
const widgetsPath = path.join(target, WIDGETS_DIR);
if (opts.widgets) {
  if (fs.existsSync(widgetsPath)) {
    kept.push(WIDGETS_DIR + '/ (project code; never replaced, not even by --force)');
  } else {
    copyTree(path.join(TEMPLATES, 'okf-widgets'), widgetsPath);
    created.push(WIDGETS_DIR + '/');
  }
}
// A project that already has the package keeps getting it built, even on a plain re-run.
const hasWidgets = fs.existsSync(path.join(widgetsPath, 'package.json'));

// --- package.json -------------------------------------------------------------
if (opts.scripts) {
  const pkgPath = path.join(target, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      pkg.scripts = pkg.scripts || {};
      const build = hasWidgets ? 'npm run okf:widgets:build && ' : '';
      const d = designDir;
      pkg.scripts['okf:validate'] = `good2go validate ${d}`;
      pkg.scripts['okf:fix'] = `good2go fix ${d}`;
      pkg.scripts['okf:view'] = build + `good2go view ${d}`;
      pkg.scripts['okf:mermaid'] = `good2go mermaid ${d}`;
      pkg.scripts['okf:search'] = 'good2go search';
      pkg.scripts['okf:mermaid:render'] = build + `good2go view ${d} --check-render`;
      pkg.scripts['okf:recheck'] = `good2go recheck --bundle ${d}`;
      pkg.scripts['okf:update'] = 'good2go update';
      if (hasEdukai) {
        pkg.scripts['edukai:validate'] = 'good2go validate edukai --strict && good2go edukai index --check';
        pkg.scripts['edukai:index'] = 'good2go edukai index';
        pkg.scripts['edukai:recheck'] = 'good2go recheck';
        pkg.scripts['edukai:brief'] = 'good2go edukai index && good2go hook brief';
        pkg.scripts['edukai:search'] = 'good2go search --bundle edukai';
        pkg.scripts['edukai:view'] = 'good2go view edukai';
      }
      if (hasWidgets) {
        pkg.scripts['okf:widgets:build'] = `npm run build -w ${WIDGETS_PKG}`;
        pkg.scripts['okf:widgets:test'] = `npm test -w ${WIDGETS_PKG}`;
        pkg.scripts['okf:widgets:typecheck'] = `npm run typecheck -w ${WIDGETS_PKG}`;
        // npm workspaces: the widget package's devDependencies install with the project's.
        const workspaces: unknown = pkg.workspaces;
        if (workspaces !== undefined && !Array.isArray(workspaces)) {
          console.warn(
            `  package.json "workspaces" is not an array; add "${WIDGETS_DIR}" to it by hand.`,
          );
        } else {
          const list = (workspaces ?? []) as string[];
          const covered = list.some((w) => w === WIDGETS_DIR || w === 'packages/*');
          if (!covered) {
            pkg.workspaces = [...list, WIDGETS_DIR];
            console.log(`  added ${WIDGETS_DIR} to the npm workspaces`);
          }
        }
      }
      // The tools are a dependency, pinned by the lockfile and upgraded with `npm update`.
      const hasTools = pkg.dependencies?.[PACKAGE] || pkg.devDependencies?.[PACKAGE];
      if (!hasTools) {
        pkg.devDependencies = pkg.devDependencies || {};
        pkg.devDependencies[PACKAGE] = DEPENDENCY_RANGE;
      }
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`  added the okf: ${hasEdukai ? 'and edukai: ' : ''}scripts to ` + pkgPath);
      if (!hasTools) console.log(`  added the ${PACKAGE} devDependency; run npm install`);
    } catch (e) {
      console.warn(
        '  could not edit package.json (' + (e as Error).message + '); add scripts manually.',
      );
    }
  } else {
    console.warn(
      `  no package.json found: run the tools with npx ${PACKAGE}@${VERSION} <command> (validate, view, search, ...).`,
    );
  }
}

// --- report -------------------------------------------------------------------
console.log('\nBootstrapped OKF bundle in: ' + target);
if (!opts.toolsOnly) console.log(`  ${designDir}/${slug}/, ${designDir}/design/   (fill with your first concepts)`);
console.log(`  The tools come from the ${PACKAGE} package (the good2go command); none are copied here.`);
if (opts.edukai) console.log('  edukai/                    (the agent memory bundle: lessons are added as agents learn)');
if (created.length) {
  console.log('\nCreated:');
  for (const f of created) console.log('  ' + f);
}
if (kept.length) {
  console.log('\nKept (already there, not touched; --force replaces the authored files):');
  for (const f of kept) console.log('  ' + f);
}
if (migrated.length) {
  console.log(`\nRemoved (the old copies of the tools; ${PACKAGE} replaces them):`);
  for (const f of migrated) console.log('  ' + f);
}
if (editedCopies.length) {
  console.log('\nKept, because they differ from what the old release wrote (delete them once you no longer need your edits):');
  for (const f of editedCopies) console.log('  ' + f);
}
if (opts.skills) console.log('\nThe skills are in .claude/skills/ and .agents/skills/ (--no-skills skips them). The memory hooks are per user: `good2go hooks`.');
console.log('\nSet up (once):');
console.log('  npm install');
console.log('  npm i -D @mermaid-js/mermaid-cli@11 playwright && npx playwright install chromium');
console.log('\nChecks (expect all to pass before you commit):');
console.log('  npm run okf:validate        # frontmatter + link conformance');
console.log('  npm run okf:fix             # write the relationship key under every ER diagram');
console.log('  npm run okf:view            # validate + write viz.html');
console.log('  npm run okf:mermaid         # every mermaid block parses (needs mmdc)');
console.log('  npm run okf:mermaid:render  # every diagram, quiz and widget works in the viewer');
console.log('  npm run okf:search -- search "query"   # find concepts before reading them');
console.log('  npm run okf:recheck         # do the files that concepts cite still say what was pinned?');
console.log('  npm run okf:update          # which templates a newer release changed (-- --write puts them under .okf-update/)');
if (hasEdukai) {
  console.log('\nMemory bundle (edukai/):');
  console.log('  npm run edukai:index        # rebuild the syllabus and the cache the hooks read (run once after a clone)');
  console.log('  npm run edukai:brief        # what an agent is told when a session opens');
  console.log('  npm run edukai:recheck      # lessons that need an agent: broken, failed, suspect, stale');
  console.log('  npm run edukai:validate     # lesson rules, supersede pointers, budgets, a current syllabus');
  console.log('  npm run edukai:search -- search "query"');
  console.log('  CI: copy ' + path.join(TEMPLATES, 'edukai-recheck.yml') + ' to .github/workflows/ (not installed for you)');
}
if (hasWidgets) {
  console.log('  npm run okf:widgets:typecheck && npm run okf:widgets:test');
}
console.log('\nUpgrade the tools with `npm update ' + PACKAGE + '`. Next: author the first concepts,');
console.log("then commit. The skill's PLAYBOOK.md");
console.log('has the full procedure, and EXPLAINERS.md covers tours, quizzes and widgets.');
