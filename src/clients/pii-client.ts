/**
 * PiiClient — one readable, typed method per documented endpoint.
 *
 *   const res = await pii.writePii({ tenant_id, user_id, field: 'EMAIL', value });
 *   const data = expectSuccess(res, [201], writePiiDataSchema);
 *
 * Methods return the raw ApiResponse (they do NOT throw on 4xx/5xx) so tests can assert on any status.
 * For negative tests that need an off-contract payload (missing fields, wrong types), use `call()`.
 */
import type {
  CreateFreeTextKeyRequest,
  FreeTextKeyData,
  FreeTextKeyRefRequest,
  RevokeFreeTextKeyData,
} from '../models/free-text.models';
import type {
  BatchReadData,
  BatchReadPiiRequest,
  ReadPiiData,
  ReadPiiRequest,
  SearchIdsOnlyData,
  SearchPiiRequest,
  SearchWithValuesData,
  WritePiiData,
  WritePiiRequest,
} from '../models/pii.models';
import type {
  CreateTransientPhoneData,
  CreateTransientPhoneRequest,
  PromoteTransientPhoneData,
  PromoteTransientPhoneRequest,
  ResolveTransientPhoneData,
  ResolveTransientPhoneRequest,
} from '../models/transient.models';
import type { ApiResponse } from './api-response';
import {
  BaseApiClient,
  type BaseClientOptions,
  type CallOptions,
  type SigningIdentity,
} from './base-api-client';
import { DOC_ENDPOINTS, ENDPOINTS, type EndpointDefinition, type EndpointKey } from './endpoints';

export class PiiClient extends BaseApiClient {
  constructor(options: BaseClientOptions) {
    super(options);
  }

  /** Same base URL/logger/retry policy, different calling service. */
  withIdentity(identity: SigningIdentity): PiiClient {
    return new PiiClient({ ...this.options, identity });
  }

  /** Generic escape hatch for negative tests: any payload to any documented endpoint (still centrally signed). */
  call<TData = unknown>(
    key: EndpointKey,
    payload: unknown,
    options: CallOptions = {},
  ): Promise<ApiResponse<TData>> {
    return this.execute<TData>(ENDPOINTS[key], payload, options);
  }

  // ---- 1. Readiness (no authentication) ----------------------------------------------------------
  healthReady(options?: CallOptions): Promise<ApiResponse<{ status: string }>> {
    return this.execute(ENDPOINTS.healthReady, undefined, options);
  }

  // ---- 2–5. PII ------------------------------------------------------------------------------------
  writePii(request: WritePiiRequest, options?: CallOptions): Promise<ApiResponse<WritePiiData>> {
    return this.execute(ENDPOINTS.writePii, request, options);
  }

  readPii(request: ReadPiiRequest, options?: CallOptions): Promise<ApiResponse<ReadPiiData>> {
    return this.execute(ENDPOINTS.readPii, request, options);
  }

  /** `field` is the path parameter, e.g. 'EMAIL' -> POST /api/v1/pii/EMAIL/search */
  searchPii(
    field: string,
    request: SearchPiiRequest,
    options?: CallOptions,
  ): Promise<ApiResponse<SearchIdsOnlyData | SearchWithValuesData>> {
    return this.execute(ENDPOINTS.searchPii, request, { ...options, pathParams: { field } });
  }

  batchReadPii(request: BatchReadPiiRequest, options?: CallOptions): Promise<ApiResponse<BatchReadData>> {
    return this.execute(ENDPOINTS.batchReadPii, request, options);
  }

  // ---- 6–8. Transient phones -----------------------------------------------------------------------
  createTransientPhone(
    request: CreateTransientPhoneRequest,
    options?: CallOptions,
  ): Promise<ApiResponse<CreateTransientPhoneData>> {
    return this.execute(ENDPOINTS.createTransientPhone, request, options);
  }

  resolveTransientPhone(
    request: ResolveTransientPhoneRequest,
    options?: CallOptions,
  ): Promise<ApiResponse<ResolveTransientPhoneData>> {
    return this.execute(ENDPOINTS.resolveTransientPhone, request, options);
  }

  promoteTransientPhone(
    request: PromoteTransientPhoneRequest,
    options?: CallOptions,
  ): Promise<ApiResponse<PromoteTransientPhoneData>> {
    return this.execute(ENDPOINTS.promoteTransientPhone, request, options);
  }

  // ---- 9–11. Free-text keys ------------------------------------------------------------------------
  createFreeTextKey(
    request: CreateFreeTextKeyRequest,
    options?: CallOptions,
  ): Promise<ApiResponse<FreeTextKeyData>> {
    return this.execute(ENDPOINTS.createFreeTextKey, request, options);
  }

  readFreeTextKey(
    request: FreeTextKeyRefRequest,
    options?: CallOptions,
  ): Promise<ApiResponse<FreeTextKeyData>> {
    return this.execute(ENDPOINTS.readFreeTextKey, request, options);
  }

  revokeFreeTextKey(
    request: FreeTextKeyRefRequest,
    options?: CallOptions,
  ): Promise<ApiResponse<RevokeFreeTextKeyData>> {
    return this.execute(ENDPOINTS.revokeFreeTextKey, request, options);
  }

  // ---- Public documentation endpoints (contract/security suites only) ------------------------------
  getOpenApiSchema(): Promise<ApiResponse> {
    return this.execute(rawEndpoint(DOC_ENDPOINTS.openApi.method, DOC_ENDPOINTS.openApi.path), undefined, {
      retry: false,
    });
  }

  /** Probe the development-only signing helper WITHOUT a meaningful body — used only to check exposure. */
  probeSignatureHelper(): Promise<ApiResponse> {
    return this.execute(
      rawEndpoint(DOC_ENDPOINTS.signatureHelper.method, DOC_ENDPOINTS.signatureHelper.path),
      {},
      { retry: false },
    );
  }
}

/** Ad-hoc definition for unauthenticated documentation endpoints (not part of the functional inventory). */
function rawEndpoint(method: 'GET' | 'POST', path: string): EndpointDefinition {
  return {
    // The path doubles as the log label; these are not EndpointKeys, hence the cast.
    key: path as EndpointKey,
    method,
    path,
    authenticated: false,
    permission: 'none',
    successStatus: [200],
    retrySafe: false,
    noStore: false,
  };
}
