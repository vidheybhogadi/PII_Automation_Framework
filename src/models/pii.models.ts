/**
 * PII write / read / search / batch-read contracts on the Aisle facade.
 *
 * Requests carry NO tenant_id: Aisle sets the tenant itself (observed: every response says "aisle").
 * Write / read / batch-read response shapes and the limits below were OBSERVED on staging (2026-09-29).
 * Search response shapes were OBSERVED on staging on 2026-10-01 (EMAIL search access granted that day).
 */
import { z } from 'zod';

/** Fields used through the facade. NAME, EMAIL and PHONE are accessible (2026-10-01). */
export const PII_FIELDS = { EMAIL: 'EMAIL', PHONE: 'PHONE', NAME: 'NAME' } as const;
export type PiiFieldName = (typeof PII_FIELDS)[keyof typeof PII_FIELDS];

// ---- Request limits OBSERVED on staging (FastAPI 422 "min_length"/"max_length") -----------------------
export const LIMITS = {
  userId: { min: 1, max: 128 },
  value: { min: 1, max: 1024 },
  fieldNames: { min: 1 },
  batchUserIds: { min: 1, max: 200 },
  batchFields: { min: 1 },
} as const;

// ---- 2. Write PII -------------------------------------------------------------------------------
export interface WritePiiRequest {
  user_id: string;
  field: string;
  value: string;
}

export const writePiiDataSchema = z.object({
  tenant_id: z.string(),
  user_id: z.string(),
  field: z.string(),
  key_version: z.number().int(),
});
export type WritePiiData = z.infer<typeof writePiiDataSchema>;
export const WRITE_PII_DATA_KEYS = ['field', 'key_version', 'tenant_id', 'user_id'] as const;

// ---- 3. Read PII --------------------------------------------------------------------------------
export interface ReadPiiRequest {
  user_id: string;
  field_names: string[];
}

export const piiItemSchema = z.object({
  tenant_id: z.string(),
  user_id: z.string(),
  field: z.string(),
  value: z.string(),
});
export type PiiItem = z.infer<typeof piiItemSchema>;
export const PII_ITEM_KEYS = ['field', 'tenant_id', 'user_id', 'value'] as const;

export const readPiiDataSchema = z.object({
  tenant_id: z.string(),
  user_id: z.string(),
  items: z.array(piiItemSchema),
  count: z.number().int().nonnegative(),
});
export type ReadPiiData = z.infer<typeof readPiiDataSchema>;
export const READ_PII_DATA_KEYS = ['count', 'items', 'tenant_id', 'user_id'] as const;

// ---- 4. Search PII ------------------------------------------------------------------------------
export interface SearchPiiRequest {
  value: string;
  limit?: number;
  include_values?: boolean;
}

/**
 * include_values=false: each match is exactly `{ "user_id": ... }`.
 * `strictObject` rejects ANY extra property — a leaked `value` would fail validation. This is deliberate:
 * "Ensure search results do not expose unintended PII".
 */
export const searchMatchIdOnlySchema = z.strictObject({ user_id: z.string() });

/** include_values=true: `{ tenant_id, user_id, field, value }`. */
export const searchMatchWithValueSchema = piiItemSchema;

const searchDataBase = {
  tenant_id: z.string(),
  field: z.string(),
  count: z.number().int().nonnegative(),
  truncated: z.boolean(),
};
export const searchIdsOnlyDataSchema = z.object({
  ...searchDataBase,
  matches: z.array(searchMatchIdOnlySchema),
});
export const searchWithValuesDataSchema = z.object({
  ...searchDataBase,
  matches: z.array(searchMatchWithValueSchema),
});
export type SearchIdsOnlyData = z.infer<typeof searchIdsOnlyDataSchema>;
export type SearchWithValuesData = z.infer<typeof searchWithValuesDataSchema>;
export const SEARCH_DATA_KEYS = ['count', 'field', 'matches', 'tenant_id', 'truncated'] as const;

// ---- 5. Batch read ------------------------------------------------------------------------------
export interface BatchReadPiiRequest {
  user_ids: string[];
  fields: string[];
}

export const batchReadDataSchema = z.object({
  tenant_id: z.string(),
  items: z.array(piiItemSchema),
  count: z.number().int().nonnegative(),
});
export type BatchReadData = z.infer<typeof batchReadDataSchema>;
export const BATCH_READ_DATA_KEYS = ['count', 'items', 'tenant_id'] as const;
