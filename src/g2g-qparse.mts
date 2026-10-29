/**
 * Reading open questions out of a document: pure parsing, no file access. Shared by
 * g2g-questions.mts (the command) and g2g-hook.mts (the session brief), so it follows the
 * hook's rule: it imports only `node:` built-ins and ./g2g-rank.mts, never g2g-core.mts or `yaml`.
 * The convention is described in g2g-questions.mts.
 */
import crypto from 'node:crypto';
import { HEADING_RE, stripCode } from './g2g-rank.mts';

/** The document's body (after any frontmatter), or null when the frontmatter never ends. */
function bodyOf(text: string): string | null {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return text;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) return null;
  const body = lines.slice(end + 1).join('\n');
  return body.startsWith('\n') ? body.slice(1) : body;
}

export interface Question {
  id: string;
  concept: string;
  file: string; // bundle-relative, with .md
  line: number; // 1-based, in the file
  section: string; // the heading as written
  text: string; // the question, without checkbox or answer
  answered: boolean;
  checkbox: boolean;
  answer: string | null; // the link target of the answer
}

export interface QuestionProblem {
  level: 'error' | 'warning';
  file: string;
  line: number;
  message: string;
}

const SECTION_RE = /^open questions?:?$/i;
const ITEM_RE = /^( {0,3})([-*+]|\d{1,9}[.)])\s+(.*)$/;
const BOX_RE = /^\[([ xX])\]\s+/;
export const ANSWER_MARK_RE = /\s+—\s+answered\b.*$/i;
const LINK_RE = /\]\(([^)\s]+)\)/;

/** The start of an item's answer, or the whole text. */
export const questionText = (item: string): string => item.replace(ANSWER_MARK_RE, '').trim();

/** A short stable handle: the concept and the normalised question text. */
export function questionId(concept: string, text: string): string {
  const norm = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(concept + '\n' + norm).digest('hex').slice(0, 6);
}

/** Questions and problems in one document (the problems still lack a link check). */
export function parseQuestions(file: string, text: string): { questions: Question[]; problems: QuestionProblem[] } {
  const questions: Question[] = [];
  const problems: QuestionProblem[] = [];
  const body = bodyOf(text);
  if (body === null) return { questions, problems };
  const concept = file.replace(/\.md$/, '');
  const all = text.replace(/^﻿/, '').split(/\r?\n/);
  const lines = stripCode(body, false).split(/\r?\n/);
  const offset = all.length - body.split(/\r?\n/).length;
  const bodyRaw = body.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const h = lines[i]!.match(HEADING_RE);
    if (!h || !SECTION_RE.test(h[2]!.trim())) continue;
    const level = h[1]!.length;
    const heading = h[2]!.trim();
    if (!/^open questions:?$/i.test(heading)) {
      problems.push({ level: 'warning', file, line: offset + i + 1, message: `"${heading}" is read as "Open Questions"; use the plural heading` });
    }
    let end = i + 1;
    while (end < lines.length) {
      const n = lines[end]!.match(HEADING_RE);
      if (n && n[1]!.length <= level) break;
      end++;
    }
    const before = questions.length;
    for (let j = i + 1; j < end; j++) {
      const m = lines[j]!.match(ITEM_RE);
      if (!m) continue;
      // Indented lines and blank lines inside the item belong to it.
      let last = j;
      while (last + 1 < end && (/^\s{2,}\S/.test(lines[last + 1]!) || (lines[last + 1]!.trim() === '' && /^\s{2,}\S/.test(lines[last + 2] ?? '')))) last++;
      let item = bodyRaw[j]!.replace(ITEM_RE, '$3');
      for (let k = j + 1; k <= last; k++) item += ' ' + bodyRaw[k]!.trim();
      item = item.trim();
      const box = item.match(BOX_RE);
      const rest = box ? item.slice(box[0].length) : item;
      const q = questionText(rest);
      if (q === '') continue;
      const link = rest.match(LINK_RE);
      questions.push({
        id: questionId(concept, q),
        concept,
        file,
        line: offset + j + 1,
        section: heading,
        text: q,
        answered: box ? box[1] !== ' ' : false,
        checkbox: box !== null,
        answer: ANSWER_MARK_RE.test(rest) ? (rest.match(ANSWER_MARK_RE)![0].match(LINK_RE)?.[1] ?? null) : (link?.[1] ?? null),
      });
      j = last;
    }
    if (questions.length === before) {
      problems.push({ level: 'warning', file, line: offset + i + 1, message: `"${heading}" has no questions (delete the heading, or list them as - [ ] items)` });
    }
  }
  for (const q of questions) {
    if (!q.checkbox) {
      problems.push({ level: 'warning', file, line: q.line, message: `"${q.text.slice(0, 50)}" has no checkbox; counted as open (write - [ ] to make it explicit)` });
    }
  }
  const seen = new Map<string, Question>();
  for (const q of questions) {
    const first = seen.get(q.id);
    if (first) problems.push({ level: 'error', file, line: q.line, message: `repeats the question at line ${first.line}; two questions in one concept need different text` });
    else seen.set(q.id, q);
  }
  return { questions, problems };
}

