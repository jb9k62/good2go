#!/usr/bin/env node
/**
 * good2go: one command for the OKF tools, so a project depends on the package and keeps no
 * copies of them.
 *
 *   good2go init [dir] [options]       scaffold the design bundle and the npm scripts (bootstrap)
 *   good2go new <dir> --name N --intent I   scaffold any other bundle: ops, runbooks, notes
 *   good2go validate [bundle] [options]     validate a bundle (view --validate)
 *   good2go fix [bundle]                    validate and write the fixes that are safe
 *   good2go view [bundle] [options]         validate and write viz.html
 *   good2go mermaid [bundle]                every Mermaid block parses
 *   good2go search <command> [args]         ranked, freshness-aware search
 *   good2go recheck [options]               lessons that need an agent
 *   good2go edukai <command> [args]         the memory tool: new, verify, supersede, index, recheck
 *   good2go hook <command> [args]           what the harness hooks run: brief, cites, debt
 *   good2go update [options]                which scaffolded templates a newer release changed
 *   good2go skills [--claude] [--pi] [--agents] [--force]   install the skills for an agent
 *
 * Each subcommand runs the tool of that name as it always has, with the same flags and exit
 * codes (0 pass, 1 broken, 2 could not run); this file only chooses the tool. Run from source
 * as TypeScript, and from the published package as compiled JavaScript.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '0.7.0';

// subcommand -> [tool file without extension, arguments put before the user's]
const COMMANDS: Record<string, [string, string[]]> = {
  init: ['bootstrap', []],
  new: ['okf-new', []],
  validate: ['okf-view', ['--validate']],
  fix: ['okf-view', ['--validate', '--fix']],
  view: ['okf-view', []],
  mermaid: ['okf-mermaid', []],
  search: ['okf-search', []],
  recheck: ['okf-edukai', ['recheck']],
  edukai: ['okf-edukai', []],
  hook: ['okf-edukai-hook', []],
  update: ['okf-update', []],
  skills: ['okf-skills', []],
};

const HELP = fs
  .readFileSync(fileURLToPath(import.meta.url), 'utf8')
  .split('*/')[0]!
  .replace(/^#!.*\n\/\*\*\n/, '')
  .replace(/^ \* ?/gm, '')
  .trimEnd();

/** The tool's file: .mts next to this one when run from source, .mjs when compiled. */
function toolFile(name: string): string | null {
  for (const ext of ['.mts', '.mjs']) {
    const file = path.join(HERE, name + ext);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

const [command, ...rest] = process.argv.slice(2);
if (command === undefined || command === '-h' || command === '--help' || command === 'help') {
  console.log(HELP);
  process.exit(command === undefined ? 2 : 0);
}
if (command === '-v' || command === '--version' || command === 'version') {
  console.log(VERSION);
  process.exit(0);
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
// A bundle given first (`good2go validate okf --strict`) must come before the fixed flags, so
// the viewer reads it as its positional argument.
const first = rest[0];
const args = first !== undefined && !first.startsWith('-') && entry[1].length && entry[0] === 'okf-view'
  ? [first, ...entry[1], ...rest.slice(1)]
  : [...entry[1], ...rest];
const result = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit' });
if (result.error) {
  console.error(`good2go: could not run ${path.basename(file)}: ${result.error.message}`);
  process.exit(2);
}
process.exit(result.status ?? (result.signal ? 1 : 2));
