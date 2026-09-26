/**
 * Run and test identifiers.
 *
 * Every piece of data a run creates carries the run ID, e.g. user "qa-auto-20260926t101500-9f3a-w1-4-email".
 * That makes test data:
 *   - traceable (anyone can tell automation data from anything else and find the run that created it),
 *   - collision-free across parallel workers (worker index) and repeated runs (timestamp + random suffix).
 */
import { randomBytes } from 'node:crypto';

export function generateRunId(prefix: string, now: Date = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '')
    .toLowerCase(); // 20260926t101500
  return `${prefix}-${stamp}-${randomBytes(2).toString('hex')}`;
}

/** Characters allowed in generated identifiers (conservative: letters, digits, "-", "."). */
export const SAFE_ID_PATTERN = /^[a-z0-9.-]+$/;
