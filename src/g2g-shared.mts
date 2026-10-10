/**
 * Small helpers the good2go tools share. Node built-ins only. The memory hook (g2g-hook.mts)
 * does not import this file: it keeps to `node:` built-ins and g2g-rank.mts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Fill {{NAME}} placeholders; an unknown name is left as <NAME> so a gap is visible. */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `<${k}>`);
}

/**
 * The file `name` beside the one at `from` (an `import.meta.url`): the .mts source when run
 * from the repository, the compiled .mjs when run from the package. Null when neither exists.
 */
export function siblingFile(from: string, name: string): string | null {
  const dir = path.dirname(fileURLToPath(from));
  for (const ext of ['.mts', '.mjs']) {
    const file = path.join(dir, name + ext);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/** A tool's `--help` text: the leading doc comment of its own source file, without the comment marks. */
export function helpFromComment(from: string): string {
  const text = fs.readFileSync(fileURLToPath(from), 'utf8');
  const start = text.indexOf('/**');
  const end = text.indexOf('*/', start);
  if (start < 0 || end < 0) return '';
  return text
    .slice(start + 3, end)
    .replace(/^\s*\n/, '')
    .replace(/^ \* ?/gm, '')
    .trimEnd();
}

/** Where the skills are: `skills/` beside the compiled files in the package, or the repository's own. */
export function skillsRoot(from: string): string | null {
  const dir = path.dirname(fileURLToPath(from));
  for (const candidate of [path.join(dir, 'skills'), path.join(dir, '..', 'skills')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
  }
  return null;
}

/**
 * Copy one skill (SKILL.md and references/) to `dest`, leaving out symlinks, node_modules and
 * dist. Returns the files written, relative to `dest`. Never follows a link out of the source.
 */
export function copySkill(src: string, dest: string): string[] {
  const written: string[] = [];
  const walk = (from: string, to: string): void => {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ['node_modules', 'dist'].includes(entry.name) || entry.name.includes('..')) continue;
      const a = path.join(from, entry.name);
      const b = path.join(to, entry.name);
      if (entry.isDirectory()) walk(a, b);
      else if (entry.isFile()) {
        fs.copyFileSync(a, b);
        written.push(path.relative(dest, b));
      }
    }
  };
  walk(src, dest);
  return written;
}

/**
 * The package's version, read from the first package.json named @jb9k62/good2go found walking
 * up from `from` (an `import.meta.url`): one folder up from src/ or dist/. 'unknown' when none.
 */
export function packageVersion(from: string): string {
  let dir = path.dirname(fileURLToPath(from));
  for (;;) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name?: unknown; version?: unknown };
      if (pkg.name === '@jb9k62/good2go' && typeof pkg.version === 'string') return pkg.version;
    } catch {
      // no package.json here, or not readable: keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return 'unknown';
    dir = parent;
  }
}
