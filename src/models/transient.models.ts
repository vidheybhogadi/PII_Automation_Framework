/** Transient phone contracts (guide sections 6–8). */
import { z } from 'zod';
import { isoDateTime } from './common.models';

// ---- 6. Create ----------------------------------------------------------------------------------
export interface CreateTransientPhoneRequest {
  tenant_id: string;
  phone: string;
  ttl_seconds: number;
}

export const createTransientPhoneDataSchema = z.object({
  tenant_id: z.string(),
  transient_id: z.uuid(),
  expires_at: isoDateTime,
});
export type CreateTransientPhoneData = z.infer<typeof createTransientPhoneDataSchema>;
export const CREATE_TRANSIENT_DATA_KEYS = ['expires_at', 'tenant_id', 'transient_id'] as const;

// ---- 7. Resolve ---------------------------------------------------------------------------------
export interface ResolveTransientPhoneRequest {
  tenant_id: string;
  transient_id: string;
}

export const resolveTransientPhoneDataSchema = z.object({
  tenant_id: z.string(),
  transient_id: z.uuid(),
  /** Normalized: digits only, 8–15 digits. */
  phone: z.string().regex(/^\d{8,15}$/),
  expires_at: isoDateTime,
});
export type ResolveTransientPhoneData = z.infer<typeof resolveTransientPhoneDataSchema>;
export const RESOLVE_TRANSIENT_DATA_KEYS = ['expires_at', 'phone', 'tenant_id', 'transient_id'] as const;

// ---- 8. Promote ---------------------------------------------------------------------------------
export interface PromoteTransientPhoneRequest {
  tenant_id: string;
  transient_id: string;
  user_id: string;
}

export const promoteTransientPhoneDataSchema = z.object({
  tenant_id: z.string(),
  transient_id: z.uuid(),
  user_id: z.string(),
  field: z.literal('PHONE'),
  key_version: z.number().int(),
  /** false when an existing permanent PHONE row was replaced. */
  created: z.boolean(),
  consumed: z.boolean(),
});
export type PromoteTransientPhoneData = z.infer<typeof promoteTransientPhoneDataSchema>;
export const PROMOTE_TRANSIENT_DATA_KEYS = [
  'consumed',
  'created',
  'field',
  'key_version',
  'tenant_id',
  'transient_id',
  'user_id',
] as const;
