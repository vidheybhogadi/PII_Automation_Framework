/**
 * DB-level checks (read-only PII DB): which PII user_id to look up, and value-free snapshot comparisons.
 */
import { expect } from '@playwright/test';
import type { UserSession } from '../auth/session';
import type { M2Config } from '../config/m2-config';
import type { Snapshot } from '../db/pii-db';
import { blockPrereq, PREREQ } from '../prereq';

/** The PII user_id of an app account — only once Dev confirms the mapping (M2Q-37). */
export function piiUserIdFor(s: UserSession, config: M2Config): string {
  if (config.piiUserIdSource !== 'app-id' || !s.userId)
    blockPrereq(PREREQ.piiUserId.id, PREREQ.piiUserId.reason);
  return s.userId;
}

/** PII DB field names (M1 schema) for inventory fields. */
export const DB_FIELD: Record<string, string> = { NAME: 'NAME', EMAIL: 'EMAIL', PHONE: 'PHONE' };

/** Same records (count + ciphertext hash + updated time) for the given fields — value-free messages. */
export function expectUnchanged(
  before: Snapshot,
  after: Snapshot,
  fields: string[] | 'all',
  what: string,
): void {
  const keys = fields === 'all' ? [...new Set([...Object.keys(before), ...Object.keys(after)])] : fields;
  for (const f of keys) {
    const b = before[f];
    const a = after[f];
    expect(a?.count ?? 0, `${what}: number of ${f} records unchanged`).toBe(b?.count ?? 0);
    expect(
      JSON.stringify(a?.hashes ?? []) === JSON.stringify(b?.hashes ?? []),
      `${what}: ${f} ciphertext unchanged`,
    ).toBe(true);
    expect(
      JSON.stringify(a?.updatedAt ?? []) === JSON.stringify(b?.updatedAt ?? []),
      `${what}: ${f} not rewritten (updated time unchanged)`,
    ).toBe(true);
  }
}
