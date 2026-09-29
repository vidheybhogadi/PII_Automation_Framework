/**
 * Free-text encryption key contracts on the Aisle facade.
 *
 * PROVISIONAL: requests match the Aisle curl collection. The RESPONSE shapes below come from the PII Service
 * Integration Guide and are NOT yet confirmed through the facade — every call returns 403 today because the
 * Aisle caller has no access (docs/backend-open-questions.md BQ-02). Confirm them before relying on them.
 *
 * The raw key is sensitive. Tests must compare it via hashes/lengths only and never print it.
 * The client wraps responses so the key is not visible in reports (see ApiResponse).
 */
import { z } from 'zod';
import { isoDateTime } from './common.models';

/** The facade takes an empty JSON object. */
export type CreateFreeTextKeyRequest = Record<string, never>;

/** Read and revoke share the same request shape (guide: "Request fields are the same as the read-key endpoint"). */
export interface FreeTextKeyRefRequest {
  key_id: string;
}

/** "256-bit AES key ... Base64-encoded raw key material" -> must decode to exactly 32 bytes. */
export const base64Aes256Key = z.string().refine(
  (v) => {
    const bytes = Buffer.from(v, 'base64');
    return bytes.length === 32 && bytes.toString('base64') === v;
  },
  { message: 'key must be canonical Base64 of exactly 32 bytes (256-bit)' },
);

export const freeTextKeyDataSchema = z.object({
  tenant_id: z.string(),
  key_id: z.uuid(),
  key: base64Aes256Key,
  algorithm: z.literal('AES-256-GCM'),
  status: z.literal('ACTIVE'),
  created_at: isoDateTime,
});
export type FreeTextKeyData = z.infer<typeof freeTextKeyDataSchema>;
export const FREE_TEXT_KEY_DATA_KEYS = [
  'algorithm',
  'created_at',
  'key',
  'key_id',
  'status',
  'tenant_id',
] as const;

export const revokeFreeTextKeyDataSchema = z.object({
  tenant_id: z.string(),
  key_id: z.uuid(),
  status: z.literal('REVOKED'),
  revoked_at: isoDateTime,
});
export type RevokeFreeTextKeyData = z.infer<typeof revokeFreeTextKeyDataSchema>;
export const REVOKE_FREE_TEXT_KEY_DATA_KEYS = ['key_id', 'revoked_at', 'status', 'tenant_id'] as const;
