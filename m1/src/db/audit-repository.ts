/**
 * AuditRepository — read-only access to the PII service's audit trail.
 *
 * Per the PII-service design (tech doc v3) every write, read, search and refused call is recorded as one document in
 * MongoDB `audit_trails` (kept 7 days), WITHOUT values or search terms. QA has no access to it yet (BQ-30), so no
 * implementation exists: the `audit` fixture marks every audit test BLOCKED (BQ-30) until one is configured.
 *
 * When Dev grants read-only access, add a MongoDB implementation of this interface (the `mongodb` driver as an
 * optional dependency, like `pg`), connection settings in `.env` only, and `find` by request ID only — never
 * insert, update or delete. Entries are validated against `auditEntrySchema`; unknown fields are kept so a test can
 * search the WHOLE entry for leaked values.
 */
import { z } from 'zod';

/** Why audit tests are blocked while no audit source is configured (docs/backend-open-questions.md). */
export const AUDIT_BLOCKER = {
  id: 'BQ-30',
  reason:
    'No read-only access to the PII audit trail (MongoDB audit_trails) yet, and its format is not confirmed',
} as const;

const timestamp = z.union([z.date(), z.string()]);

/** Design v3 audit document. Only `action` and `status` are required; everything else is checked by the tests. */
export const auditEntrySchema = z.looseObject({
  request_id: z.string().optional(),
  caller_service: z.string().optional(),
  action: z.string(),
  status: z.string(),
  field_name: z.string().nullable().optional(),
  user_ids: z.array(z.string()).optional(),
  fields_requested: z.array(z.string()).optional(),
  fields_released: z.array(z.string()).optional(),
  key_versions_used: z.array(z.number()).optional(),
  result_count: z.number().nullable().optional(),
  created_at: timestamp.optional(),
  expires_at: timestamp.optional(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export interface AuditRepository {
  /**
   * All audit entries for one request. The request ID is the X-Request-Id QA sends to the facade; whether the
   * facade passes it on as the PII service's `request_id` is not confirmed (BQ-30).
   */
  findByRequestId(requestId: string): Promise<AuditEntry[]>;
  close(): Promise<void>;
}
