/**
 * Concrete DB adapters. Drivers (`pg`, `mysql2`) are optionalDependencies and are loaded only when
 * DB_ENGINE selects them, so API-only runs never need a database driver or credentials.
 *
 * Safety measures:
 *  - Every session is forced READ ONLY at the database level.
 *  - SQL is validated as a single SELECT/WITH (assertReadOnlySql) before execution.
 *  - Parameters are always bound by the driver.
 *  - Errors are re-thrown WITHOUT connection strings, credentials or row data.
 */
import { createRequire } from 'node:module';
import type { FrameworkConfig } from '../config/config';
import { assertReadOnlySql, DbConfigError, type DbAdapter, type DbEngine } from './db-adapter';

const requireOptional = createRequire(__filename);

function loadDriver<T>(name: string): T {
  try {
    return requireOptional(name) as T;
  } catch {
    throw new DbConfigError(`Database driver "${name}" is not installed. Run: npm install ${name}`);
  }
}

/** Driver error codes are safe to surface; driver messages may contain host/user details, so drop them. */
function safeDbError(engine: DbEngine, error: unknown): Error {
  const code = (error as { code?: unknown }).code;
  return new Error(
    `${engine} query failed (driver code: ${typeof code === 'string' ? code : 'unknown'}). ` +
      'Check DB connectivity/permissions and the SQL catalog (docs/database-setup.md).',
  );
}

// ---- Minimal structural types for the drivers (avoids pulling in @types packages) --------------
interface PgPool {
  query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}
interface PgModule {
  Pool: new (config: Record<string, unknown>) => PgPool;
}
interface MysqlPool {
  query(sql: string, params: unknown[]): Promise<[unknown, unknown]>;
  end(): Promise<void>;
  on(event: 'connection', listener: (conn: { query(sql: string): unknown }) => void): void;
}
interface MysqlModule {
  createPool(config: Record<string, unknown>): MysqlPool;
}

class PostgresAdapter implements DbAdapter {
  readonly engine = 'postgres' as const;
  constructor(private readonly pool: PgPool) {}

  async query<TRow>(sql: string, params: readonly unknown[]): Promise<TRow[]> {
    assertReadOnlySql(sql);
    try {
      const result = await this.pool.query(sql, [...params]);
      return result.rows as TRow[];
    } catch (error) {
      throw safeDbError(this.engine, error);
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

class MysqlAdapter implements DbAdapter {
  readonly engine = 'mysql' as const;
  constructor(private readonly pool: MysqlPool) {}

  async query<TRow>(sql: string, params: readonly unknown[]): Promise<TRow[]> {
    assertReadOnlySql(sql);
    try {
      const [rows] = await this.pool.query(sql, [...params]);
      return rows as TRow[];
    } catch (error) {
      throw safeDbError(this.engine, error);
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

/** Create an adapter from config, or throw an actionable DbConfigError describing what is missing. */
export function createDbAdapter(config: FrameworkConfig): DbAdapter {
  const db = config.db;
  if (db.engine === 'none') {
    throw new DbConfigError(
      'Database validation is not configured (DB_ENGINE=none). The integration guide does not document the ' +
        'PII database; obtain DB_ENGINE, host, read-only credentials and the SQL catalog from the PII backend ' +
        'team / DBA and follow docs/database-setup.md. DB tests fail until this is configured.',
    );
  }
  const required: Record<string, unknown> = {
    DB_HOST: db.host,
    DB_NAME: db.database,
    DB_USER: db.user,
    DB_PASSWORD: db.password,
  };
  const missing = Object.keys(required).filter((name) => !required[name]);
  if (missing.length > 0) {
    throw new DbConfigError(
      `DB_ENGINE=${db.engine} but these settings are missing: ${missing.join(', ')}. ` +
        'Use READ-ONLY credentials (docs/database-setup.md).',
    );
  }

  if (db.engine === 'postgres') {
    const pg = loadDriver<PgModule>('pg');
    const pool = new pg.Pool({
      host: db.host,
      port: db.port ?? 5432,
      database: db.database,
      user: db.user,
      password: db.password?.reveal(),
      ssl: db.ssl ? { rejectUnauthorized: true } : false,
      max: 4,
      connectionTimeoutMillis: db.connectTimeoutMs,
      // Server-side guarantee: every transaction in this session is read-only.
      options: '-c default_transaction_read_only=on',
      application_name: 'pii-api-automation',
    });
    return new PostgresAdapter(pool);
  }

  const mysql = loadDriver<MysqlModule>('mysql2/promise');
  const pool = mysql.createPool({
    host: db.host,
    port: db.port ?? 3306,
    database: db.database,
    user: db.user,
    password: db.password?.reveal(),
    ssl: db.ssl ? { rejectUnauthorized: true } : undefined,
    connectionLimit: 4,
    connectTimeout: db.connectTimeoutMs,
  });
  pool.on('connection', (conn) => {
    conn.query('SET SESSION TRANSACTION READ ONLY');
  });
  return new MysqlAdapter(pool);
}
