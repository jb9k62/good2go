#!/usr/bin/env node
/**
 * Open questions in a bundle: find them, list them, mark them answered.
 *
 * Any section headed "Open Questions" (or "Open Question"; matched without regard to case,
 * at any heading level) holds questions, one list item each:
 *
 *   - [ ] Should retries be capped per parcel?
 *   - [x] Which carrier API? — answered in [ADR-0003](../adr/0003-carrier.md), 2026-10-29
 *
 * `[ ]` is open and `[x]` is answered; an answered question must link to where it was answered
 * (a concept in the bundle, or a file in the project). An item without a checkbox counts as
 * open and is reported as a warning. A question's id is derived from its concept and its text
 * (nothing is written into the Markdown), so it changes if the question is reworded.
 *
 * Usage:
 *   good2go questions [list] [bundle] [options]   the questions, grouped by concept
 *   good2go questions check [bundle] [options]    only the problems
 *   good2go questions answer <id> --by <where> [bundle]   mark one answered, linking to <where>
 *   good2go questions reopen <id> [bundle]        mark one open again and drop its answer
 *
 * <where> is a concept id or a file path, with an optional line: `adr/0003-carrier`,
 * `src/retry.mts:42` or `src/retry.mts#L42`. A path is read from the bundle, then from the
 * project (the bundle's parent folder).
 *
 * Options:
 *   --bundle <dir>   bundle directory (default: ./okf)
 *   --status <s>     open (default) | answered | all
 *   --concept <id>   only this concept (the end of an id will do when it names one)
 *   --json           machine-readable output
 *   --strict         exit 1 on warnings too
 *   -h, --help       print this help and exit 0
 *
 * Errors: an answered question with no link, or a link that does not resolve; two questions
 * with the same text in one concept. Warnings: the singular heading "Open Question", an item
 * with no checkbox, a section with no questions.
 *
 * Exit codes: 0 ok, 1 an error (or a warning with --strict), 2 could not run (bad arguments,
 * missing bundle, unknown or ambiguous id).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { listMarkdown } from './g2g-core.mts';
import { ANSWER_MARK_RE, parseQuestions, questionId } from './g2g-qparse.mts';
import type { Question, QuestionProblem } from './g2g-qparse.mts';
import { helpFromComment } from './g2g-shared.mts';

/** Where an answer link points: bundle first, then the project. Null when it is not a local file. */
function resolveTarget(target: string, docDir: string, bundleRoot: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return 'external';
  const clean = target.replace(/#.*$/, '').replace(/:\d+$/, '');
  const candidates = clean.startsWith('/')
    ? [path.join(bundleRoot, clean), path.join(path.dirname(bundleRoot), clean)]
    : [path.resolve(docDir, clean), path.resolve(bundleRoot, clean), path.resolve(path.dirname(bundleRoot), clean)];
  for (const c of candidates) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}

export { parseQuestions, questionId };
export type { Question, QuestionProblem };

export interface Report {
  questions: Question[];
  problems: QuestionProblem[];
}

/** Every question in the bundle, with the problems found (answers are checked here). */
export function readQuestions(bundleRoot: string): Report {
  const questions: Question[] = [];
  const problems: QuestionProblem[] = [];
  for (const rel of listMarkdown(bundleRoot)) {
    let text: string;
    try {
      text = fs.readFileSync(path.join(bundleRoot, rel), 'utf8');
    } catch {
      continue;
    }
    const parsed = parseQuestions(rel, text);
    questions.push(...parsed.questions);
    problems.push(...parsed.problems);
    for (const q of parsed.questions) {
      if (!q.answered) continue;
      if (!q.answer) {
        problems.push({ level: 'error', file: rel, line: q.line, message: `"${q.text.slice(0, 50)}" is answered but links nowhere; add a link to where it was answered` });
      } else if (resolveTarget(q.answer, path.dirname(path.join(bundleRoot, rel)), bundleRoot) === null) {
        problems.push({ level: 'error', file: rel, line: q.line, message: `"${q.text.slice(0, 50)}" is answered in ${q.answer}, which is not a file` });
      }
    }
  }
  return { questions, problems };
}

/** Problems as validation reports them: errors only count as issues, warnings are printed beside. */
export const errorsOf = (r: Report): QuestionProblem[] => r.problems.filter((p) => p.level === 'error');

// --- editing --------------------------------------------------------------------

interface Options {
  command: 'list' | 'check' | 'answer' | 'reopen';
  bundle: string;
  status: 'open' | 'answered' | 'all';
  concept: string | null;
  json: boolean;
  strict: boolean;
  by: string | null;
  id: string | null;
}

function fail(message: string): never {
  console.error('good2go questions: ' + message);
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const o: Options = { command: 'list', bundle: 'okf', status: 'open', concept: null, json: false, strict: false, by: null, id: null };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = (): string => argv[++i] ?? fail(`${a} needs a value (see --help)`);
    if (a === '-h' || a === '--help') {
      console.log(helpFromComment(import.meta.url));
      process.exit(0);
    } else if (a === '--bundle') o.bundle = value();
    else if (a === '--status') {
      const s = value();
      if (s !== 'open' && s !== 'answered' && s !== 'all') fail('--status is open, answered or all');
      o.status = s;
    } else if (a === '--concept') o.concept = value();
    else if (a === '--by') o.by = value();
    else if (a === '--json') o.json = true;
    else if (a === '--strict') o.strict = true;
    else if (a.startsWith('-')) fail(`unknown flag ${a} (see --help)`);
    else positional.push(a);
  }
  const cmd = positional[0];
  if (cmd === 'list' || cmd === 'check' || cmd === 'answer' || cmd === 'reopen') {
    o.command = cmd;
    positional.shift();
  }
  if (o.command === 'answer' || o.command === 'reopen') {
    o.id = positional.shift() ?? fail(`${o.command} needs a question id (good2go questions lists them)`);
  }
  if (positional.length) o.bundle = positional[0]!;
  if (o.command === 'answer' && !o.by) fail('answer needs --by <concept or file[:line]>');
  return o;
}

function find(report: Report, id: string): Question {
  const hits = report.questions.filter((q) => q.id === id || q.id.startsWith(id));
  if (hits.length === 0) fail(`no question with id ${id}`);
  if (hits.length > 1) fail(`id ${id} matches ${hits.length} questions; give more of it`);
  return hits[0]!;
}

/** The link to write for `--by`: relative to the document, with the line as a fragment. */
function answerLink(by: string, q: Question, bundleRoot: string): { label: string; href: string } {
  const lineM = by.match(/(?::|#L)(\d+)$/);
  const bare = by.replace(/(?::|#L)\d+$/, '');
  const docDir = path.dirname(path.join(bundleRoot, q.file));
  const options = [bare, bare + '.md'];
  for (const o of options) {
    const found = resolveTarget(o, docDir, bundleRoot);
    if (found && found !== 'external') {
      const rel = path.relative(docDir, found).split(path.sep).join('/');
      const label = lineM ? `${path.basename(found)}:${lineM[1]}` : path.basename(found).replace(/\.md$/, '');
      return { label, href: rel + (lineM ? `#L${lineM[1]}` : '') };
    }
  }
  return fail(`${by} is not a concept in the bundle or a file in the project`);
}

function edit(bundleRoot: string, q: Question, change: (line: string) => string): void {
  const file = path.join(bundleRoot, q.file);
  const eol = fs.readFileSync(file, 'utf8').includes('\r\n') ? '\r\n' : '\n';
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const start = q.line - 1;
  let last = start;
  while (last + 1 < lines.length && /^\s{2,}\S/.test(lines[last + 1]!)) last++;
  lines[last] = change(lines[last]!);
  fs.writeFileSync(file, lines.join(eol));
}

function main(): number {
  const o = parseArgs(process.argv.slice(2));
  const bundleRoot = path.resolve(o.bundle);
  if (!fs.existsSync(bundleRoot) || !fs.statSync(bundleRoot).isDirectory()) fail(`no bundle at ${bundleRoot}`);
  const report = readQuestions(bundleRoot);

  if (o.command === 'answer' || o.command === 'reopen') {
    const q = find(report, o.id!);
    const file = path.join(bundleRoot, q.file);
    const source = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    let startLine = source[q.line - 1]!;
    if (o.command === 'answer') {
      if (q.answered) fail(`${q.id} is already answered${q.answer ? ' in ' + q.answer : ''}`);
      const { label, href } = answerLink(o.by!, q, bundleRoot);
      const date = new Date().toISOString().slice(0, 10);
      startLine = startLine.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)(?:\[[ xX]\]\s+)?/, '$1[x] ');
      source[q.line - 1] = startLine;
      fs.writeFileSync(file, source.join('\n'));
      edit(bundleRoot, q, (l) => `${l.replace(/\s+$/, '')} — answered in [${label}](${href}), ${date}`);
      console.log(`${q.id}  answered in ${href}  (${q.file}:${q.line})`);
    } else {
      if (!q.answered) fail(`${q.id} is already open`);
      source[q.line - 1] = startLine.replace(/\[[xX]\]/, '[ ]');
      fs.writeFileSync(file, source.join('\n'));
      edit(bundleRoot, q, (l) => l.replace(ANSWER_MARK_RE, ''));
      console.log(`${q.id}  reopened  (${q.file}:${q.line})`);
    }
    return 0;
  }

  const conceptHits = o.concept
    ? report.questions.filter((q) => q.concept === o.concept || q.concept.endsWith('/' + o.concept))
    : report.questions;
  const shown = conceptHits.filter((q) => o.status === 'all' || (o.status === 'answered') === q.answered);
  const problems = o.command === 'check' || !o.concept ? report.problems : report.problems.filter((p) => shown.some((q) => q.file === p.file));
  const errors = problems.filter((p) => p.level === 'error').length;
  const warnings = problems.length - errors;

  if (o.json) {
    console.log(JSON.stringify({ bundle: o.bundle, open: report.questions.filter((q) => !q.answered).length, answered: report.questions.filter((q) => q.answered).length, questions: o.command === 'check' ? [] : shown, problems }, null, 2));
  } else {
    if (o.command === 'list') {
      const byConcept = new Map<string, Question[]>();
      for (const q of shown) byConcept.set(q.concept, [...(byConcept.get(q.concept) ?? []), q]);
      for (const [concept, qs] of byConcept) {
        console.log(`\n${concept}`);
        for (const q of qs) console.log(`  ${q.id}  ${q.answered ? '[x]' : '[ ]'} ${q.text}  (line ${q.line}${q.answer ? ', answered in ' + q.answer : ''})`);
      }
      const open = report.questions.filter((q) => !q.answered).length;
      console.log(`\n${open} open, ${report.questions.length - open} answered, in ${new Set(report.questions.map((q) => q.concept)).size} concepts`);
    }
    for (const p of problems) console.log(`  ${p.level === 'error' ? '✗' : '!'} ${p.file}:${p.line}  ${p.message}`);
    if (o.command === 'check' && problems.length === 0) console.log('open questions: no problems');
  }
  return errors > 0 || (o.strict && warnings > 0) ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(main());
  } catch (e) {
    console.error('g2g-questions: ' + (e instanceof Error ? e.message : String(e)));
    process.exit(2);
  }
}
