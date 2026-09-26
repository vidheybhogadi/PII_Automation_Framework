/**
 * PiiRepository — the only DB API tests use.
 *
 * HOW IT WORKS
 *   The PII service's schema is NOT documented, so this file contains NO table or column names.
 *   The team supplies SQL in a JSON "catalog" (DB_QUERIES_FILE; template: config/db-queries.example.json).
 *   Each named query must return rows using the COLUMN ALIASES defined by the row schemas below — the
 *   framework's contract. Example (PostgreSQL, illustrative only — real names come from the backend team):
 *
 *     SELECT t.<tenant col> AS tenant_id, t.<user col> AS user_id, ... FROM <table> t WHERE ... = $1
 *
 *   Named params (e.g. ["tenant_id","user_id","field"]) are bound in the listed order, using the engine's
 *   native placeholder style ($1,$2 for PostgreSQL; ? for MySQL).
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { formatZodIssues } from '../assertions/response.assertions';
import { DbConfigError, assertReadOnlySql, type DbAdapter } from './db-adapter';

// ---- Catalog ------------------------------------------------------------------------------------
export const QUERY_NAMES = [
  'findPiiRecords',
  'findTransientPhone',
  'findFreeTextKey',
  'findAuditEventsByRequestId',
] as const;
export type QueryName = (typeof QUERY_NAMES)[number];

/** Params each query receives (documented in docs/database-setup.md). */
export const QUERY_PARAMS: Record<QueryName, readonly string[]> = {
  findPiiRecords: ['tenant_id', 'user_id', 'field'],
  findTransientPhone: ['transient_id'],
  findFreeTextKey: ['key_id'],
  findAuditEventsByRequestId: ['request_id'],
};

const catalogEntrySchema = z
  .object({ sql: z.string().min(1), params: z.array(z.string()) })
  .nullable()
  .optional();

const catalogSchema = z.object({
  engine: z.enum(['postgres', 'mysql']),
  queries: z.object(
    Object.fromEntries(QUERY_NAMES.map((n) => [n, catalogEntrySchema])) as Record<
      QueryName,
      typeof catalogEntrySchema
    >,
  ),
});
export type QueryCatalog = z.infer<typeof catalogSchema>;

export function parseQueryCatalog(json: unknown): QueryCatalog {
  const parsed = catalogSchema.safeParse(json);
  if (!parsed.success) {
    throw new DbConfigError(`Invalid DB query catalog:\n${formatZodIssues(parsed.error)}`);
  }
  for (const name of QUERY_NAMES) {
    const entry = parsed.data.queries[name];
    if (!entry) continue;
    assertReadOnlySql(entry.sql);
    const expected = QUERY_PARAMS[name];
    const unknown = entry.params.filter((p) => !expected.includes(p));
    if (unknown.length > 0) {
      throw new DbConfigError(
        `Query "${name}" uses unknown params ${unknown.join(', ')}; allowed: ${expected.join(', ')}`,
      );
    }
  }
  return parsed.data;
}

export function loadQueryCatalog(filePath: string | undefined): QueryCatalog {
  if (!filePath) {
    throw new DbConfigError(
      'DB_QUERIES_FILE is not set. Copy config/db-queries.example.json to config/db-queries.json, fill in the ' +
        'SQL confirmed by the PII backend team, and set DB_QUERIES_FILE=config/db-queries.json.',
    );
  }
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    throw new DbConfigError(`DB_QUERIES_FILE "${filePath}" could not be read.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DbConfigError(`DB_QUERIES_FILE "${filePath}" is not valid JSON.`);
  }
  return parseQueryCatalog(json);
}

// ---- Row contracts (column aliases the catalog SQL must return) ---------------------------------
const bytesOrText = z.union([z.instanceof(Buffer), z.string()]);
const timestamp = z.union([z.date(), z.string()]);
const intLike = z.union([z.number(), z.string().regex(/^-?\d+$/), z.bigint()]).transform((v) => Number(v));
const boolLike = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => v === true || v === 1);

export const piiRecordRowSchema = z.object({
  tenant_id: z.string(),
  user_id: z.string(),
  field: z.string(),
  /** The persisted encrypted payload (ciphertext/envelope). */
  encrypted_value: bytesOrText,
  /** Optional: DEK version stored with the row, compared with the API's informational key_version. */
  key_version: intLike.nullable().optional(),
});
export type PiiRecordRow = z.infer<typeof piiRecordRowSchema>;

export const transientPhoneRowSchema = z.object({
  tenant_id: z.string(),
  caller_id: z.string().nullable().optional(),
  encrypted_value: bytesOrText,
  expires_at: timestamp,
  /** true once promoted/consumed. (If the service deletes rows on consume, the query returns no row.) */
  is_consumed: boolLike,
});
export type TransientPhoneRow = z.infer<typeof transientPhoneRowSchema>;

export const freeTextKeyRowSchema = z.object({
  tenant_id: z.string(),
  caller_id: z.string().nullable().optional(),
  status: z.string(),
  revoked_at: timestamp.nullable().optional(),
  /** Optional: stored (wrapped/encrypted) key material, used for a "not stored raw" check. */
  encrypted_key_material: bytesOrText.nullable().optional(),
});
export type FreeTextKeyRow = z.infer<typeof freeTextKeyRowSchema>;

export const auditEventRowSchema = z.object({ event_type: z.string() });
export type AuditEventRow = z.infer<typeof auditEventRowSchema>;

export class DbQueryNotConfiguredError extends DbConfigError {
  constructor(readonly queryName: QueryName) {
    super(
      `DB query "${queryName}" is not defined in the SQL catalog (DB_QUERIES_FILE). Obtain the correct SQL ` +
        `from the PII backend team; required column aliases are listed in docs/database-setup.md.`,
    );
    this.name = 'DbQueryNotConfiguredError';
  }
}

export class PiiRepository {
  constructor(
    private readonly adapter: DbAdapter,
    private readonly catalog: QueryCatalog,
  ) {
    if (catalog.engine !== adapter.engine) {
      throw new DbConfigError(`SQL catalog is for "${catalog.engine}" but DB_ENGINE is "${adapter.engine}".`);
    }
  }

  has(name: QueryName): boolean {
    return Boolean(this.catalog.queries[name]);
  }

  private async run<S extends z.ZodType>(
    name: QueryName,
    args: Record<string, unknown>,
    rowSchema: S,
  ): Promise<z.infer<S>[]> {
    const entry = this.catalog.queries[name];
    if (!entry) throw new DbQueryNotConfiguredError(name);
    const params = entry.params.map((p) => args[p]);
    const rows = await this.adapter.query(entry.sql, params);
    return rows.map((row, index) => {
      const parsed = rowSchema.safeParse(row);
      if (!parsed.success) {
        // Column names/issue codes only — never row values.
        throw new DbConfigError(
          `Row ${index} of "${name}" does not match the required column aliases:\n${formatZodIssues(parsed.error)}`,
        );
      }
      return parsed.data;
    });
  }

  findPiiRecords(tenantId: string, userId: string, field: string): Promise<PiiRecordRow[]> {
    return this.run('findPiiRecords', { tenant_id: tenantId, user_id: userId, field }, piiRecordRowSchema);
  }

  async findTransientPhone(transientId: string): Promise<TransientPhoneRow | undefined> {
    const rows = await this.run('findTransientPhone', { transient_id: transientId }, transientPhoneRowSchema);
    return rows[0];
  }

  async findFreeTextKey(keyId: string): Promise<FreeTextKeyRow | undefined> {
    const rows = await this.run('findFreeTextKey', { key_id: keyId }, freeTextKeyRowSchema);
    return rows[0];
  }

  findAuditEventsByRequestId(requestId: string): Promise<AuditEventRow[]> {
    return this.run('findAuditEventsByRequestId', { request_id: requestId }, auditEventRowSchema);
  }

  close(): Promise<void> {
    return this.adapter.close();
  }
}
