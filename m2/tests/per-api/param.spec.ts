/**
 * Per-API PARAM checks, generated from the M2 design: Missing / invalid parameters (PARAM) — each request key omitted in turn and an unknown path id; no 5xx, no echoed values, nothing changed, same outcome as the approved baseline.
 * Compared only against APPROVED staging recordings (M2Q-24 answer); without one the case is Blocked. Recording
 * happens only on explicit request: npm run m2:contracts:record (see m2/src/baseline/baseline.ts).
 */
import { defineChecks } from '../../src/checks/define';
import { runParam } from '../../src/checks/per-api';

defineChecks('PARAM', 'M2 per-API checks — Missing / invalid parameters (PARAM)', runParam);
