/**
 * BaseApiClient — the ONLY place where requests to the Aisle PII facade are built and sent.
 *
 * Authentication: every facade endpoint needs the Aisle test token. It is added HERE, once, as
 * `Authorization: Bearer <token>`; tests never build auth headers themselves. The token is held in a
 * `Secret` and is never logged, never put in error messages and never attached to reports.
 *
 * Aisle sets the tenant and signs the request to the PII service internally, so this client sends no
 * tenant_id, no caller ID and no signature.
 *
 * Why Axios and not Playwright's APIRequestContext?
 *   Playwright traces record full request/response bodies and headers — here that would be the Bearer token
 *   and decrypted personal data inside trace.zip files attached to reports. Axios traffic is invisible to
 *   Playwright tracing, and Axios can send a pre-built Buffer byte-for-byte (needed for the broken-JSON test).
 */
import axios, { type AxiosResponse } from 'axios';
import { performance } from 'node:perf_hooks';
import type { Logger } from '../utils/logger';
import { currentPhase } from '../utils/phase';
import { newRequestId } from '../utils/request-id';
import { withRetry, type RetryPolicy } from '../utils/retry';
import type { Secret } from '../utils/secret';
import { ApiResponse } from './api-response';
import { buildPath, type EndpointDefinition, type HttpMethod } from './endpoints';

export const HEADER = {
  AUTHORIZATION: 'Authorization',
  CONTENT_TYPE: 'Content-Type',
  /** Correlation ID for our own logs; Aisle may ignore it. */
  REQUEST_ID: 'X-Request-Id',
} as const;

export const JSON_CONTENT_TYPE = 'application/json';

/** Serialize a payload ONCE into the exact bytes that will be sent. Compact JSON, UTF-8. */
export function serializeBody(payload: unknown): Buffer {
  const json = JSON.stringify(payload);
  if (json === undefined) throw new Error('Payload is not JSON-serializable');
  return Buffer.from(json, 'utf8');
}

/**
 * Controlled request changes for NEGATIVE tests. Tests only declare what should be wrong; the client
 * still builds everything else centrally.
 */
export interface TamperOptions {
  /**
   * Replace the Authorization header: `null` sends none at all; a string is sent exactly as given
   * (e.g. "Bearer not-a-real-token", "Token abc"). Never put the real token in here.
   */
  authorization?: string | null;
  /** Send no Content-Type header. */
  omitContentType?: boolean;
  /** Transmit these exact bytes instead of the serialized payload (e.g. broken JSON). */
  bodyBytes?: Buffer;
}

export interface CallOptions {
  tamper?: TamperOptions;
  /** Set false to disable the 503 retry for this call. Only retry-safe endpoints ever retry. */
  retry?: boolean;
  /** Path parameters for templated paths, e.g. { field: 'EMAIL' }. */
  pathParams?: Record<string, string>;
}

export interface PreparedRequest {
  method: HttpMethod;
  path: string;
  url: string;
  headers: Record<string, string>;
  bodyBytes: Buffer | undefined;
  requestId: string;
  /** How the request was authenticated — safe to log: 'token' | 'none' | 'custom'. */
  auth: 'token' | 'none' | 'custom';
}

export interface BaseClientOptions {
  baseUrl: string;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  logger: Logger;
  /** The Aisle test token. Omit only for clients that must never authenticate. */
  token?: Secret;
}

export class ApiTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiTransportError';
  }
}

export class BaseApiClient {
  protected readonly options: BaseClientOptions;

  constructor(options: BaseClientOptions) {
    this.options = { ...options, baseUrl: options.baseUrl.replace(/\/+$/, '') };
  }

  /**
   * Build the exact request (URL, headers, body bytes) without sending it.
   * Public so unit tests can inspect it.
   */
  prepare(endpoint: EndpointDefinition, payload: unknown, callOptions: CallOptions = {}): PreparedRequest {
    const tamper = callOptions.tamper ?? {};
    const path = buildPath(endpoint.path, callOptions.pathParams);
    const requestId = newRequestId();
    const bodyBytes = tamper.bodyBytes ?? (payload === undefined ? undefined : serializeBody(payload));

    const headers: Record<string, string> = { [HEADER.REQUEST_ID]: requestId };
    if (bodyBytes !== undefined && !tamper.omitContentType) headers[HEADER.CONTENT_TYPE] = JSON_CONTENT_TYPE;

    let auth: PreparedRequest['auth'] = 'none';
    if (tamper.authorization !== undefined) {
      if (tamper.authorization !== null) {
        headers[HEADER.AUTHORIZATION] = tamper.authorization;
        auth = 'custom';
      }
    } else if (endpoint.authenticated) {
      if (!this.options.token) {
        throw new Error(
          `Endpoint ${endpoint.key} needs the Aisle test token but this client has none. ` +
            'Set AISLE_TEST_TOKEN (see docs/setup-guide.md).',
        );
      }
      headers[HEADER.AUTHORIZATION] = `Bearer ${this.options.token.reveal()}`;
      auth = 'token';
    }

    return {
      method: endpoint.method,
      path,
      url: `${this.options.baseUrl}${path}`,
      headers,
      bodyBytes,
      requestId,
      auth,
    };
  }

  /** Prepare, send (with bounded retry for retry-safe endpoints on 503), log safely. */
  protected async execute<TData>(
    endpoint: EndpointDefinition,
    payload: unknown,
    callOptions: CallOptions = {},
  ): Promise<ApiResponse<TData>> {
    const retryAllowed = endpoint.retrySafe && callOptions.retry !== false;
    const policy: RetryPolicy = retryAllowed
      ? this.options.retryPolicy
      : { ...this.options.retryPolicy, maxRetries: 0 };

    return withRetry(
      // A fresh request (and fresh X-Request-Id) per attempt.
      () => this.send<TData>(endpoint.key, this.prepare(endpoint, payload, callOptions)),
      (response) => response.status === 503,
      policy,
      (attempt, delayMs, response) =>
        this.options.logger.warn('Retrying after HTTP 503', {
          endpoint: endpoint.key,
          attempt,
          delayMs,
          previousRequestId: response.requestId,
          errorCode: response.errorCode,
        }),
    );
  }

  /** Send a prepared request exactly as built. Headers and bodies are never logged. */
  async send<TData = unknown>(
    endpointKey: ApiResponse['endpoint'],
    request: PreparedRequest,
  ): Promise<ApiResponse<TData>> {
    const started = performance.now();
    let response: AxiosResponse<string>;
    try {
      response = await axios.request<string>({
        method: request.method,
        url: request.url,
        // Axios would otherwise add "Content-Type: application/x-www-form-urlencoded" when the header is
        // absent, which would defeat the "no Content-Type" negative test. `false` = do not send.
        headers: { [HEADER.CONTENT_TYPE]: false, ...request.headers },
        data: request.bodyBytes,
        timeout: this.options.timeoutMs,
        // Identity transforms: Axios must not re-serialize the body or auto-parse the response.
        transformRequest: [(data: unknown) => data],
        transformResponse: [(data: unknown) => data],
        responseType: 'text',
        validateStatus: () => true, // every status is a result to assert on, not an exception
        maxRedirects: 0,
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - started);
      const code = (error as { code?: string }).code ?? 'UNKNOWN';
      this.options.logger.error('HTTP transport failure', {
        endpoint: endpointKey,
        phase: currentPhase(),
        method: request.method,
        path: request.path,
        requestId: request.requestId,
        transportError: code,
        durationMs,
      });
      // Message deliberately excludes body and headers (the Authorization header holds the token).
      throw new ApiTransportError(
        `${request.method} ${request.path} failed before an HTTP response was received (${code}, ` +
          `requestId=${request.requestId}, ${durationMs}ms). Check AISLE_BASE_URL, network/VPN access and ` +
          `that the Aisle staging service is up.`,
      );
    }

    const durationMs = Math.round(performance.now() - started);
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(response.headers)) {
      if (value !== undefined && value !== null) headers[name.toLowerCase()] = String(value);
    }
    const result = new ApiResponse<TData>(
      endpointKey,
      request.method,
      request.path,
      response.status,
      headers,
      request.requestId,
      durationMs,
      request.auth,
      typeof response.data === 'string' ? response.data : '',
    );

    this.options.logger.info('HTTP call', {
      endpoint: endpointKey,
      phase: currentPhase(),
      method: request.method,
      path: request.path,
      auth: request.auth,
      requestId: request.requestId,
      status: result.status,
      errorCode: result.errorCode,
      durationMs,
      requestBytes: request.bodyBytes?.length ?? 0,
    });
    return result;
  }
}
