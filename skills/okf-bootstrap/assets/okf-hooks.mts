#!/usr/bin/env node
/**
 * Install the memory hooks for an agent harness, so `good2go hook run` answers at session start,
 * after reads and edits, and when the agent stops.
 *
 *   good2go hooks [--user|--project] [--claude] [--pi] [--dry-run] [--remove] [--check] [--force] [--home <dir>]
 *
 *   --user      (default) the person's own configuration: ~/.claude/settings.json and pi's
 *               extensions folder. CLAUDE_CONFIG_DIR and PI_CODING_AGENT_DIR are honoured.
 *   --project   this folder's .claude/settings.json and .pi/extensions/. The hook then runs the
 *               project's own node_modules/.bin/good2go, so a repository can run its own code at
 *               session start (the harness's trust prompt only partly covers that).
 *   --claude    only Claude Code          --pi   only pi (default: each harness whose home exists)
 *   --dry-run   say what would change and write nothing
 *   --remove    delete only the entries and the file this command wrote
 *   --check     report each harness as configured, missing or stale; and whether good2go is on PATH
 *   --force     replace a pi extension file this command did not write
 *   --home      use this folder as the home directory (tests); environment variables are ignored
 *
 * Only entries whose command is `good2go hook run` (or the project form) are touched; every other
 * key and entry in settings.json stays as it was. A settings.json that is not JSON is never
 * overwritten. Restart the agent afterwards: both read their configuration at start.
 *
 * Exit codes: 0 done (or --check all fine), 1 refused or --check found something missing or stale,
 * 2 could not run.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USER_COMMAND = 'good2go hook run';
const PROJECT_COMMAND = 'npx --no-install good2go hook run';
const OWN_COMMANDS = [USER_COMMAND, PROJECT_COMMAND];
const MARKER = 'managed by good2go hooks';
const TIMEOUT = 5;
const EVENTS: Array<{ event: string; matcher?: string }> = [
  { event: 'SessionStart' },
  { event: 'PostToolUse', matcher: 'Read' },
  { event: 'PostToolUse', matcher: 'Edit|Write|NotebookEdit' },
  { event: 'Stop' },
];

class Refusal extends Error {}
class CannotRun extends Error {}

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The package's own package.json: beside dist/, or three folders up from the sources. */
function packageInfo(): { version: string; root: string | null } {
  for (const dir of [path.resolve(HERE, '..'), path.resolve(HERE, '..', '..', '..')]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Json;
      if (typeof pkg.version === 'string' && String(pkg.name).endsWith('good2go')) return { version: pkg.version, root: dir };
    } catch {
      // try the next one
    }
  }
  return { version: 'unknown', root: null };
}

function onPath(): boolean {
  const names = process.platform === 'win32' ? ['good2go.cmd', 'good2go.exe', 'good2go'] : ['good2go'];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const name of names) if (dir && fs.existsSync(path.join(dir, name))) return true;
  }
  return false;
}

interface Options {
  project: boolean;
  claude: boolean;
  pi: boolean;
  dryRun: boolean;
  remove: boolean;
  check: boolean;
  force: boolean;
  home: string | null;
}

function parse(argv: string[]): Options {
  const o: Options = { project: false, claude: false, pi: false, dryRun: false, remove: false, check: false, force: false, home: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--user') o.project = false;
    else if (a === '--project') o.project = true;
    else if (a === '--claude') o.claude = true;
    else if (a === '--pi') o.pi = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--remove') o.remove = true;
    else if (a === '--check') o.check = true;
    else if (a === '--force') o.force = true;
    else if (a === '--home') {
      const v = argv[++i];
      if (!v) throw new CannotRun('--home needs a folder');
      o.home = v;
    } else throw new CannotRun(`unknown option ${a}`);
  }
  return o;
}

interface Place {
  /** Folder whose existence says the harness is in use. */
  dir: string;
  settings: string;
  extension: string;
}

function places(o: Options): { claude: Place; pi: Place } {
  if (o.project) {
    const cwd = process.cwd();
    return {
      claude: { dir: path.join(cwd, '.claude'), settings: path.join(cwd, '.claude', 'settings.json'), extension: '' },
      pi: { dir: path.join(cwd, '.pi'), settings: '', extension: path.join(cwd, '.pi', 'extensions', 'edukai.ts') },
    };
  }
  const env = o.home === null ? process.env : {};
  const home = o.home ?? os.homedir();
  const claude = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const pi = env.PI_CODING_AGENT_DIR || path.join(home, '.pi', 'agent');
  return {
    claude: { dir: claude, settings: path.join(claude, 'settings.json'), extension: '' },
    pi: { dir: pi, settings: '', extension: path.join(pi, 'extensions', 'edukai.ts') },
  };
}

function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// ---- Claude Code ----------------------------------------------------------------------------

interface Settings {
  data: Json;
  indent: string | number;
  existed: boolean;
}

function readSettings(file: string): Settings {
  if (!fs.existsSync(file)) return { data: {}, indent: 2, existed: false };
  const text = fs.readFileSync(file, 'utf8');
  let data: unknown;
  try {
    data = text.trim() === '' ? {} : JSON.parse(text);
  } catch (e) {
    throw new CannotRun(`${file} is not valid JSON (${(e as Error).message}); fix it or remove it, nothing was written`);
  }
  if (!isRecord(data)) throw new CannotRun(`${file} is not a JSON object; nothing was written`);
  const indent = /^\n?([ \t]+)"/m.exec(text)?.[1] ?? 2;
  return { data, indent, existed: true };
}

const groupHooks = (g: unknown): Json[] => (isRecord(g) && Array.isArray(g.hooks) ? g.hooks.filter(isRecord) : []);
const isOwn = (h: Json): boolean => typeof h.command === 'string' && OWN_COMMANDS.includes(h.command);

function eventGroups(data: Json, event: string): unknown[] {
  const hooks = data.hooks;
  return isRecord(hooks) && Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
}

/** missing: no own entry; stale: some of the four absent or another command form or timeout. */
function claudeState(data: Json, command: string): 'configured' | 'missing' | 'stale' {
  let found = 0;
  let exact = 0;
  for (const { event, matcher } of EVENTS) {
    const own = eventGroups(data, event)
      .filter((g) => isRecord(g) && (g.matcher ?? undefined) === matcher)
      .flatMap(groupHooks)
      .filter(isOwn);
    if (own.length) found++;
    if (own.some((h) => h.command === command && h.timeout === TIMEOUT)) exact++;
  }
  if (found === 0) return 'missing';
  return exact === EVENTS.length ? 'configured' : 'stale';
}

function removeOwn(data: Json): number {
  let removed = 0;
  const hooks = data.hooks;
  if (!isRecord(hooks)) return 0;
  for (const event of Object.keys(hooks)) {
    const groups = hooks[event];
    if (!Array.isArray(groups)) continue;
    const kept: unknown[] = [];
    for (const g of groups) {
      if (!isRecord(g) || !Array.isArray(g.hooks)) {
        kept.push(g);
        continue;
      }
      const rest = g.hooks.filter((h) => !(isRecord(h) && isOwn(h)));
      removed += g.hooks.length - rest.length;
      if (rest.length === g.hooks.length) kept.push(g);
      else if (rest.length) kept.push({ ...g, hooks: rest });
    }
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete data.hooks;
  return removed;
}

function addOwn(data: Json, command: string): void {
  removeOwn(data);
  if (data.hooks !== undefined && !isRecord(data.hooks)) throw new CannotRun('settings.json has a "hooks" that is not an object; nothing was written');
  const hooks = (data.hooks ??= {}) as Json;
  for (const { event, matcher } of EVENTS) {
    if (hooks[event] !== undefined && !Array.isArray(hooks[event])) throw new CannotRun(`settings.json hooks.${event} is not an array; nothing was written`);
    const groups = (hooks[event] ??= []) as unknown[];
    const entry = { type: 'command', command, timeout: TIMEOUT };
    const existing = groups.find((g) => isRecord(g) && Array.isArray(g.hooks) && (g.matcher ?? undefined) === matcher);
    if (isRecord(existing)) (existing.hooks as unknown[]).push(entry);
    else groups.push(matcher === undefined ? { hooks: [entry] } : { matcher, hooks: [entry] });
  }
}

// ---- pi -------------------------------------------------------------------------------------

/** The shipped extension: dist/templates/pi-extension.ts, else the repository's extensions/edukai.ts. */
function extensionTemplate(): string {
  for (const file of [path.join(HERE, 'templates', 'pi-extension.ts'), path.resolve(HERE, '..', '..', '..', 'extensions', 'edukai.ts')]) {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  }
  throw new CannotRun('the pi extension template is not part of this install');
}

/** The installed hook the extension calls: compiled when installed, TypeScript from source. */
function hookFile(): string {
  for (const ext of ['.mjs', '.mts']) {
    const file = path.join(HERE, 'okf-edukai-hook' + ext);
    if (fs.existsSync(file)) return file;
  }
  throw new CannotRun('okf-edukai-hook is not next to this file');
}

function extensionText(project: boolean, version: string): { text: string; hook: string } {
  const hook = project ? '../../node_modules/@jb9k62/good2go/dist/okf-edukai-hook.mjs' : hookFile();
  const coreLine = project
    ? `const CORE = fileURLToPath(new URL(${JSON.stringify(hook)}, import.meta.url));`
    : `const CORE = ${JSON.stringify(hook)};`;
  const lines = extensionTemplate().split('\n');
  const core = lines.findIndex((l) => l.startsWith('const CORE = '));
  const cache = lines.findIndex((l) => l.startsWith('const COMPILE_CACHE = '));
  if (core < 0 || cache < 0) throw new CannotRun('the pi extension template has changed shape; cannot resolve its hook');
  lines[core] = coreLine;
  lines[cache] = "const COMPILE_CACHE = ''; // the installed package needs none";
  return { text: `// ${MARKER} (good2go ${version}); hook: ${hook}\n` + lines.join('\n'), hook };
}

function piState(file: string, want: { text: string; hook: string }, version: string): 'configured' | 'missing' | 'stale' | 'foreign' {
  if (!fs.existsSync(file)) return 'missing';
  const text = fs.readFileSync(file, 'utf8');
  const first = text.split('\n', 1)[0]!;
  if (!first.includes(MARKER)) return 'foreign';
  const hookPath = /; hook: (.*)$/.exec(first)?.[1] ?? '';
  const exists = hookPath.startsWith('..') || fs.existsSync(hookPath);
  return first.includes(`(good2go ${version})`) && text === want.text && exists ? 'configured' : 'stale';
}

// ---- command --------------------------------------------------------------------------------

export function run(argv: string[], out: (s: string) => void = (s) => console.log(s)): number {
  const o = parse(argv);
  const { version } = packageInfo();
  const where = places(o);
  const explicit = o.claude || o.pi;
  const wantClaude = explicit ? o.claude : fs.existsSync(where.claude.dir) || (o.project && !fs.existsSync(where.pi.dir));
  const wantPi = explicit ? o.pi : fs.existsSync(where.pi.dir);
  if (!wantClaude && !wantPi) {
    out('good2go hooks: neither Claude Code nor pi has a home folder here; pass --claude or --pi to create one.');
    return o.check ? 2 : 1;
  }
  const command = o.project ? PROJECT_COMMAND : USER_COMMAND;
  const verb = o.dryRun ? 'would ' : '';
  let code = 0;

  if (o.check) {
    if (wantClaude) {
      const { data } = readSettings(where.claude.settings);
      const state = claudeState(data, command);
      out(`claude: ${state} (${where.claude.settings})`);
      if (state !== 'configured') code = 1;
    }
    if (wantPi) {
      const want = extensionText(o.project, version);
      const state = piState(where.pi.extension, want, version);
      out(`pi: ${state} (${where.pi.extension})`);
      if (state !== 'configured') code = 1;
    }
    const found = onPath();
    out(`good2go on PATH: ${found ? 'yes' : 'no'}${found || o.project ? '' : ' (user-scope hooks call it by name; a harness started with another PATH stays silent)'}`);
    if (!found && !o.project) code = 1;
    return code;
  }

  if (wantClaude) {
    const file = where.claude.settings;
    const s = readSettings(file);
    if (o.remove) {
      const n = removeOwn(s.data);
      if (n === 0) out(`claude: nothing of ours in ${file}`);
      else {
        if (!o.dryRun) writeAtomic(file, JSON.stringify(s.data, null, s.indent) + '\n');
        out(`claude: ${verb}removed ${n} entries from ${file}`);
      }
    } else {
      addOwn(s.data, command);
      if (!o.dryRun) writeAtomic(file, JSON.stringify(s.data, null, s.indent) + '\n');
      out(`claude: ${verb}wrote ${EVENTS.length} hook entries to ${file}${s.existed ? '' : ' (new file)'}`);
      out(`  command: ${command}  (timeout ${TIMEOUT})`);
    }
  }

  if (wantPi) {
    const file = where.pi.extension;
    if (o.remove) {
      if (!fs.existsSync(file)) out(`pi: nothing of ours at ${file}`);
      else if (!fs.readFileSync(file, 'utf8').split('\n', 1)[0]!.includes(MARKER)) {
        out(`pi: ${file} was not written by good2go hooks; left alone`);
        code = 1;
      } else {
        if (!o.dryRun) fs.rmSync(file);
        out(`pi: ${verb}removed ${file}`);
      }
    } else {
      const want = extensionText(o.project, version);
      const state = piState(file, want, version);
      if (state === 'foreign' && !o.force) {
        out(`pi: ${file} exists and was not written by good2go hooks; left alone (pass --force to replace it)`);
        code = 1;
      } else {
        if (!o.dryRun) writeAtomic(file, want.text);
        out(`pi: ${verb}${state === 'configured' ? 'kept' : 'wrote'} ${file}`);
      }
    }
  }

  if (o.project && !o.remove) {
    out('caveat: with --project a repository can run its own code (node_modules/.bin/good2go) at session start; the harness\'s trust prompt only partly covers that. Commit this only for a team that wants it.');
  }
  if (!o.dryRun && code === 0) out('Restart the agent (Claude Code, pi) so it reads the new configuration.');
  return code;
}

const isMain = (() => {
  try {
    return fs.realpathSync(process.argv[1] ?? '') === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  try {
    const argv = process.argv.slice(2);
    if (argv.includes('--help') || argv.includes('-h')) {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]!.replace(/^#!.*\n\/\*\*\n/, '').replace(/^ \* ?/gm, '').trimEnd());
      process.exitCode = 0;
    } else process.exitCode = run(argv);
  } catch (e) {
    console.error('good2go hooks: ' + (e instanceof CannotRun || e instanceof Refusal ? e.message : e instanceof Error ? e.stack : String(e)));
    process.exitCode = 2;
  }
}
