/**
 * AislePiiClient — one readable, typed method per Aisle PII facade endpoint.
 *
 *   const res = await aisle.writePii({ user_id, field: 'NAME', value });
 *   const data = expectSuccess(res, 201, writePiiDataSchema, 'PII write successful');
 *
 * Authentication (`Authorization: Bearer <AISLE_TEST_TOKEN>`) and `Content-Type: application/json` are added
 * centrally by BaseApiClient. Requests never contain tenant_id: Aisle sets the tenant internally.
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
import { BaseApiClient, type BaseClientOptions, type CallOptions } from './base-api-client';
import { ENDPOINTS, type EndpointKey } from './endpoints';

export class AislePiiClient extends BaseApiClient {
  constructor(options: BaseClientOptions) {
    super(options);
  }

  /** Generic escape hatch for negative tests: any payload to any facade endpoint (still centrally authenticated). */
  call<TData = unknown>(
    key: EndpointKey,
    payload: unknown,
    options: CallOptions = {},
  ): Promise<ApiResponse<TData>> {
    return this.execute<TData>(ENDPOINTS[key], payload, options);
  }

  // ---- Health --------------------------------------------------------------------------------------
  healthReady(options?: CallOptions): Promise<ApiResponse<{ status: string }>> {
    return this.execute(ENDPOINTS.healthReady, undefined, options);
  }

  // ---- PII -----------------------------------------------------------------------------------------
  writePii(request: WritePiiRequest, options?: CallOptions): Promise<ApiResponse<WritePiiData>> {
    return this.execute(ENDPOINTS.writePii, request, options);
  }

  readPii(request: ReadPiiRequest, options?: CallOptions): Promise<ApiResponse<ReadPiiData>> {
    return this.execute(ENDPOINTS.readPii, request, options);
  }

  /** `field` is the path parameter, e.g. 'EMAIL' -> POST /api/v1/pii-test/EMAIL/search */
  searchPii(
    field: string,
    request: SearchPiiRequest,
    options?: CallOptions,
  ): Promise<ApiResponse<SearchIdsOnlyData | SearchWithValuesData>> {
    return this.execute(ENDPOINTS.searchPii, request, { ...options, pathParams: { field } });
  }

  batchRead(request: BatchReadPiiRequest, options?: CallOptions): Promise<ApiResponse<BatchReadData>> {
    return this.execute(ENDPOINTS.batchReadPii, request, options);
  }

  // ---- Temporary (transient) phones ------------------------------------------------------------------
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

  // ---- Free-text encryption keys -----------------------------------------------------------------------
  createFreeTextKey(
    request: CreateFreeTextKeyRequest = {},
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
}
