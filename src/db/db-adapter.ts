/**
 * Database adapter interface.
 *
 * The integration guide does NOT document the PII service's database technology or schema. Instead of
 * guessing, the framework defines this small interface; `db-client.ts` provides PostgreSQL and MySQL
 * implementations selected by DB_ENGINE, and the actual SQL lives in a team-supplied catalog file
 * (see docs/database-setup.md). Tests only talk to PiiRepository, never to SQL directly.
 */

export type DbEngine = 'postgres' | 'mysql';

export interface DbAdapter {
  readonly engine: DbEngine;
  /** Run a parameterized, read-only query. `params` are bound by the driver — never string-concatenated. */
  query<TRow = Record<string, unknown>>(sql: string, params: readonly unknown[]): Promise<TRow[]>;
  close(): Promise<void>;
}

export class DbConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbConfigError';
  }
}

const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge|call|copy|replace|lock)\b/i;

/**
 * Defence in depth (the DB user should ALSO be read-only, and sessions are set read-only):
 * only single SELECT / WITH statements are allowed through the automation layer.
 */
export function assertReadOnlySql(sql: string): void {
  const withoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .trim();
  const statement = withoutComments.replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(statement)) {
    throw new DbConfigError(
      'Only read-only SELECT/WITH queries are permitted in the automation SQL catalog.',
    );
  }
  if (statement.includes(';')) {
    throw new DbConfigError('Multiple SQL statements in one catalog query are not permitted.');
  }
  if (FORBIDDEN_KEYWORDS.test(statement)) {
    throw new DbConfigError(
      'Catalog query contains a data-modifying keyword; only read-only queries are permitted.',
    );
  }
}
