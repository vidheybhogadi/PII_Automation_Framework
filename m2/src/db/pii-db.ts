/**
 * Read-only view of the staging PII DB for M2 DB checks. Uses core/db (every query in its own BEGIN READ ONLY
 * transaction, single SELECT only, bound parameters) and the M2 SELECT catalog m2/config/db-queries.json, which
 * selects only field names, counts and md5 hashes of the ciphertext — never values, ciphertext or keys.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createDbAdapter } from '../../../core/db/db-client';
import type { DbAdapter } from '../../../core/db/db-adapter';
import type { M2Config } from '../config/m2-config';
import { ROOT } from '../design';

export interface PiiRow {
  field: string;
  ciphertextHash: string;
  updatedAt: string;
}

/** One user's PII records: per field the number of rows and their ciphertext hashes (order-stable). */
export type Snapshot = Record<string, { count: number; hashes: string[]; updatedAt: string[] }>;

interface Catalog {
  engine: string;
  queries: Record<string, { sql: string; params: string[] }>;
}

export class PiiDb {
  private constructor(
    private readonly adapter: DbAdapter,
    private readonly catalog: Catalog,
    readonly tenant: string,
  ) {}

  /** Undefined when the DB is not configured here (the caller blocks with M2Q-16). */
  static open(config: M2Config): PiiDb | undefined {
    if (config.db.engine === 'none' || !config.db.host || !config.db.user || !config.db.password)
      return undefined;
    const catalog = JSON.parse(readFileSync(path.resolve(ROOT, config.db.queriesFile), 'utf8')) as Catalog;
    return new PiiDb(createDbAdapter({ db: config.db }), catalog, config.piiTenant);
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

  async rows(userId: string): Promise<PiiRow[]> {
    const q = this.catalog.queries.piiRecordsForUser!;
    const raw = await this.adapter.query<Record<string, unknown>>(q.sql, [this.tenant, userId]);
    return raw.map((r) => ({
      field: String(r.field),
      ciphertextHash: String(r.ciphertext_hash),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at ?? ''),
    }));
  }

  async snapshot(userId: string): Promise<Snapshot> {
    const out: Snapshot = {};
    for (const r of await this.rows(userId)) {
      const s = (out[r.field] ??= { count: 0, hashes: [], updatedAt: [] });
      s.count++;
      s.hashes.push(r.ciphertextHash);
      s.updatedAt.push(r.updatedAt);
    }
    return out;
  }

  close(): Promise<void> {
    return this.adapter.close();
  }
}

/** Value-free summary of a snapshot for annotations: "NAME×1, PHONE×1". */
export const snapshotSummary = (s: Snapshot) =>
  Object.keys(s).length
    ? Object.entries(s)
        .map(([f, v]) => `${f}×${v.count}`)
        .join(', ')
    : 'no records';
