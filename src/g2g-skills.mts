#!/usr/bin/env node
/**
 * Install the skills that ship with this package into an agent's personal skills folder.
 *
 *   good2go skills [--claude] [--pi] [--agents] [--force] [--dir <home>]
 *
 *   --claude  ~/.claude/skills/<skill>      (Claude Code; CLAUDE_CONFIG_DIR is honoured)
 *   --pi      ~/.pi/agent/skills/<skill>    (pi; PI_CODING_AGENT_DIR is honoured)
 *   --agents  ~/.agents/skills/<skill>      (the shared Agent Skills location; pi reads it)
 *   --force   replace a skill that is already installed
 *   --dir     use this folder as the home directory (tests); the environment variables are ignored
 *
 * With no target flags it installs for each agent whose home directory exists. Skills are
 * copied, never linked: a skill is its SKILL.md and references. Symbolic links in the source
 * are skipped, and nothing is written outside the skill's own destination folder.
 *
 * Exit codes: 0 installed, 1 refused (a skill is already there, pass --force), 2 could not run.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The skills folder: beside this file in the package, else the repository's own when run from source. */
function skillsRoot(): string | null {
  for (const dir of [path.join(HERE, 'skills'), path.resolve(HERE, '..', 'skills')]) {
    if (fs.existsSync(path.join(dir, 'good2go', 'SKILL.md'))) return dir;
  }
  return null;
}

function skillNames(root: string): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

/** Copy a skill's files; symlinks and the tools (node_modules, dist) are left out. */
function copySkill(source: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (['node_modules', 'dist'].includes(entry.name) || entry.name.includes('..')) continue;
    const from = path.join(source, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copySkill(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  }
}

function main(argv: string[]): number {
  const flags = new Set<string>();
  let dir: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dir') {
      dir = argv[++i] ?? null;
      if (!dir) {
        console.error('--dir needs a folder');
        return 2;
      }
    } else if (['--claude', '--pi', '--agents', '--force'].includes(a)) flags.add(a);
    else {
      console.error(`Unknown argument: ${a}`);
      return 2;
    }
  }

  const root = skillsRoot();
  const names = root ? skillNames(root) : [];
  if (!root || names.length === 0) {
    console.error('No skills found beside this tool.');
    return 2;
  }

  const home = dir ? path.resolve(dir) : os.homedir();
  const env = dir ? {} : process.env;
  const targets = [
    { flag: '--claude', name: 'Claude Code', home: env.CLAUDE_CONFIG_DIR ?? path.join(home, '.claude') },
    {
      flag: '--pi',
      name: 'pi',
      home: env.PI_CODING_AGENT_DIR ?? env.PI_AGENT_DIR ?? path.join(home, '.pi', 'agent'),
    },
    { flag: '--agents', name: 'Agent Skills', home: path.join(home, '.agents') },
  ];
  const explicit = targets.some((t) => flags.has(t.flag));
  const chosen = targets.filter((t) =>
    explicit ? flags.has(t.flag) : t.flag !== '--agents' && fs.existsSync(t.home),
  );
  if (chosen.length === 0) {
    console.error('No agent home found (~/.claude, ~/.pi/agent). Pass --claude, --pi or --agents.');
    return 2;
  }

  let refused = false;
  for (const target of chosen) {
    const skillsDir = path.join(target.home, 'skills');
    for (const skill of names) {
      const dest = path.join(skillsDir, skill);
      if (path.dirname(dest) !== skillsDir) continue;
      if (fs.lstatSync(dest, { throwIfNoEntry: false })) {
        if (!flags.has('--force')) {
          console.error(`  ${target.name}: ${dest} already exists; pass --force to replace it`);
          refused = true;
          continue;
        }
        // rmSync removes a symbolic link itself, never what it points at.
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.mkdirSync(skillsDir, { recursive: true });
      copySkill(path.join(root, skill), dest);
      console.log(`  ${target.name}: installed ${skill} to ${dest}`);
    }
  }

  console.log('\nSkills only. The memory hooks: `good2go hooks`, or the plugin or package:');
  console.log('  Claude Code: /plugin marketplace add jb9k62/good2go');
  console.log('  pi:          pi install git:github.com/jb9k62/good2go');
  return refused ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
