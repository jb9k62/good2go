// Grades one finished run. A grader sees only the workdir the agent left behind and the agent's
// final text. A check that cannot run (missing command, bad regex, path outside the workdir,
// missing hidden directory, timeout) is a failure with the reason in `detail`, never a pass.

import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Grader, GradeResult, Task } from './types.mts';

/** Wall-clock limit for one `test` grader command. */
export const COMMAND_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

interface Outcome {
  pass: boolean;
  detail: string[];
}

/**
 * Grades `task` against the finished `workdir`. `taskDir` is the task's folder under the
 * benchmark's `tasks/`, where a `test` grader's `hiddenDir` is looked up. The hidden files are
 * copied into the workdir here, at grade time, so the agent never sees them.
 */
export async function grade(
  task: Task,
  workdir: string,
  resultText: string,
  taskDir: string,
): Promise<GradeResult> {
  const outcome = await check(task.grader, { workdir, resultText, taskDir });
  return { pass: outcome.pass, detail: outcome.detail };
}

interface Context {
  workdir: string;
  resultText: string;
  taskDir: string;
}

async function check(g: Grader, ctx: Context): Promise<Outcome> {
  switch (g.kind) {
    case 'test':
      return runTest(g, ctx);
    case 'answer':
      return checkAnswer(g, ctx);
    case 'file':
      return checkFile(g, ctx);
    case 'all':
      return checkAll(g, ctx);
    default:
      return unknownGrader(g);
  }
}

function unknownGrader(g: unknown): Outcome {
  const kind = typeof g === 'object' && g !== null && 'kind' in g ? String((g as { kind: unknown }).kind) : typeof g;
  return { pass: false, detail: [`${kind}: could not run: unknown grader kind`] };
}

/** Compiles a case-insensitive regex, or returns the reason it cannot. */
function compile(source: string): RegExp | string {
  try {
    return new RegExp(source, 'i');
  } catch (err) {
    return `invalid regex /${source}/: ${(err as Error).message}`;
  }
}

/** A path inside `root`, or null when it would escape it (or is absolute). */
function within(root: string, rel: string): string | null {
  if (typeof rel !== 'string' || rel.length === 0 || path.isAbsolute(rel)) return null;
  const abs = path.resolve(root, rel);
  const back = path.relative(root, abs);
  if (back === '' || back.startsWith('..') || path.isAbsolute(back)) return null;
  return abs;
}

async function checkAll(g: Extract<Grader, { kind: 'all' }>, ctx: Context): Promise<Outcome> {
  if (!Array.isArray(g.of) || g.of.length === 0) {
    return { pass: false, detail: ['all: could not run: no checks listed'] };
  }
  // Every check runs, so the report shows each one's result, not only the first failure.
  const detail: string[] = [];
  let pass = true;
  for (const sub of g.of) {
    const outcome = await check(sub, ctx);
    detail.push(...outcome.detail);
    pass = pass && outcome.pass;
  }
  return { pass, detail };
}

function checkAnswer(g: Extract<Grader, { kind: 'answer' }>, ctx: Context): Outcome {
  const all = g.all ?? [];
  const none = g.none ?? [];
  if (all.length === 0 && none.length === 0) {
    return { pass: false, detail: ['answer: could not run: no regexes given'] };
  }
  const detail: string[] = [];
  let pass = true;
  // A pattern that must be absent proves nothing about an agent that said nothing.
  if (all.length === 0 && ctx.resultText.trim() === '') {
    detail.push('answer: the agent gave no answer text');
    pass = false;
  }
  for (const source of all) {
    const re = compile(source);
    if (typeof re === 'string') {
      detail.push(`answer: could not run: ${re}`);
      pass = false;
      continue;
    }
    const hit = re.test(ctx.resultText);
    detail.push(`answer: /${source}/ ${hit ? 'matched' : 'did not match'}`);
    pass = pass && hit;
  }
  for (const source of none) {
    const re = compile(source);
    if (typeof re === 'string') {
      detail.push(`answer: could not run: ${re}`);
      pass = false;
      continue;
    }
    const hit = re.test(ctx.resultText);
    detail.push(`answer: /${source}/ ${hit ? 'matched (forbidden)' : 'absent'}`);
    pass = pass && !hit;
  }
  return { pass, detail };
}

async function checkFile(g: Extract<Grader, { kind: 'file' }>, ctx: Context): Promise<Outcome> {
  const abs = within(ctx.workdir, g.path);
  if (abs === null) {
    return { pass: false, detail: [`file: could not run: ${JSON.stringify(g.path)} is not a path inside the workdir`] };
  }
  let text: string;
  try {
    text = await fs.promises.readFile(abs, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const why = code === 'ENOENT' ? 'does not exist' : `could not be read (${code ?? (err as Error).message})`;
    return { pass: false, detail: [`file: ${g.path} ${why}`] };
  }
  const detail: string[] = [];
  let pass = true;
  for (const source of g.contains ?? []) {
    const re = compile(source);
    if (typeof re === 'string') {
      detail.push(`file: could not run: ${re}`);
      pass = false;
      continue;
    }
    const hit = re.test(text);
    detail.push(`file: ${g.path} ${hit ? 'contains' : 'does not contain'} /${source}/`);
    pass = pass && hit;
  }
  for (const source of g.absent ?? []) {
    const re = compile(source);
    if (typeof re === 'string') {
      detail.push(`file: could not run: ${re}`);
      pass = false;
      continue;
    }
    const hit = re.test(text);
    detail.push(`file: ${g.path} ${hit ? 'contains forbidden /' + source + '/' : 'lacks /' + source + '/'}`);
    pass = pass && !hit;
  }
  if (detail.length === 0) detail.push(`file: ${g.path} exists`);
  return { pass, detail };
}

async function runTest(g: Extract<Grader, { kind: 'test' }>, ctx: Context): Promise<Outcome> {
  if (!Array.isArray(g.command) || g.command.length === 0 || g.command.some((a) => typeof a !== 'string')) {
    return { pass: false, detail: ['test: could not run: command must be a non-empty argv'] };
  }
  const expected = g.stdoutMatches === undefined ? null : compile(g.stdoutMatches);
  if (typeof expected === 'string') {
    return { pass: false, detail: [`test: could not run: ${expected}`] };
  }

  if (g.hiddenDir !== undefined) {
    const copied = await copyHidden(g.hiddenDir, ctx);
    if (copied !== null) return { pass: false, detail: [`test: could not run: ${copied}`] };
  }

  const run = await execArgv(g.command, ctx.workdir);
  if (run.error !== null) return { pass: false, detail: [`test: ${run.error}`] };
  const detail: string[] = [`test: exit ${run.code}`];
  let pass = run.code === 0;
  if (expected !== null) {
    const hit = expected.test(run.stdout);
    detail.push(`test: stdout ${hit ? 'matched' : 'did not match'} /${g.stdoutMatches}/`);
    pass = pass && hit;
  }
  return { pass, detail };
}

/** Copies the task's hidden directory over the workdir. Returns the reason on failure, else null. */
async function copyHidden(hiddenDir: string, ctx: Context): Promise<string | null> {
  const src = within(ctx.taskDir, hiddenDir);
  if (src === null) return `hidden directory ${JSON.stringify(hiddenDir)} is not inside the task folder`;
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(src);
  } catch {
    return `hidden directory ${hiddenDir} is missing`;
  }
  if (!stat.isDirectory()) return `hidden path ${hiddenDir} is not a directory`;
  try {
    await fs.promises.cp(src, ctx.workdir, { recursive: true, force: true });
  } catch (err) {
    return `copying hidden directory ${hiddenDir} failed: ${(err as Error).message}`;
  }
  return null;
}

interface Exec {
  code: number;
  stdout: string;
  /** Why the command could not be run or did not finish; null when it exited normally. */
  error: string | null;
}

/**
 * The environment a grader command inherits. `NODE_TEST_CONTEXT` (set when the runner itself is
 * under `node --test`) would make a nested test run report to the outer one, and
 * `PARCEL_FAKE_CARRIERS` would switch on the integration tests the task is about: a command that
 * needs it sets it itself, through `env`.
 */
function graderEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.PARCEL_FAKE_CARRIERS;
  return env;
}

/**
 * Runs `argv` in its own process group so a timeout kills the whole tree (`npm run` starts a
 * shell, which starts node, which starts a process per test file), not only the direct child.
 */
function execArgv(argv: string[], cwd: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<Exec> {
  return new Promise((resolve) => {
    const [file, ...args] = argv as [string, ...string[]];
    let child: ChildProcess;
    try {
      child = spawn(file, args, { cwd, env: graderEnv(), detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      return resolve({ code: -1, stdout: '', error: `could not run: ${(err as Error).message}` });
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failure: string | null = null;
    let settled = false;
    const killTree = () => {
      try {
        if (child.pid !== undefined && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    };
    const finish = (result: Exec) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Leave nothing behind: a background process the suite started dies with the group.
      killTree();
      resolve(result);
    };
    const timer = setTimeout(() => {
      failure = `timed out after ${timeoutMs / 1000} s`;
      killTree();
    }, timeoutMs);
    child.stdout!.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) {
        failure ??= `stdout passed ${MAX_OUTPUT_BYTES} bytes`;
        killTree();
        return;
      }
      chunks.push(chunk);
    });
    child.stderr!.resume();
    child.on('error', (err: NodeJS.ErrnoException) => {
      const why = err.code === 'ENOENT' ? `could not run: ${file} not found` : `could not run: ${err.message}`;
      finish({ code: -1, stdout: Buffer.concat(chunks).toString('utf8'), error: why });
    });
    let exit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    const conclude = () => {
      const stdout = Buffer.concat(chunks).toString('utf8');
      if (failure !== null) return finish({ code: -1, stdout, error: failure });
      if (exit === null || exit.code === null) {
        return finish({ code: -1, stdout, error: `killed by ${exit?.signal ?? 'a signal'}` });
      }
      finish({ code: exit.code, stdout, error: null });
    };
    child.on('exit', (code, signal) => {
      exit = { code, signal };
      // Kill whatever the command left running, so the pipes close and the grade can finish;
      // if something escaped the group and still holds stdout, stop waiting after a grace period.
      killTree();
      setTimeout(() => {
        child.stdout!.destroy();
        conclude();
      }, 5_000).unref();
    });
    child.on('close', conclude);
  });
}

export { execArgv as _execArgvForTests };
