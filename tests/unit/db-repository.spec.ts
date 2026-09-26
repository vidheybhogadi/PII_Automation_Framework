/** UNIT — DB layer safety and catalog contract, using an in-memory fake adapter (no database). */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../src/config/config';
import { DbConfigError, assertReadOnlySql, type DbAdapter } from '../../src/db/db-adapter';
import { createDbAdapter } from '../../src/db/db-client';
import {
  DbQueryNotConfiguredError,
  PiiRepository,
  loadQueryCatalog,
  parseQueryCatalog,
} from '../../src/db/pii-repository';

class FakeAdapter implements DbAdapter {
  readonly engine = 'postgres' as const;
  readonly calls: { sql: string; params: readonly unknown[] }[] = [];
  constructor(private readonly rows: Record<string, unknown>[]) {}
  async query<T>(sql: string, params: readonly unknown[]): Promise<T[]> {
    this.calls.push({ sql, params });
    return this.rows as T[];
  }
  async close(): Promise<void> {}
}

const catalog = parseQueryCatalog({
  engine: 'postgres',
  queries: {
    findPiiRecords: {
      sql: 'SELECT a AS tenant_id FROM t WHERE x = $1 AND y = $2 AND z = $3',
      params: ['tenant_id', 'user_id', 'field'],
    },
    findTransientPhone: null,
  },
});

test.describe('UNIT DB layer', () => {
  test('UT-DB-001 Only single read-only queries (SELECT / WITH) are allowed', () => {
    assertReadOnlySql('SELECT 1');
    assertReadOnlySql('  -- comment\n WITH x AS (SELECT 1) SELECT * FROM x;');
    assertReadOnlySql('SELECT updated_at FROM t'); // column names containing keywords are fine
    for (const sql of [
      'DELETE FROM t',
      'SELECT 1; DROP TABLE t',
      'UPDATE t SET a=1',
      'WITH x AS (DELETE FROM t RETURNING *) SELECT 1',
      'INSERT INTO t VALUES (1)',
    ]) {
      expect(() => assertReadOnlySql(sql), sql).toThrow(DbConfigError);
    }
  });

  test('UT-DB-002 Query values are passed as parameters, never pasted into the SQL', async () => {
    const adapter = new FakeAdapter([
      {
        tenant_id: 't',
        user_id: 'u',
        field: 'EMAIL',
        encrypted_value: Buffer.from([1, 2]),
        key_version: '3',
      },
    ]);
    const repo = new PiiRepository(adapter, catalog);
    const rows = await repo.findPiiRecords('t', 'u', 'EMAIL');
    expect(adapter.calls[0]?.params).toEqual(['t', 'u', 'EMAIL']);
    expect(adapter.calls[0]?.sql).not.toContain("'t'");
    expect(rows[0]?.key_version).toBe(3); // bigint-as-string coerced
  });

  test('UT-DB-003 A query result missing expected columns fails, naming only the columns', async () => {
    const repo = new PiiRepository(
      new FakeAdapter([{ tenant_id: 't', secret_plain: 'jane@corp.example' }]),
      catalog,
    );
    const err = await repo.findPiiRecords('t', 'u', 'EMAIL').catch((e: Error) => e);
    expect(err).toBeInstanceOf(DbConfigError);
    expect((err as Error).message).toContain('encrypted_value');
    expect((err as Error).message).not.toContain('jane@corp.example');
  });

  test('UT-DB-004 A missing database query fails with a clear message', async () => {
    const repo = new PiiRepository(new FakeAdapter([]), catalog);
    expect(repo.has('findTransientPhone')).toBe(false);
    await expect(repo.findTransientPhone('id')).rejects.toBeInstanceOf(DbQueryNotConfiguredError);
  });

  test('UT-DB-005 The query file is checked for unknown parameters, write statements and the wrong database type', () => {
    expect(() =>
      parseQueryCatalog({
        engine: 'postgres',
        queries: { findFreeTextKey: { sql: 'SELECT 1', params: ['password'] } },
      }),
    ).toThrow(/unknown params/);
    expect(() =>
      parseQueryCatalog({
        engine: 'postgres',
        queries: { findFreeTextKey: { sql: 'DELETE FROM k', params: [] } },
      }),
    ).toThrow(DbConfigError);
    expect(
      () => new PiiRepository(new FakeAdapter([]), parseQueryCatalog({ engine: 'mysql', queries: {} })),
    ).toThrow(/DB_ENGINE/);
  });

  test('UT-DB-006 The example query file is valid and contains only read-only placeholders', () => {
    const file = path.resolve(__dirname, '../../config/db-queries.example.json');
    expect(() => JSON.parse(readFileSync(file, 'utf8'))).not.toThrow();
    expect(loadQueryCatalog(file).engine).toBe('postgres');
    expect(() => loadQueryCatalog(undefined)).toThrow(/DB_QUERIES_FILE/);
  });

  test('UT-DB-007 Database access fails clearly when the database is not set up', () => {
    expect(() => createDbAdapter(loadConfig({}))).toThrow(/DB_ENGINE=none/);
    const err = (() => {
      try {
        createDbAdapter(loadConfig({ DB_ENGINE: 'postgres', DB_HOST: 'h' }));
      } catch (e) {
        return e as Error;
      }
      return undefined;
    })();
    expect(err?.message).toContain('DB_NAME');
    expect(err?.message).toContain('DB_PASSWORD');
  });

  test('UT-DB-008 A query that still contains a PENDING_ placeholder counts as not configured and never runs', async () => {
    const adapter = new FakeAdapter([]);
    const repo = new PiiRepository(
      adapter,
      parseQueryCatalog({
        engine: 'postgres',
        queries: {
          findAuditEventsByRequestId: {
            sql: 'SELECT PENDING_EVENT_TYPE_COL AS event_type FROM PENDING_AUDIT_TABLE WHERE PENDING_REQUEST_ID_COL = $1',
            params: ['request_id'],
          },
        },
      }),
    );
    expect(repo.has('findAuditEventsByRequestId')).toBe(false);
    await expect(repo.findAuditEventsByRequestId('r')).rejects.toBeInstanceOf(DbQueryNotConfiguredError);
    expect(adapter.calls).toHaveLength(0);
  });
});
