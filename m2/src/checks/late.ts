/**
 * Which per-API cases depend on staging's auto-approval of a suite account (2026-10-24: approval took 8–20 min in run
 * qa-m2-20261024t134344). They are declared in m2/tests/zz-late/ instead of m2/tests/per-api/, so Playwright (which
 * queues files in path order) runs them after every other M2 test — by then the accounts that the worker-start warm-up
 * onboarded (Accounts.warmUp) have usually been approved, and no worker sits idle waiting early in the run.
 * Only the ORDER changes: the case IDs, titles, runners and assertions are the same.
 */
import type { AnyCase } from '../../scripts/m2-all-cases';
import { APPROVED_FIRST, suiteStateFor } from '../../scripts/m2-code-evidence';
import { groupOf } from '../../scripts/m2-inventory';
import { apiById } from '../design';
import { placeholdersIn } from './request-builder';

/** Placeholders whose values come from approved suite accounts (connected pair, invite, chat). */
const APPROVAL_PLACEHOLDERS = ['CONVERSATION_ID', 'REQUEST_ID', 'MESSAGE_TIME_TOKEN'];

/** Checks whose runner picks its caller through callerFor() (and so through the route's account state). */
const CALLER_CHECKS = [
  'POS',
  'IDOR',
  'PARAM',
  'BODY',
  'STATE',
  'REPEAT',
  'CONTRACT',
  'FIELD',
  'GATE',
  'PIIDOWN',
  'DB-SAVE',
  'DB-REFUSE',
  'DB-ISOL',
];

/** True when the design lets the case run (blockIfOpen does not skip it). */
const runnable = (c: AnyCase) => !c.na && c.status === 'NOT RUN';

/** True for a runnable per-API case that needs an approved suite account (and so runs last). */
export function runsLate(c: AnyCase): boolean {
  if (!runnable(c) || !c.apis[0]) return false;
  const api = apiById(c.apis[0]);
  const group = groupOf(api.id).key;
  if (c.check === 'EXPOSE') return group !== 'G10' && group !== 'G7'; // connected pair
  if (c.check === 'CACHE') return group !== 'G1'; // connected pair
  if (!CALLER_CHECKS.includes(c.check ?? '')) return false;
  const state = suiteStateFor(api.id);
  if (state === 'approved' || state === 'deactivated' || APPROVED_FIRST[api.id]) return true;
  return placeholdersIn(api).some((p) => APPROVAL_PLACEHOLDERS.includes(p));
}
