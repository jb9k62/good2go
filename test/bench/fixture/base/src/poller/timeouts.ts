import { TIMEOUT_MS } from './config.ts';

export async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
