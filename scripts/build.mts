#!/usr/bin/env node
/**
 * Build the npm package into dist/: compile the tools to JavaScript (Node will not strip types
 * under node_modules), copy the templates and the plain-JavaScript helper beside them, and mark
 * the command executable. Nothing in dist/ is committed.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(ROOT, 'src');

fs.rmSync(DIST, { recursive: true, force: true });
const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const compile = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { cwd: ROOT, stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 2);

fs.cpSync(path.join(ASSETS, 'templates'), path.join(DIST, 'templates'), {
  recursive: true,
  filter: (from) => !/(^|[\\/])(node_modules|dist)([\\/]|$)/.test(path.relative(path.join(ASSETS, 'templates'), from)),
});
// The skills (instructions and references, no tools) travel with the package so
// `good2go skills` can install them for an agent.
fs.cpSync(path.join(ROOT, 'skills'), path.join(DIST, 'skills'), {
  recursive: true,
  filter: (from) => !/(^|[\\/])(node_modules|dist)([\\/]|$)/.test(path.relative(path.join(ROOT, 'skills'), from)),
});
// The pi extension that `good2go hooks` installs (it sets how the extension calls good2go at install time).
fs.copyFileSync(path.join(ROOT, 'extensions', 'edukai.ts'), path.join(DIST, 'templates', 'pi-extension.ts'));
// The command's entry: a plain .js file so `bin` needs no extension rewriting.
const cli = path.join(DIST, 'good2go.mjs');
if (!fs.existsSync(cli)) {
  console.error('build: good2go.mjs was not produced');
  process.exit(2);
}
fs.chmodSync(cli, 0o755);
console.log('built dist/ (' + fs.readdirSync(DIST).filter((f) => f.endsWith('.mjs')).length + ' tools, templates)');
