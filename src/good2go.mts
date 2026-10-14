#!/usr/bin/env node
/**
 * good2go: one command for the OKF tools, so a project depends on the package and keeps no
 * copies of them.
 *
 *   good2go init [dir] [options]       scaffold the design bundle and the npm scripts
 *   good2go new <dir> --name N --intent I   scaffold any other bundle: ops, runbooks, notes
 *   good2go validate [bundle] [options]     validate a bundle (view --validate)
 *   good2go fix [bundle]                    validate and write the fixes that are safe
 *   good2go view [bundle] [options]         validate and write viz.html
 *   good2go build-view [bundle...] [options]  write the viewer for every bundle, and a landing page
 *   good2go open [bundle] [options]         build, then open the landing page (or one bundle) in a browser
 *   good2go mermaid [bundle]                every Mermaid block parses
 *   good2go search <command> [args]         ranked, freshness-aware search
 *   good2go recheck [options]               lessons that need an agent
 *   good2go edukai <command> [args]         the memory tool: new, verify, supersede, index, recheck
 *   good2go hook <command> [args]           what the harness hooks run: run, brief, cites, debt
 *   good2go skills [--claude] [--pi] [--agents] [--force]   install the skills for an agent
 *   good2go hooks [--user|--project] [--claude] [--pi] [--dry-run] [--remove] [--check]   install the memory hooks
 *
 * Each subcommand runs the tool of that name as it always has, with the same flags and exit
 * codes (0 pass, 1 broken, 2 could not run); this file only chooses the tool. Run from source
 * as TypeScript, and from the published package as compiled JavaScript.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { helpFromComment, packageVersion, siblingFile } from './g2g-shared.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// subcommand -> [tool file without extension, arguments put before the user's]
const COMMANDS: Record<string, [string, string[]]> = {
  init: ['g2g-init', []],
  new: ['g2g-new', []],
  validate: ['g2g-view', ['--validate']],
  fix: ['g2g-view', ['--validate', '--fix']],
  view: ['g2g-view', []],
  'build-view': ['g2g-build-view', ['build-view']],
  open: ['g2g-build-view', ['open']],
  mermaid: ['g2g-mermaid', []],
  search: ['g2g-search', []],
  recheck: ['g2g-edukai', ['recheck']],
  edukai: ['g2g-edukai', []],
  hook: ['g2g-hook', []],
  skills: ['g2g-skills', []],
  hooks: ['g2g-install-hooks', []],
};

// Read from this file's own comment, which tsc keeps first in the compiled file only when no
// helper is put above it; the compiled --help is tested.
const HELP = helpFromComment(import.meta.url);
const toolFile = (name: string): string | null => siblingFile(import.meta.url, name);

const [command, ...rest] = process.argv.slice(2);
if (command === undefined || command === '-h' || command === '--help' || command === 'help') {
  console.log(HELP);
  process.exit(command === undefined ? 2 : 0);
}
if (command === '-v' || command === '--version' || command === 'version') {
  console.log(packageVersion(import.meta.url));
  process.exit(0);
}
if (command === 'hook' && rest[0] === 'run') {
  // The harnesses' entry: in-process (no second node), silent, and exit 0 on any error or an old Node.
  const debug = (e: unknown): void => {
    if (process.env.EDUKAI_DEBUG === '1') console.error('good2go hook run: ' + (e instanceof Error && e.stack ? e.stack : String(e)));
  };
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 24) {
    debug(`Node ${process.versions.node} is too old; the hook needs 24`);
    process.exit(0);
  }
  try {
    const hookFile = toolFile('g2g-hook');
    if (!hookFile) throw new Error('g2g-hook is not next to ' + HERE);
    const hook = (await import(pathToFileURL(hookFile).href)) as { runHook(): number };
    process.exitCode = hook.runHook();
  } catch (e) {
    debug(e);
    process.exitCode = 0;
  }
  process.exit(process.exitCode ?? 0);
}
const entry = COMMANDS[command];
if (!entry) {
  console.error(`good2go: unknown command "${command}". Run good2go --help.`);
  process.exit(2);
}
const file = toolFile(entry[0]);
if (!file) {
  console.error(`good2go: "${command}" is not part of this install (no ${entry[0]} next to ${HERE}).`);
  process.exit(2);
}
const result = spawnSync(process.execPath, [file, ...entry[1], ...rest], { stdio: 'inherit' });
if (result.error) {
  console.error(`good2go: could not run ${path.basename(file)}: ${result.error.message}`);
  process.exit(2);
}
// A child killed by a signal could not finish: 2, not "broken".
process.exit(result.status ?? 2);
