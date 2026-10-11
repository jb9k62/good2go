// Running `claude` and reading what it printed. The parser follows the stream-json events
// observed from Claude Code 2.1.x (see stub/real-hooks-read.jsonl, a trimmed real transcript):
//
//   system/init           tools, mcp_servers, skills, slash_commands, plugins, claude_code_version
//   system/hook_started   hook_event, hook_name          (only with --include-hook-events for
//   system/hook_response  stdout (JSON string), output    every event but SessionStart)
//   assistant             message.content[]: thinking | text | tool_use {id, name, input}
//   user                  message.content[]: tool_result {tool_use_id, content: string | blocks[]}
//   result                subtype, is_error, num_turns, total_cost_usd, usage, result, duration_ms
//
// Metrics come only from this stream.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Arm, SplitPart, UpkeepSplit, Usage } from './types.mts';

/** The repository this file lives in (test/bench/lib/ is three levels down). */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const ALLOWED_TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash(node:*)', 'Bash(npm:*)', 'Bash(git:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(grep:*)', 'Bash(find:*)', 'Bash(head:*)', 'Bash(wc:*)', 'Bash(env:*)', 'Bash(tail:*)', 'Bash(sort:*)', 'Bash(diff:*)', 'Bash(echo:*)', 'Bash(pwd:*)', 'Bash(PARCEL_FAKE_CARRIERS=1:*)'];
export const DISALLOWED_TOOLS = ['WebFetch', 'WebSearch', 'Agent', 'Task'];

/**
 * The invocation, identical in every arm. Beyond the spec's list: `--setting-sources project` and
 * `--strict-mcp-config` (isolation), and `--include-hook-events`, without which the stream does not
 * show the PostToolUse and Stop hooks' output at all (observed): it only adds events, it changes
 * nothing the agent sees.
 */
export function buildArgs(prompt: string, model: string, perRunUsd: number): string[] {
  return [
    '-p', prompt,
    '--model', model,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-hook-events',
    '--no-session-persistence',
    '--max-budget-usd', String(perRunUsd),
    '--permission-mode', 'acceptEdits',
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--allowedTools', ...ALLOWED_TOOLS,
    '--disallowedTools', ...DISALLOWED_TOOLS,
  ];
}

/**
 * Variables a parent Claude Code session sets for its own children. When the runner is started
 * from inside a session they would reach the benchmarked `claude` (changing its effort, marking it
 * a child session, handing it the parent's messaging socket and token), so they are removed.
 * Authentication (ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_CONFIG_DIR) is kept.
 */
// `npm run bench` also sets npm_* (npm_package_json and the like), INIT_CWD and PWD to the
// repository's paths: an agent printing its environment would learn where the hidden tests live.
const PARENT_SESSION_ENV = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_PROJECT_DIR|CLAUDE_ENV_FILE|CLAUDE_CODE_(ENTRYPOINT|EXECPATH|SESSION_[A-Z_]*|CHILD_SESSION|MESSAGING_[A-Z_]*|SSE_PORT))$|^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|COMMON_DIR)$|^(npm_.*|INIT_CWD|PWD|OLDPWD)$/;

export const childEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!PARENT_SESSION_ENV.test(k)) env[k] = v;
  // npm puts the repository's node_modules/.bin (and its parents') on PATH; keep only entries outside it.
  if (env.PATH) env.PATH = env.PATH.split(path.delimiter).filter((p) => p !== '' && !(path.resolve(p) + path.sep).startsWith(REPO + path.sep)).join(path.delimiter);
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
  return env;
};

/** Process groups of the `claude` runs still alive, so an interrupted runner can stop them (and their spending). */
const live = new Set<number>();
const killGroup = (pid: number): void => {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // already gone
  }
};
let handlersInstalled = false;
function installSignalHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;
  process.on('exit', () => {
    for (const pid of live) killGroup(pid);
  });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(sig, () => {
      for (const pid of live) killGroup(pid);
      process.exit(130);
    });
  }
}

export interface Spawned {
  stdout: string;
  stderr: string;
  /** null when the process was killed (timeout or signal). */
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

/** A script (`.mjs`, `.js`, `.mts`) is run with this node; anything else is run as a program. */
function command(bin: string, args: string[]): [string, string[]] {
  return /\.(mjs|cjs|js|mts)$/.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args];
}

export function spawnClaude(bin: string, args: string[], cwd: string, timeoutMs: number, env: NodeJS.ProcessEnv = childEnv()): Promise<Spawned> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const [cmd, argv] = command(bin, args);
    // Its own process group, so a timeout also kills what it started (tool commands, hooks) and
    // nothing is left running in, or holding the pipes of, a working copy about to be removed.
    installSignalHandlers();
    const child = spawn(cmd, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const pid = child.pid;
    if (pid !== undefined) live.add(pid);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      if (pid !== undefined) killGroup(pid);
      else child.kill('SIGKILL');
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      if (pid !== undefined) live.delete(pid);
      reject(e);
    });
    child.on('exit', () => {
      // Anything the run left behind in its group goes with it.
      if (pid !== undefined) killGroup(pid);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (pid !== undefined) live.delete(pid);
      resolve({ stdout, stderr, exitCode: code, durationMs: Date.now() - started, timedOut });
    });
  });
}

/** `claude --version` prints `2.1.296 (Claude Code)`; null when it cannot be run. */
export async function claudeVersion(bin: string): Promise<string | null> {
  try {
    const r = await spawnClaude(bin, ['--version'], process.cwd(), 30_000);
    if (r.exitCode !== 0) return null;
    return r.stdout.trim().split(/\s+/)[0] || null;
  } catch {
    return null;
  }
}

// ---- reading the stream -----------------------------------------------------------------------

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function parseLines(text: string): Json[] {
  const events: Json[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const v: unknown = JSON.parse(t);
      if (isRecord(v)) events.push(v);
    } catch {
      // a truncated last line from a killed process
    }
  }
  return events;
}

export interface StreamMetrics {
  hasResult: boolean;
  subtype: string;
  isError: boolean;
  budgetExceeded: boolean;
  resultText: string;
  numTurns: number;
  costUsd: number;
  usage: Usage;
  toolCalls: { total: number; byName: Record<string, number> };
  callsBeforeTarget: number | null;
  hookInjections: number;
  hookChars: number;
  /** The system/init event, if one arrived. */
  init: Json | null;
  /** Turns, calls and money by class of work; see `splitEvents`. */
  split: UpkeepSplit;
  /** Tool calls Claude Code refused (`permission_denials` in the result event), as `Tool: input`. */
  permissionDenials: string[];
}

const EDUKAI_LINE = /^[ \t]*edukai:/m;

/** The text a hook put in front of the agent, from a hook_response event. */
export function hookText(e: Json): string {
  const raw = typeof e.stdout === 'string' && e.stdout !== '' ? e.stdout : typeof e.output === 'string' ? e.output : '';
  if (raw.trim() === '') return '';
  try {
    const v: unknown = JSON.parse(raw);
    if (isRecord(v)) {
      const parts: string[] = [];
      const hso = v.hookSpecificOutput;
      if (isRecord(hso) && typeof hso.additionalContext === 'string') parts.push(hso.additionalContext);
      for (const k of ['additionalContext', 'reason', 'systemMessage']) if (typeof v[k] === 'string') parts.push(v[k] as string);
      if (parts.length) return parts.join('\n');
    }
  } catch {
    // plain text from the hook
  }
  return raw;
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b) => (isRecord(b) && typeof b.text === 'string' ? b.text : '')).join('\n');
  return '';
}

const norm = (p: string): string => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

/** A path value as the agent wrote it, relative to the workdir when it points inside it. */
function rel(value: string, workdir: string): string {
  const v = norm(value);
  const w = norm(workdir);
  return v.startsWith(w + '/') ? v.slice(w.length + 1) : v;
}

/**
 * Does this call read, edit or search a target? Read, Edit, Write and NotebookEdit name the file;
 * Grep and Glob touch it when their `path` is it or a folder holding it (not the project root),
 * or their glob or Glob pattern names it (path or file name); Bash touches it when the command
 * text names its path or file name. A Grep content pattern is what to look for, not where, so it
 * does not count.
 */
export function touchesTarget(name: string, input: Json, targets: string[], workdir: string): boolean {
  if (targets.length === 0) return false;
  const str = (k: string): string => (typeof input[k] === 'string' ? (input[k] as string) : '');
  const names = (text: string): boolean => targets.some((t) => text.includes(t) || (t.split('/').pop() ?? '').length >= 3 && text.includes(t.split('/').pop()!));
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit': {
      const p = rel(str('file_path') || str('notebook_path'), workdir);
      return p !== '' && targets.some((t) => norm(t) === p);
    }
    case 'Grep':
    case 'Glob': {
      const p = rel(str('path'), workdir);
      if (p !== '' && p !== '.' && targets.some((t) => norm(t) === p || norm(t).startsWith(p + '/'))) return true;
      return names(str('glob')) || (name === 'Glob' && names(str('pattern')));
    }
    case 'Bash':
      return names(str('command'));
    default:
      return false;
  }
}

export function parseStream(text: string, opts: { targets?: string[]; workdir?: string } = {}): StreamMetrics {
  const targets = (opts.targets ?? []).map(norm);
  const workdir = opts.workdir ?? '';
  const events = parseLines(text);
  const m: StreamMetrics = {
    hasResult: false,
    subtype: 'no_result',
    isError: true,
    budgetExceeded: false,
    resultText: '',
    numTurns: 0,
    costUsd: 0,
    usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    toolCalls: { total: 0, byName: {} },
    callsBeforeTarget: null,
    hookInjections: 0,
    hookChars: 0,
    init: null,
    split: { task: emptyPart(), use: emptyPart(), upkeep: emptyPart(), method: SPLIT_METHOD }, // replaced below, once the totals are known
    permissionDenials: [],
  };
  const seenTools = new Set<string>();
  const messageIds = new Set<string>();
  const hookTexts: string[] = [];
  const toolResults: string[] = [];

  for (const e of events) {
    if (e.type === 'system' && e.subtype === 'init' && m.init === null) m.init = e;
    else if (e.type === 'system' && e.subtype === 'hook_response') {
      const t = hookText(e);
      if (EDUKAI_LINE.test(t)) {
        m.hookInjections++;
        m.hookChars += t.length;
        hookTexts.push(t);
      }
    } else if (e.type === 'assistant' && isRecord(e.message)) {
      if (typeof e.message.id === 'string') messageIds.add(e.message.id);
      const content = Array.isArray(e.message.content) ? e.message.content : [];
      for (const b of content) {
        if (!isRecord(b) || b.type !== 'tool_use' || typeof b.name !== 'string') continue;
        const id = typeof b.id === 'string' ? b.id : '';
        if (id !== '') {
          if (seenTools.has(id)) continue;
          seenTools.add(id);
        }
        const input = isRecord(b.input) ? b.input : {};
        if (m.callsBeforeTarget === null && touchesTarget(b.name, input, targets, workdir)) m.callsBeforeTarget = m.toolCalls.total;
        m.toolCalls.total++;
        m.toolCalls.byName[b.name] = (m.toolCalls.byName[b.name] ?? 0) + 1;
      }
    } else if (e.type === 'user' && isRecord(e.message) && Array.isArray(e.message.content)) {
      for (const b of e.message.content) if (isRecord(b) && b.type === 'tool_result') toolResults.push(toolResultText(b.content));
    } else if (e.type === 'result') {
      m.hasResult = true;
      m.subtype = typeof e.subtype === 'string' ? e.subtype : 'unknown';
      m.isError = e.is_error === true || m.subtype !== 'success';
      m.resultText = typeof e.result === 'string' ? e.result : '';
      m.numTurns = num(e.num_turns);
      m.costUsd = num(e.total_cost_usd);
      const u = isRecord(e.usage) ? e.usage : {};
      m.usage = { input: num(u.input_tokens), output: num(u.output_tokens), cacheRead: num(u.cache_read_input_tokens), cacheCreation: num(u.cache_creation_input_tokens) };
      m.budgetExceeded = /budget/i.test(m.subtype);
      const denials = Array.isArray(e.permission_denials) ? e.permission_denials : [];
      m.permissionDenials = denials.map((d) => {
        if (!isRecord(d)) return String(d);
        const input = isRecord(d.tool_input) ? d.tool_input : {};
        const what = typeof input.command === 'string' ? input.command : typeof input.file_path === 'string' ? input.file_path : JSON.stringify(input);
        return `${String(d.tool_name ?? 'tool')}: ${what.slice(0, 200)}`;
      });
    }
  }
  if (!m.hasResult) m.numTurns = messageIds.size;
  m.split = splitEvents(events, { costUsd: m.costUsd, outputTokens: m.usage.output });

  // `edukai:` lines that reached the agent inside a tool result (not already counted from a hook).
  for (const t of toolResults) {
    const lines = t.split('\n').filter((l) => /^[ \t]*edukai:/.test(l));
    const fresh = lines.filter((l) => !hookTexts.some((h) => h.includes(l.trim())));
    if (fresh.length === 0) continue;
    m.hookInjections++;
    m.hookChars += fresh.join('\n').length;
  }
  return m;
}

/**
 * Names of the user's own skills, commands and agents (`~/.claude/{skills,commands,agents}`, or
 * under CLAUDE_CONFIG_DIR): any of them in a run's init event means user settings leaked in.
 */
export function userLevelNames(configDir: string = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')): string[] {
  const names: string[] = [];
  for (const sub of ['skills', 'commands', 'agents']) {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(path.join(configDir, sub), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) names.push(e.name.replace(/\.md$/, ''));
  }
  return names;
}

/** Skills each arm legitimately has at project scope: B and C carry the edukai skill (see arms.mts). */
export const expectedProjectSkills = (arm?: Arm): readonly string[] => (arm === 'B' || arm === 'C' ? ['edukai'] : []);

/**
 * Project skills an arm should have that its init event does not list: the install did not take,
 * and the arm would measure a broken setup (as the pilot did, whose `Skill edukai` calls failed).
 */
export function missingProjectSkills(init: Json | null, arm?: Arm): string[] {
  if (init === null) return [];
  const listed = new Set((Array.isArray(init.skills) ? init.skills : []).map((e) => (isRecord(e) ? String(e.name ?? '') : String(e))));
  return expectedProjectSkills(arm).filter((s) => !listed.has(s));
}

/**
 * Anything in the init event that should not be there in an isolated run. Empty when clean.
 *
 * Skills: the init event lists them by name only (strings), so a project skill cannot be told from
 * a user skill of the same name by the event alone. The rule is therefore per arm: the names an
 * arm is expected to have at project scope (`edukai` in B and C, none in A) are allowed; `edukai`
 * and `good2go` anywhere else, and every user-level skill, command or agent name (read from the
 * user's `~/.claude`), are leaks. This is sound because `--setting-sources project` keeps user
 * skills out (confirmed from real init events), so a name that is expected at project scope can
 * only come from the workdir. When an entry is an object that carries a `path`, `source` or
 * `location`, that is used as well: an expected name whose path is outside the workdir (when
 * `workdir` is given) or inside the user's config folder is a leak.
 */
export function isolationLeaks(init: Json | null, userNames: readonly string[] = userLevelNames(), arm?: Arm, workdir?: string): string[] {
  if (init === null) return [];
  const leaks: string[] = [];
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  if (list(init.mcp_servers).length > 0) leaks.push('MCP servers: ' + JSON.stringify(init.mcp_servers));
  const entries = [...list(init.skills), ...list(init.slash_commands), ...list(init.agents)];
  const nameOf = (e: unknown): string => (isRecord(e) ? String(e.name ?? '') : String(e));
  const names = new Set(entries.map(nameOf));
  const allowed = new Set(expectedProjectSkills(arm));
  for (const bad of new Set(['edukai', 'good2go', ...userNames])) {
    if (names.has(bad) && !allowed.has(bad)) leaks.push(`user skill, command or agent ${bad}`);
  }
  const configDir = norm(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'));
  for (const e of entries) {
    if (!isRecord(e) || !allowed.has(nameOf(e))) continue;
    const where = [e.path, e.source, e.location].find((v): v is string => typeof v === 'string' && v.includes('/'));
    if (where === undefined) continue;
    const w = norm(where);
    if (w.startsWith(configDir + '/') || (workdir !== undefined && !w.startsWith(norm(workdir) + '/'))) leaks.push(`user skill, command or agent ${nameOf(e)} (from ${where}, not the project)`);
  }
  for (const p of list(init.plugins)) {
    const source = isRecord(p) ? String(p.source ?? '') : String(p);
    if (!source.endsWith('@builtin')) leaks.push(`plugin ${source}`);
  }
  return leaks;
}

// ---- memory upkeep split ----------------------------------------------------------------------
// Where a run's turns, tool calls and money went: task work, memory use, or memory upkeep. Pure
// functions over parsed stream events, so a stored transcript can be re-analysed without a model.

export const SPLIT_METHOD =
  'upkeep-split-v2 (a message is split by its calls, each call weighing one and spread over the parts of a mixed Bash command, a text-only message is task; ' +
  'output tokens are the result event\'s total shared by content length; cost by weighted-token share, input 1, output 5, cache read 0.05, cache creation 1.25 (5 minutes) or 2 (one hour), ' +
  'ratios of Sonnet 5.5 prices ($2, $10, $0.10, $2.50, $4 per million) fitted to the pilot bills)';

export type WorkClass = 'task' | 'use' | 'upkeep';

const IN_EDUKAI = /(?:^|[\s'"=(/])edukai(?:\/|$|\s)/;
const UPKEEP_COMMAND = /\bedukai:(?:recheck|index|validate|new|verify|supersede)\b|\bgood2go(?:\.mjs)?\s+edukai\b|\bg2g-edukai\b/;
const WRITES = /\bsed\b[^|;&]*?\s-[A-Za-z]*i\b|\btee\b|\b(?:mv|cp|rm|touch|mkdir|ln|install)\b|(?:^|[^0-9&>])>{1,2}(?!&)\s*\S/;
/** A command after a pipe that only reads what the previous one printed: it belongs to that part. */
const PIPE_FILTER = /^\s*(?:head|tail|wc|sort|uniq|grep|egrep|cut|tr|awk|column|cat)\b(?![^|]*\bedukai\b)/;
/** Segments that run nothing worth a part. */
const NO_OP = /^\s*(?:cd\b[^|]*|export\b.*|set\b.*|true|:|)\s*$/;

const RANK: Record<WorkClass, number> = { task: 0, use: 1, upkeep: 2 };
const strongest = (cs: WorkClass[]): WorkClass => cs.reduce<WorkClass>((a, c) => (RANK[c] > RANK[a] ? c : a), 'task');

/** A command cut at `;`, `&&`, `||`, `|` and newlines outside quotes: each segment with the operator before it. */
function splitSegments(command: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let quote = '';
  let cur = '';
  let sep = '';
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote !== '') {
      cur += ch;
      if (ch === quote) quote = '';
      else if (ch === '\\' && quote === '"' && i + 1 < command.length) cur += command[++i]!;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ';' || ch === '\n' || ch === '|' || (ch === '&' && command[i + 1] === '&')) {
      const double = (ch === '|' || ch === '&') && command[i + 1] === ch;
      out.push([cur, sep]);
      cur = '';
      sep = double ? ch + ch : ch;
      if (double) i++;
    } else cur += ch;
  }
  out.push([cur, sep]);
  return out;
}

/**
 * The parts of a Bash command, each with its class. Heredoc bodies are file contents, not
 * commands, so only the line that opens one counts (`cat <<EOF > edukai/x.md` keeps its target).
 * The command is split at `;`, `&&`, `||`, `|` and newlines; a filter after a pipe (`| tail -8`)
 * joins the part before it, and `cd`/`export` lines run nothing, so they make no part. A part is
 * upkeep if it runs an upkeep command or writes inside `edukai/`, use if it reads there or runs
 * another `edukai:` script, else task. A command with no parts is one task part.
 */
export function bashParts(raw: string): WorkClass[] {
  const command = raw.replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n\s*\2(?=\n|$)/g, ' $3');
  const parts: WorkClass[] = [];
  let inside = false; // after `cd edukai/...`, later segments run in the bundle
  let afterPipe = false;
  for (const [seg, sep] of splitSegments(command)) {
    afterPipe = sep === '|';
    const about = inside || IN_EDUKAI.test(seg);
    if (/^\s*cd\s/.test(seg)) inside = IN_EDUKAI.test(seg);
    if (NO_OP.test(seg)) continue;
    let cls: WorkClass = 'task';
    if (UPKEEP_COMMAND.test(seg)) cls = 'upkeep';
    else if (about) cls = WRITES.test(seg) ? 'upkeep' : 'use';
    else if (/\bedukai:[a-z]+\b/.test(seg)) cls = 'use';
    if (afterPipe && parts.length > 0 && PIPE_FILTER.test(seg) && cls === 'task') continue; // joins the previous part
    parts.push(cls);
  }
  return parts.length > 0 ? parts : ['task'];
}

/** The parts of one tool call, from its name and input; every call but a mixed Bash command is one part. */
export function callParts(name: string, input: Json): WorkClass[] {
  const str = (k: string): string => (typeof input[k] === 'string' ? (input[k] as string) : '');
  const inBundle = (p: string): boolean => /(?:^|\/)edukai(?:\/|$)/.test(norm(p));
  switch (name) {
    case 'Skill':
      return [/^(?:[\w-]+:)?edukai$/.test(str('skill')) ? 'upkeep' : 'task'];
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return [inBundle(str('file_path') || str('notebook_path')) ? 'upkeep' : 'task'];
    case 'Read':
      return [inBundle(str('file_path')) ? 'use' : 'task'];
    case 'Grep':
    case 'Glob':
      // A Grep `pattern` is what to look for, not where; a Glob `pattern` is a location.
      return [[str('path'), str('glob'), ...(name === 'Glob' ? [str('pattern')] : [])].some(inBundle) ? 'use' : 'task'];
    case 'Bash':
      return bashParts(str('command'));
    default:
      return ['task'];
  }
}

/** The class of one tool call as a whole: its strongest part (upkeep, then use, then task). */
export function classifyCall(name: string, input: Json): WorkClass {
  return strongest(callParts(name, input));
}

const emptyPart = (): SplitPart => ({ turns: 0, toolCalls: 0, outputTokens: 0, estCostUsd: 0 });
const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const CLASSES: WorkClass[] = ['task', 'use', 'upkeep'];
const zeros = (): Record<WorkClass, number> => ({ task: 0, use: 0, upkeep: 0 });

/** Price ratios (per input token = 1): output 5, cache read 0.05, cache creation 1.25 (5 minutes) or 2 (one hour). */
interface InputSide {
  input: number;
  cacheRead: number;
  cacheCreation: number;
  /** The usage.cache_creation breakdown, when the stream carries it. */
  cc5m: number | null;
  cc1h: number | null;
}
const inputWeight = (u: InputSide): number => {
  const creation = u.cc5m !== null && u.cc1h !== null ? 1.25 * u.cc5m + 2 * u.cc1h + 2 * Math.max(0, u.cacheCreation - u.cc5m - u.cc1h) : 2 * u.cacheCreation;
  return u.input + 0.05 * u.cacheRead + creation;
};
const OUTPUT_WEIGHT = 5;

/**
 * Split a run. `events` are the parsed stream events (`parseLines`); `totals` are the result
 * event's cost and output tokens, which the parts are shares of.
 *
 * - A message (assistant message id; the stream repeats it once per content block) is split by its
 *   calls: every call weighs one, spread equally over the parts of a mixed Bash command
 *   (`sed ... && npm run edukai:recheck` is half task, half upkeep). The message's turn, its
 *   input-side tokens and its text and thinking are shared out by those weights; a message with
 *   no call is task. A call counts one in total, so a mixed command adds its share (a half each for
 *   two parts) to each class and the classes sum to the run's tool calls.
 * - Output tokens: the stream's per-message `output_tokens` is an early snapshot (the message was
 *   still streaming), so only the run's real total is used, shared by content length: the
 *   characters of text, thinking and tool_use input JSON of each class's blocks.
 * - Cost: each message's weight is its input side (input 1, cache read 0.05, cache creation 1.25 for
 *   5 minutes or 2 for an hour; 2 when the breakdown is absent) plus 5 per output token (its
 *   share of the total by content length), shared by its call weights; the run's cost is shared by
 *   class weight. These are the ratios of Sonnet 5.5's prices fitted to the pilot's bills, an
 *   estimate: the sum of the three parts is exactly `costUsd`.
 * Hook output is not split: it reaches the agent as input to the next turn, inside that turn.
 */
export function splitEvents(events: Json[], totals: { costUsd: number; outputTokens: number }): UpkeepSplit {
  interface Msg {
    side: InputSide;
    snapshotOutput: number;
    /** [call chars, per-part class] for each call, and chars of text and thinking. */
    calls: Array<{ chars: number; parts: WorkClass[] }>;
    proseChars: number;
  }
  const messages = new Map<string, Msg>();
  const seenCalls = new Set<string>();
  const seenProse = new Set<string>();
  let anonymous = 0;
  for (const e of events) {
    if (e.type !== 'assistant' || !isRecord(e.message)) continue;
    const key = typeof e.message.id === 'string' ? e.message.id : `anonymous-${anonymous++}`;
    let msg = messages.get(key);
    if (!msg) messages.set(key, (msg = { side: { input: 0, cacheRead: 0, cacheCreation: 0, cc5m: null, cc1h: null }, snapshotOutput: 0, calls: [], proseChars: 0 }));
    const u = isRecord(e.message.usage) ? e.message.usage : {};
    const cc = isRecord(u.cache_creation) ? u.cache_creation : null;
    msg.side = {
      input: Math.max(msg.side.input, num(u.input_tokens)),
      cacheRead: Math.max(msg.side.cacheRead, num(u.cache_read_input_tokens)),
      cacheCreation: Math.max(msg.side.cacheCreation, num(u.cache_creation_input_tokens)),
      cc5m: cc ? Math.max(msg.side.cc5m ?? 0, num(cc.ephemeral_5m_input_tokens)) : msg.side.cc5m,
      cc1h: cc ? Math.max(msg.side.cc1h ?? 0, num(cc.ephemeral_1h_input_tokens)) : msg.side.cc1h,
    };
    msg.snapshotOutput = Math.max(msg.snapshotOutput, num(u.output_tokens));
    for (const b of Array.isArray(e.message.content) ? e.message.content : []) {
      if (!isRecord(b)) continue;
      if (b.type === 'text' || b.type === 'thinking') {
        const text = typeof b.text === 'string' ? b.text : typeof b.thinking === 'string' ? b.thinking : '';
        const k = `${key}|${b.type}|${text}`;
        if (seenProse.has(k)) continue;
        seenProse.add(k);
        msg.proseChars += text.length;
        continue;
      }
      if (b.type !== 'tool_use' || typeof b.name !== 'string') continue;
      const id = typeof b.id === 'string' ? b.id : '';
      if (id !== '') {
        if (seenCalls.has(id)) continue;
        seenCalls.add(id);
      }
      const input = isRecord(b.input) ? b.input : {};
      msg.calls.push({ chars: JSON.stringify(input).length, parts: callParts(b.name, input) });
    }
  }

  const parts: Record<WorkClass, SplitPart> = { task: emptyPart(), use: emptyPart(), upkeep: emptyPart() };
  // Each message's shares of one unit, by class: calls weigh one, spread over their parts.
  const sharesOf = (m: Msg): Record<WorkClass, number> => {
    const f = zeros();
    if (m.calls.length === 0) f.task = 1;
    for (const c of m.calls) for (const p of c.parts) f[p] += 1 / c.parts.length / m.calls.length;
    return f;
  };
  const msgChars = (m: Msg): number => m.proseChars + m.calls.reduce((n, c) => n + c.chars, 0);
  const charsTotal = [...messages.values()].reduce((n, m) => n + msgChars(m), 0);
  const snapshotTotal = [...messages.values()].reduce((n, m) => n + m.snapshotOutput, 0);
  const outputTotal = totals.outputTokens > 0 ? totals.outputTokens : snapshotTotal;

  const w = zeros();
  const chars = zeros();
  for (const m of messages.values()) {
    const f = sharesOf(m);
    const outTokens = charsTotal > 0 ? (outputTotal * msgChars(m)) / charsTotal : 0;
    const weight = inputWeight(m.side) + OUTPUT_WEIGHT * outTokens;
    for (const c of CLASSES) {
      parts[c].turns += f[c];
      w[c] += weight * f[c];
      chars[c] += m.proseChars * f[c];
    }
    for (const c of m.calls) {
      for (const p of c.parts) {
        parts[p].toolCalls += 1 / c.parts.length;
        chars[p] += c.chars / c.parts.length;
      }
    }
  }
  const wTotal = w.task + w.use + w.upkeep;
  for (const cls of ['use', 'upkeep'] as const) {
    parts[cls].estCostUsd = wTotal > 0 ? r6((totals.costUsd * w[cls]) / wTotal) : 0;
    parts[cls].outputTokens = charsTotal > 0 ? Math.round((outputTotal * chars[cls]) / charsTotal) : 0;
    parts[cls].turns = r6(parts[cls].turns);
    parts[cls].toolCalls = r6(parts[cls].toolCalls);
  }
  // The remainder goes to task work, so the three always sum to the run's cost and output.
  parts.task.estCostUsd = r6(totals.costUsd - parts.use.estCostUsd - parts.upkeep.estCostUsd);
  parts.task.outputTokens = Math.max(0, (charsTotal > 0 ? outputTotal : 0) - parts.use.outputTokens - parts.upkeep.outputTokens);
  parts.task.turns = r6(parts.task.turns);
  parts.task.toolCalls = r6(parts.task.toolCalls);
  return { ...parts, method: SPLIT_METHOD };
}

/** The split of a stored transcript, using the cost and output tokens its `result` event reports. */
export function splitTranscript(text: string): UpkeepSplit {
  const events = parseLines(text);
  const result = events.find((e) => e.type === 'result');
  const u = result && isRecord(result.usage) ? result.usage : {};
  return splitEvents(events, { costUsd: result ? num(result.total_cost_usd) : 0, outputTokens: num(u.output_tokens) });
}
