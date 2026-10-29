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
const SKILL = path.join(ROOT, 'skills', 'good2go');
const BOOTSTRAP = path.join(ROOT, 'src', 'g2g-init.mts');
const GOOD2GO = path.join(ROOT, 'src', 'good2go.mts');
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
      '.good2go.json',
      'okf-concept-template.md',
      'okf-explainer-template.md',
    ]) {
      assert.ok(fs.existsSync(path.join(dir, file)), `missing ${file}`);
    }
    assert.ok(!fs.existsSync(path.join(dir, 'scripts')), 'no scripts/: the tools live in the package');
    assert.ok(!fs.existsSync(path.join(dir, 'packages')), 'no widgets without --widgets');
    const pkg = pkgOf(dir);
    assert.equal(pkg.scripts['g2g:validate'], 'good2go validate okf');
    assert.equal(pkg.scripts['g2g:build-view'], 'good2go build-view');
    assert.equal(pkg.scripts['g2g:view'], 'good2go open');
    assert.equal(pkg.scripts['g2g:fix'], 'good2go fix okf');
    assert.equal(pkg.scripts['g2g:search'], 'good2go search --bundle okf');
    assert.equal(pkg.scripts['okf:update'], undefined, 'there is no updater: upgrades are npm update');
    assert.equal(pkg.scripts['g2g:widgets:build'], undefined);
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
    assert.ok(fs.existsSync(path.join(dir, '.good2go.json')));
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
      for (const skill of ['good2go', 'edukai']) {
        assert.ok(fs.existsSync(path.join(dir, home, 'skills', skill, 'SKILL.md')), `${home} ${skill}`);
      }
      assert.ok(fs.existsSync(path.join(dir, home, 'skills', 'good2go', 'references', 'PLAYBOOK.md')));
      assert.ok(!fs.existsSync(path.join(dir, home, 'src')), 'no tools');
    }
    const recorded = JSON.parse(read(path.join(dir, '.good2go.json'))).skills;
    assert.match(recorded.edukai['SKILL.md'], /^[0-9a-f]{64}$/);
    const mine = path.join(dir, '.claude', 'skills', 'edukai', 'SKILL.md');
    fs.writeFileSync(mine, 'my edit\n');
    const again = run(BOOTSTRAP, [dir]);
    assert.equal(again.code, 0, again.out);
    assert.match(again.out, /Kept[\s\S]*\.claude\/skills\/edukai\/ \(edited/);
    assert.equal(read(mine), 'my edit\n');
    run(BOOTSTRAP, [dir, '--force']);
    assert.match(read(mine), /^---\nname: edukai/);
  });

  it('refreshes skills that still match what was installed, and keeps edited ones', () => {
    const dir = project('refresh');
    assert.equal(run(BOOTSTRAP, [dir]).code, 0);
    const manifest = path.join(dir, '.good2go.json');
    const claudeGood = path.join(dir, '.claude', 'skills', 'good2go', 'SKILL.md');
    const agentsGood = path.join(dir, '.agents', 'skills', 'good2go', 'SKILL.md');
    const shipped = read(claudeGood);
    // Pretend an older release installed these: change the files and record the old hashes.
    const m = JSON.parse(read(manifest));
    const old = 'an older release\n';
    fs.writeFileSync(claudeGood, old);
    m.skills.good2go['SKILL.md'] = createHash('sha256').update(old).digest('hex');
    fs.writeFileSync(agentsGood, 'edited by hand\n');
    fs.writeFileSync(manifest, JSON.stringify(m));
    const r = run(BOOTSTRAP, [dir]);
    assert.equal(r.code, 0, r.out);
    assert.equal(read(claudeGood), shipped, 'unchanged since install: refreshed');
    assert.match(r.out, /\.claude\/skills\/good2go\/ \(refreshed/);
    assert.equal(read(agentsGood), 'edited by hand\n', 'edited: kept');
    assert.match(r.out, /\.agents\/skills\/good2go\/ \(edited/);
    assert.equal(run(BOOTSTRAP, [dir, '--force']).code, 0);
    assert.equal(read(agentsGood), shipped, '--force replaces');
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

  it('no longer has --tools-only', () => {
    assert.equal(run(BOOTSTRAP, [project('no-tools-only'), '--tools-only']).code, 2);
  });

  it('writes the install manifest at the project root, with the version, name and design folder', () => {
    const dir = project('manifest');
    const r = run(BOOTSTRAP, [dir, '--name', 'Manifest App']);
    assert.equal(r.code, 0, r.out);
    const text = read(path.join(dir, '.good2go.json'));
    assert.ok(text.endsWith('}\n'), 'trailing newline');
    assert.equal(text, JSON.stringify(JSON.parse(text), null, 2) + '\n', '2-space indent');
    const manifest = JSON.parse(text);
    assert.deepEqual(Object.keys(manifest), ['version', 'name', 'designDir', 'bundles', 'skills']);
    assert.equal(manifest.version, pkgOf(ROOT).version);
    assert.equal(manifest.name, 'Manifest App');
    assert.equal(manifest.designDir, 'okf');
    assert.ok(!fs.existsSync(path.join(dir, 'scripts')));
  });

  it('rewrites the manifest on a re-run, and remembers the name', () => {
    const dir = project('manifest-rerun');
    run(BOOTSTRAP, [dir, '--name', 'Remembered']);
    const manifestPath = path.join(dir, '.good2go.json');
    const original = read(manifestPath);
    fs.writeFileSync(manifestPath, JSON.stringify({ version: '0.0.0', name: 'Remembered' }) + '\n');
    const again = run(BOOTSTRAP, [dir]);
    assert.equal(again.code, 0, again.out);
    assert.equal(read(manifestPath), original);
  });

  it('writes the manifest with --no-scripts too, and leaves package.json alone', () => {
    const dir = project('manifest-no-scripts');
    const before = read(path.join(dir, 'package.json'));
    const r = run(BOOTSTRAP, [dir, '--no-scripts']);
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.existsSync(path.join(dir, '.good2go.json')));
    assert.equal(read(path.join(dir, 'package.json')), before, 'package.json left alone');
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
    assert.equal(pkg.scripts['g2g:build-view'], 'npm run g2g:widgets:build && good2go build-view');
    assert.equal(pkg.scripts['g2g:view'], 'npm run g2g:widgets:build && good2go open');
    assert.equal(pkg.scripts['g2g:widgets:build'], 'npm run build -w okf-widgets');

    fs.writeFileSync(path.join(widgets, 'src', 'mine.ts'), 'export {};\n');
    const again = run(BOOTSTRAP, [dir, '--widgets', '--force']);
    assert.equal(again.code, 0, again.out);
    assert.ok(fs.existsSync(path.join(widgets, 'src', 'mine.ts')), 'project widgets survive --force');
    assert.deepEqual(pkgOf(dir).workspaces, ['apps/*', 'packages/okf-widgets'], 'no duplicate entry');
  });
});

describe('templates', () => {
  it('names no tool path from the old layout', () => {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        if (['node_modules', 'dist'].includes(e.name)) return [];
        const f = path.join(d, e.name);
        return e.isDirectory() ? walk(f) : [f];
      });
    for (const file of walk(path.join(ROOT, 'src', 'templates'))) {
      if (file.endsWith('package.json')) continue;
      assert.doesNotMatch(read(file), /scripts\/(g2g|okf)-|\b(g2g|okf)-[a-z]+\.m[tj]s\b/, file);
    }
    assert.match(read(path.join(ROOT, 'src', 'templates', 'edukai-recheck.yml')), /npm run --silent g2g:recheck/);
  });

  it('stores the widgets .gitignore as gitignore (npm drops dotfiles of that name) and restores it', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'src', 'templates', 'okf-widgets', 'gitignore')));
    assert.ok(!fs.existsSync(path.join(ROOT, 'src', 'templates', 'okf-widgets', '.gitignore')));
    const dir = project('widgets-ignore');
    assert.equal(run(BOOTSTRAP, [dir, '--widgets']).code, 0);
    assert.match(read(path.join(dir, 'packages', 'okf-widgets', '.gitignore')), /node_modules/);
    assert.ok(!fs.existsSync(path.join(dir, 'packages', 'okf-widgets', 'gitignore')));
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
    assert.equal(s['g2g:validate'], 'good2go validate docs-bundle');
    assert.equal(s['g2g:fix'], 'good2go fix docs-bundle');
    assert.equal(s['g2g:build-view'], 'good2go build-view', 'no folder: it builds every listed bundle');
    assert.equal(s['g2g:view'], 'good2go open');
    assert.equal(s['g2g:mermaid'], 'good2go mermaid docs-bundle');
    assert.equal(s['g2g:recheck'], 'good2go recheck --bundle docs-bundle');
    assert.equal(s['g2g:questions'], 'good2go questions --bundle docs-bundle');
    assert.equal(JSON.parse(read(path.join(dir, '.good2go.json'))).designDir, 'docs-bundle');
    assert.equal(run(GOOD2GO, ['validate', 'docs-bundle', '--strict'], dir).code, 0);

    // Re-run without the flag: the manifest's folder wins, and okf/ does not appear.
    const again = run(BOOTSTRAP, [dir]);
    assert.equal(again.code, 0, again.out);
    assert.ok(!fs.existsSync(path.join(dir, 'okf')));
    assert.equal(pkgOf(dir).scripts['g2g:validate'], 'good2go validate docs-bundle');
    assert.equal(JSON.parse(read(path.join(dir, '.good2go.json'))).designDir, 'docs-bundle');
    assert.deepEqual(JSON.parse(read(path.join(dir, '.good2go.json'))).bundles, ['docs-bundle']);
    // A bundle added later (good2go new) stays listed through another run, and --edukai joins it.
    const m = JSON.parse(read(path.join(dir, '.good2go.json')));
    fs.writeFileSync(path.join(dir, '.good2go.json'), JSON.stringify({ ...m, bundles: [...m.bundles, 'ops'] }));
    assert.equal(run(BOOTSTRAP, [dir, '--edukai']).code, 0);
    assert.deepEqual(JSON.parse(read(path.join(dir, '.good2go.json'))).bundles, ['docs-bundle', 'ops', 'edukai']);
  });

  it('does not create design/design when the bundle is called design', () => {
    const dir = project('design-design');
    const r = run(BOOTSTRAP, [dir, '--design-dir', 'design', '--name', 'Thing']);
    assert.equal(r.code, 0, r.out);
    assert.ok(!fs.existsSync(path.join(dir, 'design', 'design')));
    assert.ok(fs.existsSync(path.join(dir, 'design', 'architecture', '.gitkeep')));
    assert.ok(fs.existsSync(path.join(dir, 'design', 'thing', '.gitkeep')));
    assert.equal(pkgOf(dir).scripts['g2g:validate'], 'good2go validate design');
    assert.equal(run(GOOD2GO, ['validate', 'design', '--strict'], dir).code, 0);
  });

  it('rejects a folder outside the project, and one that is not a plain name', () => {
    for (const bad of ['../x', '/abs', '.', '', '../../x', 'a/../b', 'docs;touch PWNED', 'Docs', 'a b', '$(id)', 'a\\b']) {
      const dir = project('bad-design');
      assert.equal(run(BOOTSTRAP, [dir, '--design-dir', bad]).code, 2, bad);
      assert.ok(!fs.existsSync(path.join(dir, 'PWNED')));
      assert.ok(!fs.existsSync(path.join(dir, '.good2go.json')), 'nothing is written: ' + bad);
    }
  });

  it('accepts a nested folder of plain names', () => {
    const dir = project('nested-design');
    assert.equal(run(BOOTSTRAP, [dir, '--design-dir', 'docs/design.v2']).code, 0);
    assert.equal(pkgOf(dir).scripts['g2g:validate'], 'good2go validate docs/design.v2');
  });

  it('rejects a poisoned design folder in a committed manifest', () => {
    for (const bad of ['docs;touch PWNED', '../../x', '/etc']) {
      const dir = project('poisoned');
      fs.writeFileSync(path.join(dir, '.good2go.json'), JSON.stringify({ version: '0.1.0', name: 'x', designDir: bad }));
      const r = run(BOOTSTRAP, [dir]);
      assert.equal(r.code, 2, bad);
      assert.match(r.out, /\.good2go\.json/);
      assert.deepEqual(pkgOf(dir).scripts ?? {}, {});
    }
  });

  it('sanitises --slug: kebab-case or refused, never a path', () => {
    const dir = project('slugs');
    assert.equal(run(BOOTSTRAP, [dir, '--slug', 'My Service_2']).code, 0);
    assert.ok(fs.existsSync(path.join(dir, 'okf', 'my-service-2', '.gitkeep')));
    for (const bad of ['../../escaped', 'a/b', 'x;touch PWNED', '..', '', '-']) {
      const d = project('bad-slug');
      assert.equal(run(BOOTSTRAP, [d, '--slug', bad]).code, 2, bad);
      assert.ok(!fs.existsSync(path.join(scratch, 'escaped')));
      assert.ok(!fs.existsSync(path.join(d, 'okf')), 'nothing is written: ' + bad);
    }
  });

  it('names the folders it made, design/ or architecture/', () => {
    const r = run(BOOTSTRAP, [project('named'), '--design-dir', 'design', '--name', 'Thing']);
    assert.match(r.out, /design\/architecture\/, design\/thing\//);
    assert.doesNotMatch(r.out, /design\/design\//);
  });
});

describe('g2g-view validation', () => {
  const VIEW = path.join(ROOT, 'src', 'g2g-view.mts');

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

describe('g2g-view ER diagram keys', () => {
  const VIEW = path.join(ROOT, 'src', 'g2g-view.mts');
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

  it('stamps the package.json version into the manifest and the scaffolded frontmatter', () => {
    const dir = project('stamped');
    assert.equal(run(BOOTSTRAP, [dir]).code, 0);
    assert.equal(JSON.parse(read(path.join(dir, '.good2go.json'))).version, pkg.version);
    assert.match(read(path.join(dir, 'okf', 'index.md')) + read(path.join(dir, 'okf', 'adr', 'readme.md')), new RegExp(`good2go/${pkg.version.replace(/\./g, '\\.')}`));
    assert.doesNotMatch(read(BOOTSTRAP), /const VERSION = '/);
  });

  it('publishes the good2go command from dist/', () => {
    assert.equal(pkg.name, '@jb9k62/good2go');
    assert.equal(pkg.bin.good2go, 'dist/good2go.mjs');
  });

  it('has skill frontmatter both pi and Claude Code accept', () => {
    const front = read(path.join(SKILL, 'SKILL.md')).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    assert.match(front, /^name: good2go$/m);
    const description = front.split(/^description:/m)[1] ?? '';
    assert.ok(description.trim().length > 0);
    // Agent Skills spec limit (pi warns above it; Claude Code truncates).
    assert.ok(description.replace(/\s+/g, ' ').length <= 1024, 'description over 1024 chars');
  });

  it('vendors the OKF spec at the version the viewer implements', () => {
    const upstream = JSON.parse(read(path.join(SKILL, 'references', 'okf-spec', 'UPSTREAM.json')));
    assert.match(read(path.join(ROOT, 'src', 'g2g-view.mts')), new RegExp(`OKF_VERSION = '${upstream.version}'`));
    assert.match(read(path.join(SKILL, 'references', 'okf-spec', 'SPEC.md')), new RegExp(`\\*\\*Version ${upstream.version}`));
  });
});
