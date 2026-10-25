/**
 * Per-API cases that need an APPROVED suite account — approved-state routes, the deactivated-state account, the
 * suite's connected pair (EXPOSE, CACHE, conversation / chat routes) and invites (m2/src/checks/late.ts runsLate).
 * Staging's auto-approval took 8–20 min in run qa-m2-20261024t134344, so these cases are declared here, in the
 * folder Playwright queues last, instead of in m2/tests/per-api/: the worker-start warm-up (Accounts.warmUp) has
 * onboarded their accounts at the start of the run, and approval runs while every other test executes.
 * Same case IDs, titles, runners and assertions as their per-API checks — only the order differs.
 */
import { defineChecks, defineDbChecks } from '../../src/checks/define';
import {
  runBody,
  runCache,
  runContract,
  runDbIsol,
  runDbRefuse,
  runDbSave,
  runExpose,
  runField,
  runGate,
  runIdor,
  runParam,
  runPiiDown,
  runPos,
  runRepeat,
  runState,
} from '../../src/checks/per-api';

const late = { late: true };
const all = () => true;

defineChecks('POS', 'M2 per-API checks — valid request succeeds (POS)', runPos, all, late);
defineChecks('IDOR', 'M2 per-API checks — cannot act on another user (IDOR)', runIdor, all, late);
defineChecks('EXPOSE', 'M2 per-API checks — no unintended PII exposure (EXPOSE)', runExpose, all, late);
defineChecks(
  'CONTRACT',
  'M2 per-API checks — Response contract unchanged (CONTRACT)',
  runContract,
  all,
  late,
);
defineChecks('PARAM', 'M2 per-API checks — Missing / invalid parameters (PARAM)', runParam, all, late);
defineChecks('BODY', 'M2 per-API checks — Malformed body / wrong data types (BODY)', runBody, all, late);
defineChecks('STATE', 'M2 per-API checks — Wrong account / record state (STATE)', runState, all, late);
defineChecks('REPEAT', 'M2 per-API checks — Repeated / double request (REPEAT)', runRepeat, all, late);
defineChecks(
  'FIELD',
  'M2 per-API checks — PII input validation and normalisation (FIELD)',
  runField,
  all,
  late,
);
defineChecks('GATE', 'M2 per-API checks — Read gate off: same value read back (GATE)', runGate, all, late);
defineChecks('CACHE', 'M2 per-API checks — PII change reflected in later reads (CACHE)', runCache, all, late);
defineChecks(
  'PIIDOWN',
  'M2 per-API checks — PII service down / slow (PIIDOWN, Dev-assisted)',
  runPiiDown,
  all,
  late,
);
defineDbChecks(
  'DB-SAVE',
  'M2 per-API checks — DB: persisted correctly, no duplicates (DB-SAVE)',
  runDbSave,
  all,
  late,
);
defineDbChecks(
  'DB-REFUSE',
  'M2 per-API checks — DB: refused request writes nothing (DB-REFUSE)',
  runDbRefuse,
  all,
  late,
);
defineDbChecks(
  'DB-ISOL',
  'M2 per-API checks — DB: other fields and users untouched (DB-ISOL)',
  runDbIsol,
  all,
  late,
);
