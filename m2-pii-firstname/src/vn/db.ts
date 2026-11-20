/**
 * Read-only access to the vernac app DB (desiapp_production — vernac TEST data, QA lead 2026-11-11) and the PII DB
 * (pii) for the vernac first-name cases. Same server and read-only credentials as .env DB_*; every query runs in its
 * own BEGIN READ ONLY transaction (core/db: single SELECT, bound parameters, errors without credentials or rows).
 *
 * Guards in front of every query (m2-pii-firstname/config/db-queries.vernac.json):
 *  - kind "numbers": the only parameter must be exactly the nine team numbers;
 *  - kind "config": app ids of the four in-scope apps only (configuration rows, no user data);
 *  - kind "suite": $1 must be the discovered suite user ids (non-empty, numeric, all known) and the user parameter
 *    named by `userParam` must be one of them; the SQL must filter by = ANY($1::…[]).
 * Names are compared as booleans; values are never selected.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createDbAdapter } from '../../../core/db/db-client';
import type { DbAdapter } from '../../../core/db/db-adapter';
import type { M2Config } from '../../../m2/src/config/m2-config';
import { TEAM_NUMBERS, VN_APPS } from './guard';

export const VN_DB_QUERIES = 'm2-pii-firstname/config/db-queries.vernac.json';
const ROOT = path.resolve(__dirname, '../../..');

type Kind = 'numbers' | 'config' | 'suite';
interface VnQuery {
  kind: Kind;
  sql: string;
  userParam?: number;
}
interface Catalog {
  appQueries: Record<string, VnQuery>;
  piiQueries: Record<string, VnQuery>;
}

export class VnDbGuardError extends Error {
  constructor(message: string) {
    super(`Vernac DB query refused: ${message}`);
    this.name = 'VnDbGuardError';
  }
}

export function loadVnCatalog(root: string = ROOT): Catalog {
  return JSON.parse(readFileSync(path.join(root, VN_DB_QUERIES), 'utf8')) as Catalog;
}

/** Static check of a catalog query (also run by the self-tests). */
export function assertVnQuery(name: string, q: VnQuery): void {
  const sql = q.sql.replace(/\s+/g, ' ');
  if (!/^select\b/i.test(sql.trim())) throw new VnDbGuardError(`${name}: only SELECT`);
  if (/\b(insert|update|delete|drop|truncate|alter|grant|union)\b/i.test(sql.replace(/'[^']*'/g, '')))
    throw new VnDbGuardError(`${name}: forbidden keyword`);
  if (q.kind === 'suite' && !/=\s*any\s*\(\s*\$1::(bigint|text)\[\]\s*\)/i.test(sql))
    throw new VnDbGuardError(`${name}: a suite query must filter by = ANY($1::…[])`);
  if (q.kind === 'numbers' && !/=\s*any\s*\(\s*\$1::text\[\]\s*\)/i.test(sql))
    throw new VnDbGuardError(`${name}: a numbers query must filter by = ANY($1::text[])`);
  if (q.kind === 'config' && !/=\s*any\s*\(\s*\$1::int\[\]\s*\)/i.test(sql))
    throw new VnDbGuardError(`${name}: a config query must filter by = ANY($1::int[])`);
}

/** Runtime check of the bound arguments. Messages never print ids or numbers. */
export function assertVnArgs(
  name: string,
  q: VnQuery,
  args: readonly unknown[],
  suite: ReadonlySet<string>,
): void {
  const first = args[0];
  if (q.kind === 'numbers') {
    const ok =
      Array.isArray(first) &&
      first.length === TEAM_NUMBERS.length &&
      first.every((n) => TEAM_NUMBERS.includes(String(n).replace(/^\+91/, '')));
    if (!ok || args.length !== 1) throw new VnDbGuardError(`${name}: only the nine team numbers`);
    return;
  }
  if (q.kind === 'config') {
    const ids = Object.values(VN_APPS) as number[];
    if (!Array.isArray(first) || !first.length || !first.every((a) => ids.includes(Number(a))))
      throw new VnDbGuardError(`${name}: in-scope app ids only`);
    return;
  }
  if (!Array.isArray(first) || first.length === 0)
    throw new VnDbGuardError(`${name}: no suite user ids given`);
  for (const id of first)
    if (typeof id !== 'string' || !/^\d+$/.test(id) || !suite.has(id))
      throw new VnDbGuardError(`${name}: an id is not a suite team user’s id`);
  if (q.userParam && !suite.has(String(args[q.userParam - 1])))
    throw new VnDbGuardError(`${name}: the user parameter is not a suite team user`);
}

export class VnDb {
  private constructor(
    private readonly app: DbAdapter,
    private readonly pii: DbAdapter,
    private readonly catalog: Catalog,
  ) {}

  /** Undefined when DB access is not configured here. */
  static open(m2: M2Config, dbName: string, piiDbName: string): VnDb | undefined {
    if (m2.db.engine === 'none' || !m2.db.host || !m2.db.user || !m2.db.password) return undefined;
    const catalog = loadVnCatalog();
    for (const [n, q] of [...Object.entries(catalog.appQueries), ...Object.entries(catalog.piiQueries)])
      assertVnQuery(n, q);
    return new VnDb(
      createDbAdapter({ db: { ...m2.db, database: dbName } }),
      createDbAdapter({ db: { ...m2.db, database: piiDbName } }),
      catalog,
    );
  }

  /** The suite user ids every "suite" query is limited to (set once by the team discovery). */
  suite: ReadonlySet<string> = new Set();

  private reach: boolean | undefined;
  async reachable(): Promise<boolean> {
    if (this.reach === undefined) {
      try {
        await this.app.query('SELECT 1 AS one', []);
        await this.pii.query('SELECT 1 AS one', []);
        this.reach = true;
      } catch {
        this.reach = false;
      }
    }
    return this.reach;
  }

  async appQuery<T = Record<string, unknown>>(name: string, args: readonly unknown[]): Promise<T[]> {
    const q = this.catalog.appQueries[name];
    if (!q) throw new VnDbGuardError(`${name}: not in the vernac SQL catalog`);
    assertVnQuery(name, q);
    assertVnArgs(name, q, args, this.suite);
    return this.app.query<T>(q.sql, args);
  }

  async piiQuery<T = Record<string, unknown>>(name: string, args: readonly unknown[]): Promise<T[]> {
    const q = this.catalog.piiQueries[name];
    if (!q) throw new VnDbGuardError(`${name}: not in the vernac PII SQL catalog`);
    assertVnQuery(name, q);
    assertVnArgs(name, q, args, this.suite);
    return this.pii.query<T>(q.sql, args);
  }

  async close(): Promise<void> {
    await this.app.close();
    await this.pii.close();
  }
}
