/**
 * M2Client — calls any Aisle business API by its inventory ID (m2/scripts/m2-inventory.ts, parsed from Dev's
 * m2/docs/aisle-pii-affected-apis.md). Method, path and the headers the Dev cURL sends come from the inventory, so
 * no route is hard-coded in a test:
 *
 *   const res = await m2.call('API-013', { auth: AUTH.none });
 *
 * - Headers: Accept (application/json, or text/html where the Dev cURL asks for it), device_type / app_version /
 *   unique_identifier when the Dev cURL has them, `webcms: true` for CMS routes. Content-Type only with a body.
 * - Credentials: chosen per call (`auth`). Real credentials travel only as `Secret`s and are shown in reports as
 *   their placeholder ($AISLE_TEST_TOKEN, $M2_USER_TOKEN). Never Ed25519 signatures, X-PII-* headers or tenant_id.
 * - Path ids (`:ref`, `:user_id`) default to a synthetic run-prefixed value that matches no real profile.
 * - Redirects are never followed (core client), so a redirect to a sign-in page is a refusal, not a success.
 */
import type { ApiResponse } from '../../../core/http/api-response';
import { BaseApiClient, type HttpMethod, type RequestSpec } from '../../../core/http/base-api-client';
import type { ExchangeRecorder } from '../../../core/utils/exchange-recorder';
import type { Logger } from '../../../core/utils/logger';
import type { Secret } from '../../../core/utils/secret';
import type { InventoryApi } from '../../scripts/m2-inventory';
import type { M2Config } from '../config/m2-config';
import { apiById } from '../design';

/** How a call authenticates. `header` is for deliberately invalid values only — never a real credential. */
export type AuthMode =
  | { kind: 'none' }
  | { kind: 'header'; label: string; value: string }
  | { kind: 'secret'; label: string; secret: Secret };

/** The device a session is bound to (the user JWT carries the device id; staging 2026-10-23). */
export interface Device {
  deviceType: string;
  uniqueIdentifier: string;
  /** app_version the session was created with (defaults to M2_APP_VERSION). */
  appVersion?: string;
}

export interface M2CallOptions {
  auth: AuthMode;
  query?: Record<string, string>;
  /** JSON body. Omitted = no body for GET; `{}` for other methods unless `noBody` is set. */
  body?: unknown;
  noBody?: boolean;
  pathParams?: Record<string, string>;
  device?: Device;
  /** Disable the 503 retry (writes never retry anyway). */
  retry?: boolean;
  /** Send these exact bytes as the body (e.g. broken JSON) instead of `body`. */
  rawBody?: Buffer;
  /** Content-Type for `rawBody` (e.g. multipart/form-data; boundary=…). Default: application/json. */
  contentType?: string;
}

/** A route that is not in the Dev inventory (e.g. the OTP request of the login flow). */
export interface ExtraRoute {
  key: string;
  method: HttpMethod;
  path: string;
  /** Header names to send, like InventoryApi.headers. */
  headers: string[];
}

const DEVICE_HEADERS = ['device_type', 'app_version', 'unique_identifier'];

export class M2Client {
  private readonly http: BaseApiClient;

  constructor(
    private readonly config: M2Config,
    logger: Logger,
    recorder?: ExchangeRecorder,
  ) {
    this.http = new BaseApiClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.http.timeoutMs,
      retryPolicy: { maxRetries: config.http.retryMaxAttempts, baseDelayMs: config.http.retryBaseDelayMs },
      logger,
      ...(recorder ? { recorder } : {}),
    });
  }

  /** Default device for calls that are not bound to a session: one synthetic id per run. */
  get defaultDevice(): Device {
    return { deviceType: this.config.deviceType, uniqueIdentifier: `${this.config.runId}-device` };
  }

  /** Call an inventory API by ID (e.g. 'API-013'). */
  call(apiId: string, options: M2CallOptions): Promise<ApiResponse> {
    const api = apiById(apiId);
    return this.send(
      {
        key: api.id,
        method: api.method as HttpMethod,
        path: api.path,
        headers: api.headers,
        html: api.curl.some((c) => /Accept: text\/html/.test(c)),
      },
      options,
    );
  }

  /** Call a route that is not in the inventory (login OTP request). */
  callRoute(route: ExtraRoute, options: M2CallOptions): Promise<ApiResponse> {
    return this.send({ ...route, html: false }, options);
  }

  /** The headers this client would send for an API (for the offline self-tests). Never includes a credential. */
  headersFor(
    api: Pick<InventoryApi, 'headers'>,
    device: Device = this.defaultDevice,
  ): Record<string, string> {
    return this.baseHeaders(api.headers, false, device);
  }

  private baseHeaders(names: readonly string[], html: boolean, device: Device): Record<string, string> {
    const h: Record<string, string> = { Accept: html ? 'text/html' : 'application/json' };
    if (DEVICE_HEADERS.some((d) => names.includes(d))) {
      h.device_type = device.deviceType;
      h.app_version = device.appVersion ?? this.config.appVersion;
      h.unique_identifier = device.uniqueIdentifier;
    }
    if (names.includes('webcms')) h.webcms = 'true';
    return h;
  }

  private send(
    route: { key: string; method: HttpMethod; path: string; headers: readonly string[]; html: boolean },
    o: M2CallOptions,
  ): Promise<ApiResponse> {
    const spec: RequestSpec = {
      key: route.key,
      method: route.method,
      // ":ref" → "{ref}" so the core client fills and URL-encodes it.
      path: route.path.replace(/:([a-z_]+)/g, '{$1}'),
      authenticated: false,
      retrySafe: route.method === 'GET',
    };
    const pathParams: Record<string, string> = {};
    for (const m of route.path.matchAll(/:([a-z_]+)/g)) {
      pathParams[m[1]!] = o.pathParams?.[m[1]!] ?? `${this.config.runId}-none`;
    }
    const payload = o.body !== undefined ? o.body : route.method === 'GET' || o.noBody ? undefined : {};
    const headers = this.baseHeaders(route.headers, route.html, o.device ?? this.defaultDevice);
    if (o.contentType) headers['Content-Type'] = o.contentType;
    return this.http.request(spec, payload, {
      headers,
      pathParams,
      ...(o.query ? { query: o.query } : {}),
      ...(o.retry === false ? { retry: false } : {}),
      ...(o.auth.kind === 'none' || o.auth.kind === 'header' || o.rawBody || o.contentType
        ? {
            tamper: {
              ...(o.auth.kind === 'none' ? { authorization: null } : {}),
              ...(o.auth.kind === 'header' ? { authorization: o.auth.value } : {}),
              ...(o.rawBody ? { bodyBytes: o.rawBody } : {}),
              ...(o.contentType ? { omitContentType: true } : {}),
            },
          }
        : {}),
      ...(o.auth.kind === 'secret' ? { credential: o.auth.secret } : {}),
    });
  }
}
