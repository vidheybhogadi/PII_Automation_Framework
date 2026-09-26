import { inspect } from 'node:util';
import type { EndpointKey, HttpMethod } from './endpoints';

/**
 * Wrapper around an HTTP response.
 *
 * SECURITY DESIGN: the parsed body and raw text are stored in private `#fields`. Private fields are not
 * enumerable, so if a test accidentally does `expect(response).toEqual(...)`, `console.log(response)` or
 * `JSON.stringify(response)`, only the safe summary (method, path, status, request ID, error code) appears —
 * never decrypted PII or a raw free-text key. Tests access the body explicitly via `.json()`.
 */
export class ApiResponse<TData = unknown> {
  readonly #json: unknown;
  readonly #rawText: string;

  constructor(
    readonly endpoint: EndpointKey | 'raw',
    readonly method: HttpMethod,
    readonly path: string,
    readonly status: number,
    /** Lower-cased header names. */
    readonly headers: Readonly<Record<string, string>>,
    readonly requestId: string,
    readonly durationMs: number,
    readonly callerId: string | undefined,
    rawText: string,
  ) {
    this.#rawText = rawText;
    this.#json = ApiResponse.tryParse(rawText);
  }

  private static tryParse(text: string): unknown {
    if (text.length === 0) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  }

  /** Parsed JSON body (undefined if the body was empty or not JSON). Treat as sensitive. */
  json(): unknown {
    return this.#json;
  }

  /** `data` property of the envelope, typed by the endpoint method that produced this response. */
  data(): TData {
    return (this.#json as { data?: TData } | undefined)?.data as TData;
  }

  /** Raw response text. Treat as sensitive. Used only for leak checks (e.g. "does not contain X"). */
  rawText(): string {
    return this.#rawText;
  }

  get isJson(): boolean {
    return this.#json !== undefined;
  }

  /** `error.code` from the error envelope, if present. Error codes are safe to log. */
  get errorCode(): string | undefined {
    const body = this.#json as { error?: { code?: unknown } } | undefined;
    const code = body?.error?.code;
    return typeof code === 'string' ? code : undefined;
  }

  header(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  /** Safe one-line description for assertion messages and logs. */
  summary(): string {
    const code = this.errorCode ? ` code=${this.errorCode}` : '';
    return `${this.method} ${this.path} -> HTTP ${this.status}${code} (requestId=${this.requestId}, ${this.durationMs}ms)`;
  }

  toString(): string {
    return `ApiResponse(${this.summary()})`;
  }

  toJSON(): string {
    return this.toString();
  }

  [inspect.custom](): string {
    return this.toString();
  }
}
