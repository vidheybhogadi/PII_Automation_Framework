/**
 * Read-only view of the Aisle app DB (aisleweb) for M2 DB checks — M2Q-33 answer (QA lead, 2026-10-24): the same
 * server and read-only credentials as the configured PII DB (.env DB_*), database name `aisleweb`
 * (M2_APP_DB_NAME), read-only, restricted to the suite's OWN synthetic accounts.
 *
 * aisleweb holds real users' data, so every query is guarded twice before anything is sent:
 *  1. assertSuiteFiltered — the catalog query's first parameter is `suite_user_ids` and its (last, main) WHERE clause
 *     filters `<alias>.user_id = ANY($1::bigint[])`, joined with AND only (no OR / UNION / sub-select after it);
 *  2. assertSuiteIds — the ids bound to $1 are a non-empty list of accounts the SUITE created in this run (never
 *     Dev-provided accounts), and any `conversation_id` parameter is an id the suite's own accounts made.
 * Queries live in m2/config/db-queries.json (`aislewebQueries`) and select only booleans and counts: synthetic values
 * are bound as parameters for comparison, never read back. core/db runs each one in its own BEGIN READ ONLY
 * transaction (single SELECT only, bound parameters). Table / column names come from the Aisle code
 * (db/schema.rb, develop_new 944f76a) — from code, confirm with Dev.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createDbAdapter } from '../../../core/db/db-client';
import type { DbAdapter } from '../../../core/db/db-adapter';
import type { M2Config } from '../config/m2-config';
import { ROOT } from '../design';

export interface AppQuery {
  sql: string;
  params: string[];
}

interface Catalog {
  aislewebQueries?: Record<string, AppQuery>;
}

/** Thrown when an aisleweb query or its ids would not be limited to the suite's own accounts. */
export class AppDbGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppDbGuardError';
  }
}

const SUITE_PARAM = 'suite_user_ids';
const SUITE_FILTER = /\b(?:[a-z_][a-z0-9_]*\.)?user_id\s*=\s*any\s*\(\s*\$1::bigint\[\]\s*\)/i;

/** Refuse a query that is not filtered by the suite's own user ids (static check of the SQL text). */
export function assertSuiteFiltered(name: string, q: AppQuery): void {
  if (q.params[0] !== SUITE_PARAM)
    throw new AppDbGuardError(`aisleweb query "${name}": its first parameter must be ${SUITE_PARAM}`);
  const sql = q.sql.replace(/\s+/g, ' ');
  if (/\b(union|intersect|except)\b/i.test(sql))
    throw new AppDbGuardError(`aisleweb query "${name}": set operators are not allowed`);
  const wheres = [...sql.matchAll(/\bwhere\b/gi)];
  const main = wheres.length ? sql.slice(wheres[wheres.length - 1]!.index!) : '';
  // FILTER (WHERE …) aggregates come before the main WHERE; the main one is the last and ends the statement (after
  // FROM, balanced brackets, no sub-select).
  const balanced = (main.match(/\(/g) ?? []).length === (main.match(/\)/g) ?? []).length;
  if (!main || !balanced || /\b(select|from|join)\b/i.test(main))
    throw new AppDbGuardError(`aisleweb query "${name}": no main WHERE clause at the end of the query`);
  if (!SUITE_FILTER.test(main))
    throw new AppDbGuardError(`aisleweb query "${name}": WHERE must filter user_id = ANY($1::bigint[])`);
  if (/\bor\b/i.test(main))
    throw new AppDbGuardError(
      `aisleweb query "${name}": OR in the WHERE clause could widen the suite filter`,
    );
}

/**
 * Refuse ids that are not the suite's own: $1 must be a non-empty list of numeric user ids of accounts the suite
 * created; a `conversation_id` must be an id the suite's own accounts made. Messages never print the ids.
 */
export function assertSuiteIds(
  name: string,
  q: AppQuery,
  args: readonly unknown[],
  own: { userIds: ReadonlySet<string>; ownedIds: ReadonlySet<string> },
): void {
  const ids = args[0];
  if (!Array.isArray(ids) || ids.length === 0)
    throw new AppDbGuardError(`aisleweb query "${name}": no suite user ids given`);
  for (const id of ids)
    if (typeof id !== 'string' || !/^\d+$/.test(id) || !own.userIds.has(id))
      throw new AppDbGuardError(
        `aisleweb query "${name}": an id is not a suite-created account’s user id (refused)`,
      );
  q.params.forEach((p, i) => {
    if (p === 'conversation_id' && !own.ownedIds.has(String(args[i])))
      throw new AppDbGuardError(
        `aisleweb query "${name}": the conversation is not one the suite’s accounts made (refused)`,
      );
  });
  if (args.length !== q.params.length)
    throw new AppDbGuardError(`aisleweb query "${name}": expected ${q.params.length} parameters`);
}

export class AppDb {
  private constructor(
    private readonly adapter: DbAdapter,
    private readonly queries: Record<string, AppQuery>,
  ) {}

  /** Undefined when the DB is not configured here (the caller blocks with M2Q-16). */
  static open(config: M2Config): AppDb | undefined {
    if (config.db.engine === 'none' || !config.db.host || !config.db.user || !config.db.password)
      return undefined;
    const catalog = JSON.parse(readFileSync(path.resolve(ROOT, config.db.queriesFile), 'utf8')) as Catalog;
    const queries = catalog.aislewebQueries ?? {};
    // Every catalog query is checked once up front: a query without the suite filter is never usable.
    for (const [name, q] of Object.entries(queries)) assertSuiteFiltered(name, q);
    return new AppDb(createDbAdapter({ db: { ...config.db, database: config.appDbName } }), queries);
  }

  private reach: boolean | undefined;

  /** One read-only SELECT 1, cached per worker. */
  async reachable(): Promise<boolean> {
    if (this.reach === undefined) {
      try {
        await this.adapter.query('SELECT 1 AS one', []);
        this.reach = true;
      } catch {
        this.reach = false;
      }
    }
    return this.reach;
  }

  /** Run catalog query `name` for the suite's own accounts only (both guards, then BEGIN READ ONLY). */
  async query<TRow = Record<string, unknown>>(
    name: string,
    args: readonly unknown[],
    own: { userIds: ReadonlySet<string>; ownedIds: ReadonlySet<string> },
  ): Promise<TRow[]> {
    const q = this.queries[name];
    if (!q) throw new AppDbGuardError(`aisleweb query "${name}" is not in the SQL catalog`);
    assertSuiteFiltered(name, q);
    assertSuiteIds(name, q, args, own);
    return this.adapter.query<TRow>(q.sql, args);
  }

  close(): Promise<void> {
    return this.adapter.close();
  }
}

/** A boolean column of a guarded row: only `true` counts (NULL — no linked row — is false). */
export const isTrue = (v: unknown) => v === true;
