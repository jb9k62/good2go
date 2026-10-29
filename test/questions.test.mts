/** `good2go questions`: parsing the section, the problems it reports, and the answer/reopen round trip. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseQuestions, questionId } from '../src/g2g-questions.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOOD2GO = path.join(ROOT, 'src', 'good2go.mts');
const CACHE = path.join(ROOT, '.cache', 'test');
fs.mkdirSync(CACHE, { recursive: true });
const scratch = fs.mkdtempSync(path.join(CACHE, 'questions-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const run = (args: string[], cwd = ROOT) => {
  const r = spawnSync(process.execPath, [GOOD2GO, 'questions', ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
function bundle(name: string, files: Record<string, string>): string {
  const dir = path.join(scratch, name);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const FM = '---\ntype: Concept\n---\n';

describe('parseQuestions', () => {
  it('reads open and answered items under either spelling, with file line numbers', () => {
    const text = `${FM}# A\n\n## Open Questions\n\n- [ ] One?\n- [x] Two? — answered in [adr](adr/x.md), 2026-10-29\n\n## Open question\n\n- [ ] Three?\n`;
    const { questions, problems } = parseQuestions('a.md', text);
    assert.deepEqual(questions.map((q) => [q.text, q.answered, q.line]), [
      ['One?', false, 8],
      ['Two?', true, 9],
      ['Three?', false, 13],
    ]);
    assert.equal(questions[1]!.answer, 'adr/x.md');
    assert.deepEqual(problems.map((p) => [p.level, p.line]), [['warning', 11]]);
  });

  it('counts a bullet with no checkbox as open, with a warning', () => {
    const { questions, problems } = parseQuestions('a.md', `${FM}## Open Questions\n\n- Plain?\n`);
    assert.equal(questions[0]!.answered, false);
    assert.match(problems[0]!.message, /no checkbox/);
  });

  it('ignores a heading inside a code fence, and ends a section at a heading of the same level', () => {
    const text = `${FM}\`\`\`md\n## Open Questions\n- [ ] fenced\n\`\`\`\n\n### Open Questions\n\n- [ ] real\n\n### Notes\n\n- [ ] not a question\n`;
    assert.deepEqual(parseQuestions('a.md', text).questions.map((q) => q.text), ['real']);
  });

  it('warns about an empty section and errors on a repeated question', () => {
    assert.match(parseQuestions('a.md', `${FM}## Open Questions\n\nNone yet.\n`).problems[0]!.message, /no questions/);
    const dup = parseQuestions('a.md', `${FM}## Open Questions\n\n- [ ] Same?\n- [ ]   same?\n`);
    assert.deepEqual(dup.problems.map((p) => p.level), ['error']);
  });

  it('keeps a question id when it is answered', () => {
    const open = parseQuestions('a.md', `${FM}## Open Questions\n\n- [ ] Why?\n`).questions[0]!;
    const done = parseQuestions('a.md', `${FM}## Open Questions\n\n- [x] Why? — answered in [x](x.md), 2026-10-29\n`).questions[0]!;
    assert.equal(open.id, done.id);
    assert.equal(open.id, questionId('a', 'why?'));
  });
});

describe('good2go questions', () => {
  it('lists open questions as JSON and exits 0', () => {
    const dir = bundle('list', { 'a.md': `${FM}## Open Questions\n\n- [ ] One?\n- [x] Two? — answered in [b](b.md), 2026-10-29\n`, 'b.md': FM + '# B\n' });
    const r = run(['--bundle', dir, '--json']);
    assert.equal(r.code, 0, r.out);
    const j = JSON.parse(r.out);
    assert.equal(j.open, 1);
    assert.equal(j.answered, 1);
    assert.equal(j.questions.length, 1);
  });

  it('exits 1 for an answered question with no link, and for a dangling link', () => {
    const dir = bundle('bad', { 'a.md': `${FM}## Open Questions\n\n- [x] One?\n- [x] Two? — answered in [b](missing.md), 2026-10-29\n` });
    const r = run(['check', dir]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /links nowhere/);
    assert.match(r.out, /not a file/);
  });

  it('exits 0 on a warning, 1 with --strict', () => {
    const dir = bundle('warn', { 'a.md': `${FM}## Open Question\n\n- [ ] One?\n` });
    assert.equal(run(['check', dir]).code, 0);
    assert.equal(run(['check', dir, '--strict']).code, 1);
  });

  it('answers a question with a link, then reopens it', () => {
    const dir = bundle('round', { 'a.md': `${FM}## Open Questions\n\n- [ ] One?\n  More.\n`, 'adr/b.md': FM + '# B\n' });
    const id = JSON.parse(run(['--bundle', dir, '--json']).out).questions[0].id;
    const a = run(['answer', id, '--by', 'adr/b', dir]);
    assert.equal(a.code, 0, a.out);
    const answered = fs.readFileSync(path.join(dir, 'a.md'), 'utf8');
    assert.match(answered, /- \[x\] One\?\n {2}More\. — answered in \[b\]\(adr\/b\.md\), \d{4}-\d\d-\d\d\n/);
    assert.equal(run(['check', dir]).code, 0);
    assert.equal(run(['answer', id, '--by', 'adr/b', dir]).code, 2, 'already answered');
    assert.equal(run(['reopen', id, dir]).code, 0);
    assert.equal(fs.readFileSync(path.join(dir, 'a.md'), 'utf8'), `${FM}## Open Questions\n\n- [ ] One?\n  More.\n`);
  });

  it('refuses an answer that points nowhere, and an unknown id', () => {
    const dir = bundle('refuse', { 'a.md': `${FM}## Open Questions\n\n- [ ] One?\n` });
    const id = JSON.parse(run(['--bundle', dir, '--json']).out).questions[0].id;
    assert.equal(run(['answer', id, '--by', 'nope', dir]).code, 2);
    assert.equal(run(['answer', 'zzzzzz', '--by', 'a', dir]).code, 2);
    assert.equal(run(['--bundle', path.join(scratch, 'none')]).code, 2);
  });

  it('is reported by validate: an error fails --strict, a warning does not', () => {
    const index = '---\nokf_version: "0.2"\n---\n# T\n';
    const warn = bundle('v-warn', { 'index.md': index, 'a.md': `${FM}## Open Question\n\n- [ ] One?\n` });
    const w = spawnSync(process.execPath, [GOOD2GO, 'validate', warn, '--strict'], { encoding: 'utf8' });
    assert.equal(w.status, 0, w.stdout + w.stderr);
    assert.match(w.stdout, /Open questions \(warnings\)/);
    const bad = bundle('v-bad', { 'index.md': index, 'a.md': `${FM}## Open Questions\n\n- [x] One?\n` });
    assert.equal(spawnSync(process.execPath, [GOOD2GO, 'validate', bad, '--strict'], { encoding: 'utf8' }).status, 1);
  });
});
