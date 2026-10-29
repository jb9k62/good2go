/**
 * Decides, from the changelog alone, whether a release is warranted and which version it is.
 * Run by .github/workflows/release-pr.yml; see docs/RELEASING.md.
 *
 *   node scripts/release-plan.mts plan   [--since <tag>]   prints JSON: { release, bump, next, reason }
 *   node scripts/release-plan.mts apply  <next> <date>     moves "Unreleased" into "## <next> - <date>"
 *
 * The rule is deterministic and reads only what a person wrote:
 *   - no entries under "## Unreleased": no release
 *   - an entry starting "**Breaking" (any case): major
 *   - every entry starting "**Fix", "**Fixed" or "**Security": patch
 *   - anything else: minor
 * A change to the package's runtime `dependencies` since the last tag with no changelog entry is
 * reported as the reason, not guessed at. Exit codes: 0 planned (release or not), 2 could not run.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Bump = 'major' | 'minor' | 'patch';
export interface Plan {
  release: boolean;
  bump: Bump | null;
  next: string | null;
  reason: string;
}

const UNRELEASED = /^## Unreleased\s*$/;

/** The entries (a "- " line and its indented continuation) under "## Unreleased". */
export function unreleasedEntries(changelog: string): string[] {
  const entries: string[] = [];
  let inside = false;
  for (const line of changelog.split('\n')) {
    if (UNRELEASED.test(line)) { inside = true; continue; }
    if (!inside) continue;
    if (/^## /.test(line)) break;
    if (/^- /.test(line)) entries.push(line);
    else if (entries.length && /^\s+\S/.test(line)) entries[entries.length - 1] += `\n${line}`;
  }
  return entries;
}

export function bumpFor(entries: string[]): Bump {
  if (entries.some((e) => /^- \**breaking\b/i.test(e))) return 'major';
  if (entries.every((e) => /^- \**(fix|fixed|security)\b/i.test(e))) return 'patch';
  return 'minor';
}

export function nextVersion(version: string, bump: Bump): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`not a plain semver version: ${version}`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function plan(changelog: string, version: string, runtimeDepsChanged = false): Plan {
  const entries = unreleasedEntries(changelog);
  if (!entries.length) {
    return {
      release: false, bump: null, next: null,
      reason: runtimeDepsChanged
        ? 'runtime dependencies changed since the last tag but "## Unreleased" has no entry: add one (start it "**Security" or "**Fix" for a patch)'
        : 'no entries under "## Unreleased"',
    };
  }
  const bump = bumpFor(entries);
  return { release: true, bump, next: nextVersion(version, bump), reason: `${entries.length} unreleased ${entries.length === 1 ? 'entry' : 'entries'}, ${bump}` };
}

/** Moves the entries under "## Unreleased" beneath a new dated heading and leaves it empty. */
export function applyRelease(changelog: string, next: string, date: string): string {
  if (!/^\d+\.\d+\.\d+$/.test(next) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('bad version or date');
  if (!unreleasedEntries(changelog).length) throw new Error('nothing under "## Unreleased"');
  const lines = changelog.split('\n');
  const at = lines.findIndex((l) => UNRELEASED.test(l));
  lines.splice(at + 1, 0, '', `## ${next} - ${date}`);
  return lines.join('\n');
}

function runtimeDepsChangedSince(root: string, tag: string): boolean {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const before = JSON.parse(git('show', `${tag}:package.json`)).dependencies ?? {};
  const now = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies ?? {};
  return JSON.stringify(before, Object.keys(before).sort()) !== JSON.stringify(now, Object.keys(now).sort());
}

function main(argv: string[]): number {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const changelogPath = path.join(root, 'CHANGELOG.md');
  const [command, ...rest] = argv;
  if (command === 'plan') {
    const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    const i = rest.indexOf('--since');
    const since = i >= 0 ? rest[i + 1] : undefined;
    let depsChanged = false;
    if (since) {
      try { depsChanged = runtimeDepsChangedSince(root, since); } catch (e) {
        console.error(`could not compare dependencies with ${since}: ${(e as Error).message}`);
        return 2;
      }
    }
    console.log(JSON.stringify(plan(fs.readFileSync(changelogPath, 'utf8'), version, depsChanged)));
    return 0;
  }
  if (command === 'apply' && rest.length === 2) {
    try {
      fs.writeFileSync(changelogPath, applyRelease(fs.readFileSync(changelogPath, 'utf8'), rest[0], rest[1]));
      return 0;
    } catch (e) {
      console.error((e as Error).message);
      return 2;
    }
  }
  console.error('usage: release-plan.mts plan [--since <tag>] | apply <version> <YYYY-MM-DD>');
  return 2;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
