import { HttpError } from './errors.ts';
import { handleWebhook } from './webhooks.ts';

export interface Response {
  status: number;
  body: unknown;
}

export function route(method: string, path: string, body?: unknown): Response {
  try {
    const hook = /^\/webhooks\/([a-z]+)$/.exec(path);
    if (method === 'POST' && hook !== null) return { status: 202, body: handleWebhook(hook[1], body) };
    throw new HttpError(404, 'not found');
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}
