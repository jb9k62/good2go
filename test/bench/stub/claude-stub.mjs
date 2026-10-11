#!/usr/bin/env node
// A fake `claude` for the runner's tests: it takes the real flags, checks the isolation ones are
// there, and prints a canned stream-json transcript shaped like the real one (see
// real-hooks-read.jsonl). No network, no model. It can edit files in its cwd.
//
// Environment (all optional):
//   BENCH_STUB_SCENARIO  ok (default) | edit | budget | noresult | crash | leak | skillleak | hang
//                        (skillleak: a user-level `good2go` skill shows up in the init event)
//   BENCH_STUB_COST      total_cost_usd of the result (default 0.02)
//   BENCH_STUB_READ      file the canned Read call reads (default AGENTS.md)
//   BENCH_STUB_WRITE     "path=text": the `edit` scenario writes it into the cwd
//   BENCH_STUB_ANSWER    the result text (default "done")
//   BENCH_STUB_LOG       append one JSON line per call: {argv, cwd, env, files} (for tests)
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
if (argv[0] === '--version') {
  console.log('9.9.9 (Claude Code stub)');
  process.exit(0);
}

const flag = (name) => {
  const i = argv.indexOf(name);
  return i < 0 ? null : (argv[i + 1] ?? null);
};
const has = (name) => argv.includes(name);
const scenario = process.env.BENCH_STUB_SCENARIO || 'ok';
const cost = Number(process.env.BENCH_STUB_COST ?? '0.02');
const cwd = process.cwd();

if (process.env.BENCH_STUB_LOG) {
  fs.appendFileSync(
    process.env.BENCH_STUB_LOG,
    JSON.stringify({ argv, cwd, autoMemoryOff: process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, hooks: fs.existsSync(path.join(cwd, '.claude', 'settings.json')) }) + '\n',
  );
}

// The invocation the spec fixes, and nothing the isolation depends on missing.
const problems = [];
if (argv[0] !== '-p' || !argv[1]) problems.push('-p <prompt> first');
if (flag('--output-format') !== 'stream-json') problems.push('--output-format stream-json');
for (const f of ['--verbose', '--include-hook-events', '--no-session-persistence', '--strict-mcp-config', '--allowedTools', '--disallowedTools']) if (!has(f)) problems.push(f);
if (flag('--permission-mode') !== 'acceptEdits') problems.push('--permission-mode acceptEdits');
if (flag('--setting-sources') !== 'project') problems.push('--setting-sources project');
if (!flag('--model')) problems.push('--model');
if (!(Number(flag('--max-budget-usd')) > 0)) problems.push('--max-budget-usd');
if (process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY !== '1') problems.push('CLAUDE_CODE_DISABLE_AUTO_MEMORY=1');
if (problems.length) {
  console.error('claude-stub: bad invocation, missing: ' + problems.join(', '));
  process.exit(64);
}

const session = 'stub-session';
let n = 0;
const emit = (e) => console.log(JSON.stringify({ ...e, session_id: session, uuid: `stub-${n++}` }));
const model = flag('--model');
const hooksOn = fs.existsSync(path.join(cwd, '.claude', 'settings.json'));

const hook = (event, name, text) => {
  emit({ type: 'system', subtype: 'hook_started', hook_id: `h${n}`, hook_name: name, hook_event: event });
  const stdout = text === '' ? '' : JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }) + '\n';
  emit({ type: 'system', subtype: 'hook_response', hook_id: `h${n}`, hook_name: name, hook_event: event, output: stdout, stdout, stderr: '', exit_code: 0, outcome: 'success' });
};
const assistant = (id, content) =>
  emit({ type: 'assistant', message: { model, id, type: 'message', role: 'assistant', content, usage: { input_tokens: 2, output_tokens: 2 } }, parent_tool_use_id: null });
const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input, caller: { type: 'direct' } });
const toolResult = (id, text) =>
  emit({ type: 'user', message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content: text }] }, parent_tool_use_id: null });

// Project skills the way the real init event lists them: by name, from <cwd>/.claude/skills.
const projectSkills = fs.existsSync(path.join(cwd, '.claude', 'skills')) ? fs.readdirSync(path.join(cwd, '.claude', 'skills')) : [];
const extraSkills = scenario === 'skillleak' ? ['good2go'] : [];

if (hooksOn) hook('SessionStart', 'SessionStart:startup', 'edukai: this project keeps agent memory in edukai/ (8 lessons, 2 domains).\n- codebase-parcels (5): overview');
emit({
  type: 'system',
  subtype: 'init',
  cwd,
  tools: ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'],
  mcp_servers: scenario === 'leak' ? [{ name: 'user-server', status: 'connected' }] : [],
  model,
  permissionMode: 'acceptEdits',
  slash_commands: ['code-review', 'simplify', ...projectSkills, ...extraSkills],
  claude_code_version: '9.9.9',
  skills: ['code-review', 'simplify', ...projectSkills, ...extraSkills],
  plugins: [{ name: 'cc-plugin-agents-md', path: 'builtin', source: 'cc-plugin-agents-md@builtin' }],
});

if (scenario === 'hang') setTimeout(() => {}, 600_000);
else {
  const target = process.env.BENCH_STUB_READ || 'AGENTS.md';
  const abs = path.join(cwd, target);
  assistant('msg_1', [toolUse('toolu_1', 'Read', { file_path: abs })]);
  let body = '';
  try {
    body = fs.readFileSync(abs, 'utf8');
  } catch {
    body = '(unreadable)';
  }
  toolResult('toolu_1', body.slice(0, 400));
  if (hooksOn) hook('PostToolUse', 'PostToolUse:Read', `edukai: 1 lesson cites ${target}\n- [tested] a lesson (edukai/x/lessons/y.md)`);

  if (scenario === 'edit') {
    const [file, text] = (process.env.BENCH_STUB_WRITE || 'stub-output.txt=changed').split(/=(.*)/s);
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), text + '\n');
    assistant('msg_2', [toolUse('toolu_2', 'Write', { file_path: path.join(cwd, file), content: text + '\n' })]);
    toolResult('toolu_2', `File created successfully at: ${path.join(cwd, file)}`);
  }
  const answer = process.env.BENCH_STUB_ANSWER || 'done';
  const turns = scenario === 'edit' ? 3 : 2;
  const usage = { input_tokens: 4, cache_creation_input_tokens: 1000, cache_read_input_tokens: 500, output_tokens: 50 };

  if (scenario === 'noresult') process.exit(0);
  if (scenario === 'crash') {
    process.stdout.write('{"type":"assistant","message":{"id":"msg_9","content":[{"type":"tool_u');
    process.exit(3);
  }
  assistant(`msg_${turns}`, [{ type: 'text', text: answer }]);
  if (hooksOn) hook('Stop', 'Stop', '');
  const budget = Number(flag('--max-budget-usd'));
  if (scenario === 'budget') {
    emit({ type: 'result', subtype: 'error_max_budget_usd', is_error: true, num_turns: turns, total_cost_usd: budget, usage, result: '', duration_ms: 10, stop_reason: null });
    process.exit(1);
  }
  emit({ type: 'result', subtype: 'success', is_error: false, num_turns: turns, total_cost_usd: cost, usage, result: answer, duration_ms: 10, stop_reason: 'end_turn' });
}
