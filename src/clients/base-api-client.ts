/**
 * BaseApiClient — the ONLY place where requests are serialized, signed and sent.
 *
 * Why Axios and not Playwright's APIRequestContext?
 *   Playwright traces record full request/response bodies and headers. For a PII service that would put
 *   plaintext PII, signatures and raw free-text keys into trace.zip files attached to reports. Axios traffic
 *   is invisible to Playwright tracing, and Axios lets us send a pre-built Buffer byte-for-byte (with
 *   request/response transforms disabled), which the signature scheme requires.
 *
 * Signing flow (guide "Authentication"; checklist item 5 "Serialize each request once, sign those exact
 * bytes, and transmit the same bytes"):
 *   1. payload  --JSON.stringify once-->  string  --UTF-8-->  bodyBytes (Buffer)
 *   2. X-PII-Signature = Base64(Ed25519.sign(privateKey, SHA256(bodyBytes)))
 *   3. The SAME bodyBytes Buffer is handed to Axios as the request body. Nothing re-serializes it.
 */
import axios, { type AxiosResponse } from 'axios';
import { performance } from 'node:perf_hooks';
import type { Ed25519Signer } from '../auth/ed25519-signer';
import type { Logger } from '../utils/logger';
import { currentPhase } from '../utils/phase';
import { newRequestId } from '../utils/request-id';
import { withRetry, type RetryPolicy } from '../utils/retry';
import { ApiResponse } from './api-response';
import { buildPath, type EndpointDefinition, type HttpMethod } from './endpoints';

export const HEADER = {
  CONTENT_TYPE: 'Content-Type',
  CALLER_ID: 'X-PII-Caller-Id',
  REQUEST_ID: 'X-Request-Id',
  SIGNATURE: 'X-PII-Signature',
} as const;
export type AuthHeaderName = (typeof HEADER)[keyof typeof HEADER];

export const JSON_CONTENT_TYPE = 'application/json';

/** Serialize a payload ONCE into the exact bytes that will be signed and sent. Compact JSON, UTF-8. */
export function serializeBody(payload: unknown): Buffer {
  const json = JSON.stringify(payload);
  if (json === undefined) throw new Error('Payload is not JSON-serializable');
  return Buffer.from(json, 'utf8');
}

/** An identity that can sign requests. */
export interface SigningIdentity {
  readonly callerId: string;
  readonly signer: Ed25519Signer;
}

/**
 * Controlled request mutations for NEGATIVE security tests. Centralizing them here means tests never
 * re-implement signing; they only declare what should be wrong with the request.
 */
export interface TamperOptions {
  /** Send no auth headers at all (Caller-Id, Request-Id, Signature). */
  unauthenticated?: boolean;
  /** Remove specific headers after they are built. */
  omitHeaders?: readonly AuthHeaderName[];
  /** Override header values after they are built (e.g. a malformed signature or unknown caller ID). */
  headers?: Readonly<Record<string, string>>;
  /** Transmit these bytes instead of the serialized payload (signature is computed over them unless `signOverBytes`). */
  bodyBytes?: Buffer;
  /** Compute the signature over these bytes instead of the transmitted ones -> body/signature mismatch. */
  signOverBytes?: Buffer;
  /** Sign with a different key while keeping this client's caller ID. */
  signWith?: Ed25519Signer;
  /** 'raw-body' signs the body without SHA-256 first (wrong scheme). Default 'sha256-digest'. */
  signatureScheme?: 'sha256-digest' | 'raw-body';
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
  callerId: string | undefined;
}

export interface BaseClientOptions {
  baseUrl: string;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  logger: Logger;
  identity?: SigningIdentity;
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

  get callerId(): string | undefined {
    return this.options.identity?.callerId;
  }

  /**
   * Build the exact request (URL, headers, body bytes) without sending it.
   * Public so unit tests can inspect it and security tests can reason about it.
   */
  prepare(endpoint: EndpointDefinition, payload: unknown, callOptions: CallOptions = {}): PreparedRequest {
    const tamper = callOptions.tamper ?? {};
    const path = buildPath(endpoint.path, callOptions.pathParams);
    const requestId = newRequestId();

    // (1) Serialize exactly once.
    const bodyBytes = tamper.bodyBytes ?? (payload === undefined ? undefined : serializeBody(payload));

    const headers: Record<string, string> = {};
    if (bodyBytes !== undefined) headers[HEADER.CONTENT_TYPE] = JSON_CONTENT_TYPE;
    headers[HEADER.REQUEST_ID] = requestId;

    const identity = this.options.identity;
    if (endpoint.authenticated && !tamper.unauthenticated) {
      if (!identity) {
        throw new Error(
          `Endpoint ${endpoint.key} requires authentication but this client has no caller identity. ` +
            'Create it with a configured caller (see requireCaller in src/config/config.ts).',
        );
      }
      // (2) Sign the SHA-256 digest of the exact bytes (or deliberately different bytes for negative tests).
      const signer = tamper.signWith ?? identity.signer;
      const bytesToSign = tamper.signOverBytes ?? bodyBytes ?? Buffer.alloc(0);
      const signature =
        tamper.signatureScheme === 'raw-body'
          ? signer.signRawBodyWithoutDigest(bytesToSign)
          : signer.signBody(bytesToSign);
      headers[HEADER.CALLER_ID] = identity.callerId;
      headers[HEADER.SIGNATURE] = signature;
    }
    if (tamper.unauthenticated) delete headers[HEADER.REQUEST_ID];

    for (const name of tamper.omitHeaders ?? []) delete headers[name];
    Object.assign(headers, tamper.headers ?? {});

    return {
      method: endpoint.method,
      path,
      url: `${this.options.baseUrl}${path}`,
      headers,
      bodyBytes,
      requestId: headers[HEADER.REQUEST_ID] ?? requestId,
      callerId: headers[HEADER.CALLER_ID],
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
      // A fresh request (and fresh X-Request-Id) per attempt — checklist item 6.
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

  /** Send a prepared request exactly as built. (3) The same Buffer that was signed is transmitted. */
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
        // Axios would otherwise inject "Content-Type: application/x-www-form-urlencoded" when the header is
        // absent, which would silently defeat the "missing Content-Type" negative test. `false` = do not send.
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
      // Message deliberately excludes body/headers.
      throw new ApiTransportError(
        `${request.method} ${request.path} failed before an HTTP response was received (${code}, ` +
          `requestId=${request.requestId}, ${durationMs}ms). Check PII_BASE_URL, VPN/network access and ` +
          `that the service is running.`,
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
      request.callerId,
      typeof response.data === 'string' ? response.data : '',
    );

    this.options.logger.info('HTTP call', {
      endpoint: endpointKey,
      phase: currentPhase(),
      method: request.method,
      path: request.path,
      caller: request.callerId,
      requestId: request.requestId,
      status: result.status,
      errorCode: result.errorCode,
      durationMs,
      requestBytes: request.bodyBytes?.length ?? 0,
    });
    return result;
  }
}
