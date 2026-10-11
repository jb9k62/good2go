// Arm setup: one fresh working copy per run, never inside the repository.
//   A  fixture/base                       (git repo, nothing else)
//   B  base + memory overlay + hooks      installed by the real `good2go hooks --project --claude`,
//                                         plus the edukai skill (project scope, not committed)
//   C  base + memory overlay + package    no hooks (the overlay's package.json wins over base's),
//                                         plus the edukai skill
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { childEnv } from './claude.mts';
import type { Arm, Task } from './types.mts';

/** Something the runner cannot work around: the CLI maps it to exit 2. */
export class CannotRun extends Error {}

export const BENCH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(BENCH_DIR, '..', '..');

export const armsOf = (task: Task): Arm[] => task.arms ?? ['A', 'B'];

export const distEntry = (repoRoot: string): string => path.join(repoRoot, 'dist', 'good2go.mjs');

/** The hooks run the built package, so it must exist. */
export function requireDist(repoRoot: string): string {
  const entry = distEntry(repoRoot);
  if (!fs.existsSync(entry)) throw new CannotRun(`${entry} is missing: run \`npm run build\` first (arms B and C use the built package)`);
  return entry;
}

function sh(cmd: string, args: string[], cwd: string, what: string): string {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...childEnv(), GIT_TERMINAL_PROMPT: '0' } });
  if (r.error || r.status !== 0) throw new CannotRun(`${what} failed in ${cwd} (${r.error?.message ?? 'exit ' + r.status}): ${(r.stderr || r.stdout).trim().slice(0, 400)}`);
  return r.stdout;
}

/** Short SHA of the repository, plus `-dirty` when the tree is not clean; `unknown` outside git. */
export function gitSha(repoRoot: string): string {
  const sha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  if (sha.status !== 0) return 'unknown';
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  return sha.stdout.trim() + (dirty.status === 0 && dirty.stdout.trim() !== '' ? '-dirty' : '');
}

export interface SetupOptions {
  arm: Arm;
  /** The folder holding `base/` and `memory/`. */
  fixtureDir: string;
  repoRoot: string;
  /** Where the working copy goes; must not exist or be empty. */
  workdir: string;
  /**
   * The task's own folder (`tasks/<id>`). Arms B and C overlay its `memory-extra/` after the
   * shared memory overlay, so a lesson that only one task needs (the trap) exists only there.
   */
  taskDir?: string;
}

/**
 * Install the built package as npm would: a copy of what it ships (`dist/` without maps or the
 * widget workspace's own node_modules and build, plus package.json) at
 * node_modules/@jb9k62/good2go, its one dependency `yaml` beside it, and the `good2go` bin link.
 * Not a symlink to the repository: through one, the agent could read the whole repository,
 * the benchmark's hidden tests and reference answers included.
 */
export function installPackage(repoRoot: string, workdir: string): void {
  const nm = path.join(workdir, 'node_modules');
  const pkg = path.join(nm, '@jb9k62', 'good2go');
  fs.mkdirSync(pkg, { recursive: true });
  fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(pkg, 'package.json'));
  const dist = path.join(repoRoot, 'dist');
  fs.cpSync(dist, path.join(pkg, 'dist'), {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const r = path.relative(dist, src).split(path.sep).join('/');
      return !r.endsWith('.map') && !/^templates\/(.+\/)?(node_modules|dist)(\/|$)/.test(r);
    },
  });
  const yaml = path.join(repoRoot, 'node_modules', 'yaml');
  if (fs.existsSync(yaml)) fs.cpSync(yaml, path.join(nm, 'yaml'), { recursive: true, dereference: true });
  fs.mkdirSync(path.join(nm, '.bin'), { recursive: true });
  fs.symlinkSync(path.join('..', '@jb9k62', 'good2go', 'dist', 'good2go.mjs'), path.join(nm, '.bin', 'good2go'));
}

/**
 * Install the edukai skill the way a real project has it, with the real installer pointed at the
 * workdir as its home: `good2go skills --claude --dir <workdir>` writes
 * `<workdir>/.claude/skills/<skill>` (the command has no project-scope flag). It installs every
 * skill the package ships, so everything but `edukai` is removed again. `.claude/skills` is kept
 * out of the commit by the caller.
 */
export function installEdukaiSkill(entry: string, workdir: string): void {
  const out = sh(process.execPath, [entry, 'skills', '--claude', '--dir', workdir], workdir, 'good2go skills --claude --dir <workdir>');
  const skills = path.join(workdir, '.claude', 'skills');
  if (!fs.existsSync(path.join(skills, 'edukai', 'SKILL.md'))) throw new CannotRun(`good2go skills installed no edukai skill into ${skills}: ${out.trim().slice(0, 300)}`);
  for (const e of fs.readdirSync(skills)) if (e !== 'edukai') fs.rmSync(path.join(skills, e), { recursive: true, force: true });
}

/** Build the working copy for one run and return its path. Throws CannotRun. */
export function setupWorkdir(o: SetupOptions): string {
  const repoReal = fs.realpathSync(o.repoRoot);
  const target = path.resolve(o.workdir);
  if (target === repoReal || target.startsWith(repoReal + path.sep)) throw new CannotRun(`the working copy ${target} is inside the repository; runs must never happen there`);
  const base = path.join(o.fixtureDir, 'base');
  const memory = path.join(o.fixtureDir, 'memory');
  if (!fs.existsSync(base)) throw new CannotRun(`fixture base is missing: ${base}`);
  const withMemory = o.arm !== 'A';
  if (withMemory && !fs.existsSync(memory)) throw new CannotRun(`fixture memory overlay is missing: ${memory}`);
  const entry = withMemory ? requireDist(o.repoRoot) : '';

  fs.mkdirSync(o.workdir, { recursive: true });
  fs.cpSync(base, o.workdir, { recursive: true });
  if (withMemory) fs.cpSync(memory, o.workdir, { recursive: true });
  // Task-specific memory (files added to or replacing the shared overlay's, e.g. the trap lesson and
  // the overview that lists it). Arm A never has memory, so never has this either.
  const extra = o.taskDir === undefined ? '' : path.join(o.taskDir, 'memory-extra');
  if (withMemory && extra !== '' && fs.existsSync(extra)) fs.cpSync(extra, o.workdir, { recursive: true });

  sh('git', ['init', '-q'], o.workdir, 'git init');
  // node_modules (the package link and the hooks' cache) is machinery, not part of the project.
  fs.mkdirSync(path.join(o.workdir, '.git', 'info'), { recursive: true });
  // .claude/skills is the edukai skill (B and C), installed below; the hooks' settings.json stays
  // committed. Arm A has neither, so its exclude file names neither.
  fs.appendFileSync(path.join(o.workdir, '.git', 'info', 'exclude'), withMemory ? 'node_modules/\n.claude/skills/\n' : 'node_modules/\n');

  // B and C both get the package and the overlay's edukai:* scripts; only B gets the hooks.
  if (withMemory) {
    installPackage(o.repoRoot, o.workdir);
    // The staged copy (not the repository's dist): the same package files the agent can reach,
    // skills included, since the build puts them in dist/skills.
    installEdukaiSkill(path.join(o.workdir, 'node_modules', '@jb9k62', 'good2go', 'dist', 'good2go.mjs'), o.workdir);
  }

  if (o.arm === 'B') {
    const out = sh(process.execPath, [entry, 'hooks', '--project', '--claude'], o.workdir, 'good2go hooks --project --claude');
    if (!fs.existsSync(path.join(o.workdir, '.claude', 'settings.json'))) throw new CannotRun(`good2go hooks wrote no .claude/settings.json: ${out.trim().slice(0, 300)}`);
    // The hooks read the cache `recheck` writes (node_modules/.cache/edukai); without it they
    // answer "no index yet" and the arm would measure a broken install.
    if (!fs.existsSync(path.join(o.workdir, 'edukai'))) throw new CannotRun('arm B needs edukai/ in the memory overlay');
    sh(process.execPath, [entry, 'edukai', 'recheck'], o.workdir, 'good2go edukai recheck');
  }

  sh('git', ['add', '-A'], o.workdir, 'git add');
  sh('git', ['-c', 'user.name=bench', '-c', 'user.email=bench@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'fixture'], o.workdir, 'git commit');
  return o.workdir;
}
