/**
 * The scaffold and the validator, end to end, on throwaway projects under .cache/. The tools are not
 * copied into them: the package's `good2go` command (run here from source) is what they call.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, 'skills', 'okf-bootstrap');
const BOOTSTRAP = path.join(SKILL, 'assets', 'bootstrap.mts');
const GOOD2GO = path.join(SKILL, 'assets', 'good2go.mts');
const CACHE = path.join(ROOT, '.cache', 'test');
fs.mkdirSync(CACHE, { recursive: true });
const scratch = fs.mkdtempSync(path.join(CACHE, 'bootstrap-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function project(name: string, pkg: object | null = { name, private: true }): string {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  if (pkg) fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  return dir;
}

function run(file: string, args: string[], cwd = ROOT) {
  const r = spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const read = (file: string) => fs.readFileSync(file, 'utf8');
const pkgOf = (dir: string) => JSON.parse(read(path.join(dir, 'package.json')));

describe('bootstrap', () => {
  it('scaffolds a bundle that validates clean through good2go, and copies no tools', () => {
    const dir = project('plain');
    const r = run(BOOTSTRAP, [dir, '--name', 'Plain App']);
    assert.equal(r.code, 0, r.out);
    for (const file of [
      'okf/index.md',
      'okf/log.md',
      'okf/adr/readme.md',
      'okf/adr/template.md',
      'okf/plain-app/.gitkeep',
      '.okf-bootstrap.json',
      'okf-concept-template.md',
      'okf-explainer-template.md',
    ]) {
      assert.ok(fs.existsSync(path.join(dir, file)), `missing ${file}`);
    }
    assert.ok(!fs.existsSync(path.join(dir, 'scripts')), 'no scripts/: the tools live in the package');
    assert.ok(!fs.existsSync(path.join(dir, 'packages')), 'no widgets without --widgets');
    const pkg = pkgOf(dir);
    assert.equal(pkg.scripts['okf:validate'], 'good2go validate okf');
    assert.equal(pkg.scripts['okf:view'], 'good2go view okf');
    assert.equal(pkg.scripts['okf:fix'], 'good2go fix okf');
    assert.equal(pkg.scripts['okf:search'], 'good2go search');
    assert.equal(pkg.scripts['okf:update'], 'good2go update');
    assert.equal(pkg.scripts['okf:widgets:build'], undefined);
    assert.equal(pkg.devDependencies['@jb9k62/good2go'], `^${pkgOf(ROOT).version}`);
    assert.equal(pkg.devDependencies.yaml, undefined, 'yaml comes with the package');
    assert.equal(pkg.type, undefined, 'package.json "type" stays alone');

    const v = run(GOOD2GO, ['validate', 'okf', '--strict'], dir);
    assert.equal(v.code, 0, v.out);
    assert.match(v.out, /issues\s+: 0/);
    const q = run(GOOD2GO, ['search', 'search', 'decision', '--bundle', 'okf', '--json'], dir);
    assert.equal(q.code, 0, q.out);
    assert.ok(JSON.parse(q.out).total >= 1);
    assert.match(read(path.join(dir, 'okf', 'index.md')), /^# Plain App$/m);
    // Scaffolded timestamps follow SPEC §5 (datetime with offset), or validate above would fail.
    assert.match(read(path.join(dir, 'okf', 'adr', 'readme.md')), /at: \d{4}-\d{2}-\d{2}T[\d:]+Z/);
  });

  it('creates the target directory when it does not exist', () => {
    const dir = path.join(scratch, 'brand', 'new', 'project');
    const r = run(BOOTSTRAP, [dir]);
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.existsSync(path.join(dir, 'okf', 'index.md')));
    assert.ok(fs.existsSync(path.join(dir, '.okf-bootstrap.json')));
    assert.match(r.out, /no package\.json found/);
  });

  it('keeps authored files on a re-run, and --force replaces them', () => {
    const dir = project('rerun');
    run(BOOTSTRAP, [dir]);
    const log = path.join(dir, 'okf', 'log.md');
    fs.writeFileSync(log, '# Update log\n\n## 2026-01-01\n\n- history\n');
    const again = run(BOOTSTRAP, [dir]);
    assert.equal(again.code, 0, again.out);
    assert.match(again.out, /Kept[\s\S]*okf\/log\.md/);
    assert.match(read(log), /history/);
    run(BOOTSTRAP, [dir, '--force']);
    assert.doesNotMatch(read(log), /history/);
  });

  it('copies the skills into the project, keeps them on a re-run, and --force replaces them', () => {
    const dir = project('copied');
    const r = run(BOOTSTRAP, [dir]);
    assert.equal(r.code, 0, r.out);
    for (const home of ['.claude', '.agents']) {
      for (const skill of ['okf-bootstrap', 'edukai']) {
        assert.ok(fs.existsSync(path.join(dir, home, 'skills', skill, 'SKILL.md')), `${home} ${skill}`);
      }
      assert.ok(fs.existsSync(path.join(dir, home, 'skills', 'okf-bootstrap', 'references', 'PLAYBOOK.md')));
      assert.ok(!fs.existsSync(path.join(dir, home, 'skills', 'okf-bootstrap', 'assets')), 'no tools');
    }
    assert.doesNotMatch(read(path.join(dir, '.okf-bootstrap.json')), /skills/);
    const mine = path.join(dir, '.claude', 'skills', 'edukai', 'SKILL.md');
    fs.writeFileSync(mine, 'my edit\n');
    const again = run(BOOTSTRAP, [dir]);
    assert.equal(again.code, 0, again.out);
    assert.match(again.out, /Kept[\s\S]*\.claude\/skills\/edukai/);
    assert.equal(read(mine), 'my edit\n');
    run(BOOTSTRAP, [dir, '--force']);
    assert.match(read(mine), /^---\nname: edukai/);
  });

  it('copies no skills with --no-skills', () => {
    const dir = project('noskills');
    const r = run(BOOTSTRAP, [dir, '--no-skills']);
    assert.equal(r.code, 0, r.out);
    assert.ok(!fs.existsSync(path.join(dir, '.claude')));
    assert.ok(!fs.existsSync(path.join(dir, '.agents')));
  });

  it('leaves an existing good2go dependency alone', () => {
    const dir = project('has-dep', { name: 'has-dep', devDependencies: { '@jb9k62/good2go': '^0.6.0' } });
    const r = run(BOOTSTRAP, [dir]);
    assert.equal(r.code, 0, r.out);
    assert.equal(pkgOf(dir).devDependencies['@jb9k62/good2go'], '^0.6.0');
    assert.doesNotMatch(r.out, /added the @jb9k62\/good2go devDependency/);
  });

  it('refuses --tools-only without a bundle', () => {
    const r = run(BOOTSTRAP, [project('empty'), '--tools-only']);
    assert.equal(r.code, 2);
  });

  it('rewires the scripts with --tools-only and leaves the bundle alone', () => {
    const dir = project('tools-only', { name: 'tools-only', scripts: { 'okf:view': 'node scripts/okf-view.mjs okf' } });
    fs.mkdirSync(path.join(dir, 'okf'));
    const r = run(BOOTSTRAP, [dir, '--tools-only']);
    assert.equal(r.code, 0, r.out);
    assert.equal(pkgOf(dir).scripts['okf:view'], 'good2go view okf');
    assert.ok(!fs.existsSync(path.join(dir, 'okf', 'index.md')), '--tools-only leaves okf/ alone');
  });

  it('writes the install manifest at the project root, with the hashes of the templates', () => {
    const dir = project('manifest');
    const r = run(BOOTSTRAP, [dir, '--name', 'Manifest App']);
    assert.equal(r.code, 0, r.out);
    const text = read(path.join(dir, '.okf-bootstrap.json'));
    assert.ok(text.endsWith('}\n'), 'trailing newline');
    assert.equal(text, JSON.stringify(JSON.parse(text), null, 2) + '\n', '2-space indent');
    const manifest = JSON.parse(text);
    assert.deepEqual(Object.keys(manifest), ['version', 'name', 'designDir', 'templates']);
    assert.equal(manifest.version, pkgOf(ROOT).version);
    assert.equal(manifest.name, 'Manifest App');
    assert.equal(manifest.designDir, 'okf');
    assert.equal(manifest.files, undefined, 'no script hashes: nothing is copied');
    assert.ok(!fs.existsSync(path.join(dir, 'scripts')));
    const templates = path.join(SKILL, 'assets', 'templates');
    assert.ok(Object.keys(manifest.templates).length >= 8, 'every scaffolded template');
    for (const [rel, hash] of Object.entries<string>(manifest.templates)) {
      const actual = createHash('sha256').update(fs.readFileSync(path.join(templates, rel))).digest('hex');
      assert.equal(hash, actual, `hash of template ${rel}`);
    }
  });

  it('rewrites the manifest on a re-run, and remembers the name', () => {
    const dir = project('manifest-rerun');
    run(BOOTSTRAP, [dir, '--name', 'Remembered']);
    const manifestPath = path.join(dir, '.okf-bootstrap.json');
    const original = read(manifestPath);
    fs.writeFileSync(manifestPath, JSON.stringify({ version: '0.0.0', name: 'Remembered', templates: {} }) + '\n');
    const again = run(BOOTSTRAP, [dir]);
    assert.equal(again.code, 0, again.out);
    assert.equal(read(manifestPath), original);
  });

  it('writes the manifest with --no-scripts too, and leaves package.json alone', () => {
    const dir = project('manifest-no-scripts');
    const before = read(path.join(dir, 'package.json'));
    const r = run(BOOTSTRAP, [dir, '--no-scripts']);
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.existsSync(path.join(dir, '.okf-bootstrap.json')));
    assert.equal(read(path.join(dir, 'package.json')), before, 'package.json left alone');
  });

  it('adds the okf:update npm script', () => {
    const dir = project('update-script');
    const r = run(BOOTSTRAP, [dir]);
    assert.equal(r.code, 0, r.out);
    assert.equal(pkgOf(dir).scripts['okf:update'], 'good2go update');
    assert.match(r.out, /npm run okf:update/);
  });

  it('scaffolds the widget package as a workspace, and never replaces it', () => {
    const dir = project('widgets', { name: 'widgets', workspaces: ['apps/*'] });
    const r = run(BOOTSTRAP, [dir, '--widgets']);
    assert.equal(r.code, 0, r.out);
    const widgets = path.join(dir, 'packages', 'okf-widgets');
    for (const file of ['package.json', 'src/index.tsx', 'src/kit.tsx', 'README.md', 'vite.config.ts']) {
      assert.ok(fs.existsSync(path.join(widgets, file)), `missing ${file}`);
    }
    assert.ok(!fs.existsSync(path.join(widgets, 'node_modules')), 'no node_modules copied');
    assert.ok(!fs.existsSync(path.join(widgets, 'dist')), 'no build output copied');
    const pkg = pkgOf(dir);
    assert.deepEqual(pkg.workspaces, ['apps/*', 'packages/okf-widgets']);
    assert.equal(pkg.scripts['okf:view'], 'npm run okf:widgets:build && good2go view okf');
    assert.equal(pkg.scripts['okf:widgets:build'], 'npm run build -w okf-widgets');

    fs.writeFileSync(path.join(widgets, 'src', 'mine.ts'), 'export {};\n');
    const again = run(BOOTSTRAP, [dir, '--widgets', '--force']);
    assert.equal(again.code, 0, again.out);
    assert.ok(fs.existsSync(path.join(widgets, 'src', 'mine.ts')), 'project widgets survive --force');
    assert.deepEqual(pkgOf(dir).workspaces, ['apps/*', 'packages/okf-widgets'], 'no duplicate entry');
  });
});

describe('bootstrap --design-dir', () => {
  it('points the scripts at the folder, records it, and keeps it on a re-run', () => {
    const dir = project('design-dir');
    const r = run(BOOTSTRAP, [dir, '--design-dir', 'docs-bundle']);
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.existsSync(path.join(dir, 'docs-bundle', 'index.md')));
    assert.ok(fs.existsSync(path.join(dir, 'docs-bundle', 'adr', 'readme.md')));
    assert.ok(!fs.existsSync(path.join(dir, 'okf')), 'the default folder is not created');
    const s = pkgOf(dir).scripts;
    assert.equal(s['okf:validate'], 'good2go validate docs-bundle');
    assert.equal(s['okf:fix'], 'good2go fix docs-bundle');
    assert.equal(s['okf:view'], 'good2go view docs-bundle');
    assert.equal(s['okf:mermaid'], 'good2go mermaid docs-bundle');
    assert.equal(s['okf:recheck'], 'good2go recheck --bundle docs-bundle');
    assert.equal(JSON.parse(read(path.join(dir, '.okf-bootstrap.json'))).designDir, 'docs-bundle');
    assert.equal(run(GOOD2GO, ['validate', 'docs-bundle', '--strict'], dir).code, 0);

    // Re-run without the flag: the manifest's folder wins, and okf/ does not appear.
    const again = run(BOOTSTRAP, [dir]);
    assert.equal(again.code, 0, again.out);
    assert.ok(!fs.existsSync(path.join(dir, 'okf')));
    assert.equal(pkgOf(dir).scripts['okf:validate'], 'good2go validate docs-bundle');
    assert.equal(JSON.parse(read(path.join(dir, '.okf-bootstrap.json'))).designDir, 'docs-bundle');
  });

  it('does not create design/design when the bundle is called design', () => {
    const dir = project('design-design');
    const r = run(BOOTSTRAP, [dir, '--design-dir', 'design', '--name', 'Thing']);
    assert.equal(r.code, 0, r.out);
    assert.ok(!fs.existsSync(path.join(dir, 'design', 'design')));
    assert.ok(fs.existsSync(path.join(dir, 'design', 'architecture', '.gitkeep')));
    assert.ok(fs.existsSync(path.join(dir, 'design', 'thing', '.gitkeep')));
    assert.equal(pkgOf(dir).scripts['okf:validate'], 'good2go validate design');
    assert.equal(run(GOOD2GO, ['validate', 'design', '--strict'], dir).code, 0);
  });

  it('rejects a folder outside the project', () => {
    for (const bad of ['../x', '/abs', '.']) {
      assert.equal(run(BOOTSTRAP, [project('bad-design'), '--design-dir', bad]).code, 2, bad);
    }
  });
});

describe('migration from a scripts/ install', () => {
  /** What an old release left: copies of its tools and a manifest with the hash of each. */
  function legacy(name: string) {
    const dir = project(name, {
      name,
      scripts: { 'okf:view': 'node --import ./scripts/okf-start.mjs scripts/okf-view.mts okf' },
      devDependencies: { yaml: '^2.0.0' },
    });
    fs.mkdirSync(path.join(dir, 'okf'));
    fs.mkdirSync(path.join(dir, 'scripts'));
    const hash = (text: string) => createHash('sha256').update(text).digest('hex');
    fs.writeFileSync(path.join(dir, 'scripts', 'okf-view.mts'), '// unchanged view');
    fs.writeFileSync(path.join(dir, 'scripts', 'okf-search.mts'), '// original search');
    fs.writeFileSync(path.join(dir, 'scripts', 'okf-start.mjs'), '// start');
    fs.writeFileSync(
      path.join(dir, 'scripts', '.okf-bootstrap.json'),
      JSON.stringify({
        version: '0.6.0',
        files: {
          'scripts/okf-search.mts': hash('// original search'),
          'scripts/okf-start.mjs': hash('// start'),
          'scripts/okf-view.mts': hash('// unchanged view'),
        },
        templates: {},
      }),
    );
    return dir;
  }

  it('removes unchanged copies and the old manifest, and rewires the scripts', () => {
    const dir = legacy('migrate');
    const r = run(BOOTSTRAP, [dir, '--tools-only']);
    assert.equal(r.code, 0, r.out);
    assert.ok(!fs.existsSync(path.join(dir, 'scripts')), 'an emptied scripts/ goes too');
    assert.ok(fs.existsSync(path.join(dir, '.okf-bootstrap.json')), 'the manifest moved to the root');
    assert.match(r.out, /Removed[\s\S]*scripts\/okf-view\.mts[\s\S]*scripts\/\.okf-bootstrap\.json/);
    assert.equal(pkgOf(dir).scripts['okf:view'], 'good2go view okf');
    assert.ok(pkgOf(dir).devDependencies['@jb9k62/good2go']);
  });

  it('keeps a copy the project edited, and names it', () => {
    const dir = legacy('migrate-edited');
    fs.writeFileSync(path.join(dir, 'scripts', 'okf-search.mts'), '// my own change');
    fs.writeFileSync(path.join(dir, 'scripts', 'mine.mts'), '// not ours');
    const r = run(BOOTSTRAP, [dir, '--tools-only']);
    assert.equal(r.code, 0, r.out);
    assert.equal(read(path.join(dir, 'scripts', 'okf-search.mts')), '// my own change');
    assert.ok(fs.existsSync(path.join(dir, 'scripts', 'mine.mts')), 'files that were never ours stay');
    assert.ok(!fs.existsSync(path.join(dir, 'scripts', 'okf-view.mts')));
    assert.ok(!fs.existsSync(path.join(dir, 'scripts', 'okf-start.mjs')));
    assert.ok(!fs.existsSync(path.join(dir, 'scripts', '.okf-bootstrap.json')));
    assert.match(r.out, /Kept, because they differ[\s\S]*scripts\/okf-search\.mts/);
    assert.doesNotMatch(r.out.split('Kept, because they differ')[1] ?? '', /okf-view\.mts/);
  });

  it('carries the name over from the old manifest', () => {
    const dir = legacy('migrate-name');
    const file = path.join(dir, 'scripts', '.okf-bootstrap.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(read(file)), name: 'Old Name' }));
    run(BOOTSTRAP, [dir, '--tools-only']);
    assert.equal(JSON.parse(read(path.join(dir, '.okf-bootstrap.json'))).name, 'Old Name');
  });
});


describe('okf-view validation', () => {
  const VIEW = path.join(SKILL, 'assets', 'okf-view.mts');

  function bundle(name: string, files: Record<string, string>): string {
    const dir = path.join(scratch, name);
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    return dir;
  }

  it('reports a missing type, a dangling link and a date-only timestamp', () => {
    const dir = bundle('issues', {
      'index.md': '---\nokf_version: "0.2"\n---\n\n# T\n\n[gone](/nope.md)\n',
      'a.md': '---\ntitle: no type\n---\n',
      'b.md': '---\ntype: Reference\ngenerated: { by: x/1, at: 2026-08-09 }\n---\n',
      'c.md': '---\ntype: Reference\nstale_after: 2026-08-09T00:00:00+02:00\n---\n',
    });
    const r = run(VIEW, [dir, '--validate', '--strict']);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /a\.md\s+\[missing-type\]/);
    assert.match(r.out, /index\.md\s+\[dangling-link\]/);
    assert.match(r.out, /b\.md\s+\[timestamp\] generated\.at: 2026-08-09/);
    assert.doesNotMatch(r.out, /c\.md/, 'a datetime with an offset is fine');
  });

  it('reports a bundle that declares another OKF version', () => {
    const dir = bundle('version', { 'index.md': '---\nokf_version: "0.3"\n---\n\n# T\n' });
    const r = run(VIEW, [dir, '--validate']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /okf_version\s+: 0\.3\s+\(this tool implements 0\.2/);
  });
});

describe('okf-view ER diagram keys', () => {
  const VIEW = path.join(SKILL, 'assets', 'okf-view.mts');
  const ERD = [
    '```mermaid',
    'erDiagram',
    '    TEAM ||--o{ PLAYER : fields',
    '    PLAYER }o..o| COACH : "trained by"',
    '    PLAYER {',
    '        int id PK',
    '        int team_id FK',
    '    }',
    '```',
  ].join('\n');

  function bundle(name: string, body: string): { dir: string; file: string } {
    const dir = path.join(scratch, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# T\n');
    const file = path.join(dir, 'model.md');
    fs.writeFileSync(file, `---\ntype: Data Model\n---\n\n# Model\n\n${body}\n\nAfter.\n`);
    return { dir, file };
  }

  it('flags an ER diagram with no key, and --fix writes one that then validates', () => {
    const { dir, file } = bundle('erd-missing', ERD);
    const before = run(VIEW, [dir, '--validate', '--strict']);
    assert.equal(before.code, 1, before.out);
    assert.match(before.out, /model\.md\s+\[erd-legend\] erDiagram at line 7 has no relationship key/);

    const fixed = run(VIEW, [dir, '--validate', '--strict', '--fix']);
    assert.equal(fixed.code, 0, fixed.out);
    const text = read(file);
    // Each relationship in words first, then only the symbols this diagram uses.
    assert.match(text, /- `TEAM \|\|--o\{ PLAYER`: each TEAM is linked to zero or more PLAYER; each PLAYER is linked to exactly one TEAM\./);
    assert.match(text, /- `PLAYER \}o\.\.o\| COACH`: each PLAYER is linked to zero or one COACH; each COACH is linked to zero or more PLAYER\./);
    assert.ok(text.indexOf('TEAM ||--o{ PLAYER') < text.indexOf('exactly one\n'), 'sentences come before the symbol list');
    assert.match(text, /- `\|\|`: exactly one/);
    assert.match(text, /- `\}o` and `o\{`: zero or more/);
    assert.match(text, /- `\|o` and `o\|`: zero or one/);
    assert.doesNotMatch(text, /one or more/);
    assert.match(text, /`--` solid, identifying[\s\S]*`\.\.` dashed, non-identifying/);
    assert.match(text, /`PK` primary key, `FK` foreign key/);
    assert.match(text, /<!-- \/okf:erd-legend -->\n\nAfter\./, 'text after the key stays separated');

    const again = run(VIEW, [dir, '--validate', '--strict', '--fix']);
    assert.match(again.out, /nothing to fix/);
    assert.equal(read(file), text, 'a second --fix changes nothing');
  });

  it('flags a key that no longer matches the diagram, and refreshes it in place', () => {
    const { dir, file } = bundle('erd-stale', ERD);
    run(VIEW, [dir, '--validate', '--fix']);
    fs.writeFileSync(file, read(file).replace('PLAYER }o..o| COACH', 'PLAYER }|--|{ COACH'));
    const stale = run(VIEW, [dir, '--validate', '--strict']);
    assert.equal(stale.code, 1, stale.out);
    assert.match(stale.out, /out-of-date relationship key/);
    run(VIEW, [dir, '--validate', '--fix']);
    const text = read(file);
    assert.match(text, /one or more/);
    assert.doesNotMatch(text, /zero or one/);
    assert.equal(text.match(/okf:erd-legend -->/g)?.length, 2, 'one key, replaced rather than repeated');
  });

  it('leaves other diagrams, and ER examples inside an outer fence, alone', () => {
    const body = [
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
      '',
      '````markdown',
      ERD,
      '````',
    ].join('\n');
    const { dir, file } = bundle('erd-other', body);
    const before = read(file);
    const r = run(VIEW, [dir, '--validate', '--strict', '--fix']);
    assert.equal(r.code, 0, r.out);
    assert.equal(read(file), before);
  });

  it('says nothing about line style when every line is solid', () => {
    const { dir, file } = bundle('erd-solid', '```mermaid\nerDiagram\n    TEAM ||--o{ PLAYER : fields\n```');
    run(VIEW, [dir, '--validate', '--fix']);
    assert.doesNotMatch(read(file), /solid|dashed|identifying/);
  });

  it('writes the first few relationships in words and counts the rest', () => {
    const lines = Array.from({ length: 9 }, (_, i) => `    A${i} ||--o{ B${i} : has`);
    const { dir, file } = bundle('erd-many', ['```mermaid', 'erDiagram', ...lines, '```'].join('\n'));
    run(VIEW, [dir, '--validate', '--fix']);
    const text = read(file);
    assert.equal(text.match(/each A\d is linked to/g)?.length, 6);
    assert.match(text, /\.\.\.and 3 more, read the same way/);
  });

  it('gives an entity-only diagram the full reference key', () => {
    const { dir, file } = bundle('erd-lonely', '```mermaid\nerDiagram\n    TEAM {\n        int id PK\n    }\n```');
    assert.equal(run(VIEW, [dir, '--validate', '--strict']).code, 1);
    assert.equal(run(VIEW, [dir, '--validate', '--strict', '--fix']).code, 0);
    const text = read(file);
    for (const meaning of ['exactly one', 'zero or one', 'zero or more', 'one or more']) assert.match(text, new RegExp(meaning));
    assert.match(text, /`PK` primary key, `FK` foreign key, `UK` unique key/);
    assert.doesNotMatch(text, /Example:/);
  });
});

describe('release metadata', () => {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));

  it('keeps one version in package.json, both plugin manifests, bootstrap.mts and good2go.mts', () => {
    const v = pkg.version.replace(/\./g, '\\.');
    assert.equal(pkg.version, '0.7.0');
    assert.match(read(BOOTSTRAP), new RegExp(`const VERSION = '${v}'`));
    assert.match(read(GOOD2GO), new RegExp(`const VERSION = '${v}'`));
    const plugin = JSON.parse(read(path.join(ROOT, '.claude-plugin', 'plugin.json')));
    const market = JSON.parse(read(path.join(ROOT, '.claude-plugin', 'marketplace.json')));
    assert.equal(plugin.version, pkg.version);
    assert.equal(market.plugins[0].version, pkg.version);
  });

  it('publishes the good2go command from dist/', () => {
    assert.equal(pkg.name, '@jb9k62/good2go');
    assert.equal(pkg.bin.good2go, 'dist/good2go.mjs');
  });

  it('has skill frontmatter both pi and Claude Code accept', () => {
    const front = read(path.join(SKILL, 'SKILL.md')).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    assert.match(front, /^name: okf-bootstrap$/m);
    const description = front.split(/^description:/m)[1] ?? '';
    assert.ok(description.trim().length > 0);
    // Agent Skills spec limit (pi warns above it; Claude Code truncates).
    assert.ok(description.replace(/\s+/g, ' ').length <= 1024, 'description over 1024 chars');
  });

  it('vendors the OKF spec at the version the viewer implements', () => {
    const upstream = JSON.parse(read(path.join(SKILL, 'references', 'okf-spec', 'UPSTREAM.json')));
    assert.match(read(path.join(SKILL, 'assets', 'okf-view.mts')), new RegExp(`OKF_VERSION = '${upstream.version}'`));
    assert.match(read(path.join(SKILL, 'references', 'okf-spec', 'SPEC.md')), new RegExp(`\\*\\*Version ${upstream.version}`));
  });
});
