#!/usr/bin/env node
/**
 * good2go new: scaffold a small OKF bundle (index, log, one starter page) into a new folder.
 *
 *   g2g-new.mts <dir> --name "<Name>" --intent "<what it is for and who reads it>"
 *               [--project-dir <dir>] [--force]
 *
 * Exit codes: 0 ok, 1 refused for a content reason, 2 usage or could not run.
 * Existing files are never overwritten, even with --force.
 */
import fs from 'node:fs';
import path from 'node:path';

type Vars = Record<string, string>;

const USAGE = `Usage: good2go new <dir> --name "<Name>" --intent "<one sentence>" [--project-dir <dir>] [--force]`;

const TEMPLATES = new URL('./templates/bundle/', import.meta.url);

// Same rule as g2g-init.mts: {{VAR}} is replaced, an unknown one becomes <VAR>.
function render(text: string, vars: Vars): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `<${k}>`);
}

function usage(msg: string): number {
  console.error(`g2g-new: ${msg}\n${USAGE}`);
  return 2;
}

function main(argv: string[]): number {
  let dir: string | null = null;
  let name: string | null = null;
  let intent: string | null = null;
  let projectDir = process.cwd();
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = (): string | null => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return null;
      i++;
      return v;
    };
    if (a === '--name') name = value();
    else if (a === '--intent') intent = value();
    else if (a === '--project-dir') {
      const v = value();
      if (v === null) return usage('--project-dir needs a value');
      projectDir = path.resolve(v);
    } else if (a === '--force') force = true;
    else if (a === '--help' || a === '-h') {
      console.log(USAGE);
      return 0;
    } else if (a.startsWith('--')) return usage(`unknown option ${a}`);
    else if (dir === null) dir = a;
    else return usage(`unexpected argument ${a}`);
  }
  if (dir === null || dir.trim() === '') return usage('missing <dir>');
  if (!name || !name.trim()) return usage('missing --name');
  if (!intent || !intent.trim()) return usage('missing --intent');
  name = name.trim().replace(/\s+/g, ' ');
  intent = intent.trim().replace(/\s+/g, ' ');

  if (path.isAbsolute(dir)) {
    console.error(`g2g-new: ${dir}: refused, the folder must be relative to the project directory`);
    return 1;
  }
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return usage(`project directory ${projectDir} does not exist`);
  }
  const root = fs.realpathSync(projectDir);
  const target = path.resolve(root, dir);
  const rel = path.relative(root, target);
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    console.error(`g2g-new: ${dir}: refused, it is not inside ${root}`);
    return 1;
  }
  // A symlink on the way could still lead outside: check the nearest existing ancestor.
  let probe = target;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const real = path.relative(root, fs.realpathSync(probe));
  if (real === '..' || real.startsWith(`..${path.sep}`) || path.isAbsolute(real)) {
    console.error(`g2g-new: ${dir}: refused, it resolves outside ${root}`);
    return 1;
  }

  if (fs.existsSync(target)) {
    if (!fs.statSync(target).isDirectory()) {
      console.error(`g2g-new: ${rel}: refused, it exists and is not a folder`);
      return 1;
    }
    if (fs.readdirSync(target).length > 0 && !force) {
      console.error(`g2g-new: ${rel}: refused, the folder is not empty (use --force to add missing files only)`);
      return 1;
    }
  }

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const vars: Vars = {
    NAME: name,
    INTENT: intent,
    TODAY: now.slice(0, 10),
    NOW: now,
  };
  const files: Array<[string, string]> = [
    ['index.md', 'index.md'],
    ['log.md', 'log.md'],
    ['readme-first.md', 'starter.md'],
  ];

  let templates: Array<[string, string]>;
  try {
    templates = files.map(([out, tpl]) => [out, fs.readFileSync(new URL(tpl, TEMPLATES), 'utf8')]);
  } catch (e) {
    console.error(`g2g-new: could not read the bundle templates: ${(e as Error).message}`);
    return 2;
  }

  try {
    fs.mkdirSync(target, { recursive: true });
    for (const [out, text] of templates) {
      const file = path.join(target, out);
      const shown = path.join(rel, out);
      if (fs.existsSync(file)) {
        console.log(`kept     ${shown}`);
        continue;
      }
      // 'wx' fails rather than overwrite, even if the file appears meanwhile.
      fs.writeFileSync(file, render(text, vars), { flag: 'wx' });
      console.log(`created  ${shown}`);
    }
  } catch (e) {
    console.error(`g2g-new: could not write ${rel}: ${(e as Error).message}`);
    return 2;
  }

  console.log(`\nNext steps:\n  good2go validate ${rel}\n  good2go view ${rel}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
