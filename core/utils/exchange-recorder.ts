/**
 * Records the exact HTTP exchanges of one test — request (as a copy-paste curl) and response — for debugging in
 * the report's test details.
 *
 * What is captured: method, URL, request headers and body, response status, content type and body, request ID,
 * call phase and duration. All test data is synthetic (qa-auto-… users, "QA Automation User …" names,
 * example.test emails), so bodies are shown in full.
 *
 * What is NEVER captured: the Aisle test token (or any other registered secret). It is replaced by its
 * placeholder — `Authorization: Bearer $AISLE_TEST_TOKEN` — so a copied curl runs with your own .env and the real
 * value never reaches a file, report, artifact or email.
 */
import type { CallPhase } from './phase';
import { maskSecretsOnly } from './redaction';

/** Bodies longer than this are cut (with a note) to keep the report small. */
export const MAX_BODY_CHARS = 16_384;

export interface HttpExchange {
  requestId: string;
  phase: CallPhase;
  method: string;
  url: string;
  /** Request headers as sent, with the token replaced by its placeholder. */
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  requestBodyTruncated?: boolean;
  /** Ready-to-run curl for the request (token as $AISLE_TEST_TOKEN). */
  curl: string;
  /** HTTP status, or null when no response was received. */
  status: number | null;
  /** Network error code when no response was received (e.g. ECONNREFUSED). */
  transportError?: string;
  responseContentType: string | null;
  responseBody: string | null;
  responseBodyTruncated?: boolean;
  durationMs: number;
}

function cap(text: string): { text: string; truncated: boolean } {
  return text.length > MAX_BODY_CHARS
    ? {
        text: `${text.slice(0, MAX_BODY_CHARS)}\n… [truncated: ${text.length} characters in total]`,
        truncated: true,
      }
    : { text, truncated: false };
}

/** Quote for a POSIX shell inside single quotes. */
const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Build a curl command. The Authorization header uses double quotes so `$AISLE_TEST_TOKEN` expands from the
 * caller's environment; everything else is single-quoted (no expansion).
 */
export function toCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | null,
): string {
  const parts = [`curl -i -X ${method} ${sq(url)}`];
  for (const [name, value] of Object.entries(headers)) {
    parts.push(
      /\$AISLE_[A-Z_]+_TOKEN/.test(value)
        ? `-H "${name}: ${value.replace(/"/g, '\\"')}"`
        : `-H ${sq(`${name}: ${value}`)}`,
    );
  }
  if (body !== null) parts.push(`--data-raw ${sq(body)}`);
  return parts.join(' \\\n  ');
}

export class ExchangeRecorder {
  readonly #exchanges: HttpExchange[] = [];

  record(input: {
    requestId: string;
    phase: CallPhase;
    method: string;
    url: string;
    requestHeaders: Record<string, string>;
    requestBody: Buffer | undefined;
    status: number | null;
    transportError?: string;
    responseContentType?: string | null;
    responseBody?: string;
    durationMs: number;
  }): void {
    const headers = Object.fromEntries(
      Object.entries(input.requestHeaders).map(([k, v]) => [k, maskSecretsOnly(v)]),
    );
    const reqFull =
      input.requestBody === undefined ? null : maskSecretsOnly(input.requestBody.toString('utf8'));
    const req = reqFull === null ? null : cap(reqFull);
    const res = input.responseBody === undefined ? null : cap(maskSecretsOnly(input.responseBody));
    this.#exchanges.push({
      requestId: input.requestId,
      phase: input.phase,
      method: input.method,
      url: maskSecretsOnly(input.url),
      requestHeaders: headers,
      requestBody: req?.text ?? null,
      ...(req?.truncated ? { requestBodyTruncated: true } : {}),
      // The curl always carries the FULL (untruncated) body so it reproduces the request exactly.
      curl: toCurl(input.method, maskSecretsOnly(input.url), headers, reqFull),
      status: input.status,
      ...(input.transportError ? { transportError: input.transportError } : {}),
      responseContentType: input.responseContentType ?? null,
      responseBody: res?.text ?? null,
      ...(res?.truncated ? { responseBodyTruncated: true } : {}),
      durationMs: input.durationMs,
    });
  }

  exchanges(): readonly HttpExchange[] {
    return [...this.#exchanges];
  }
}
