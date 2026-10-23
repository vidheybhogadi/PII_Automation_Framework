/**
 * Per-API REPEAT checks, generated from the M2 design: Repeated / double request (REPEAT) — sent twice in a row and twice in parallel; same outcome as the baseline, nothing changes after the first request.
 * Compared only against APPROVED staging recordings (M2Q-24 answer); without one the case is Blocked. Recording
 * happens only on explicit request: npm run m2:contracts:record (see m2/src/baseline/baseline.ts).
 */
import { defineChecks } from '../../src/checks/define';
import { runRepeat } from '../../src/checks/per-api';

defineChecks('REPEAT', 'M2 per-API checks — Repeated / double request (REPEAT)', runRepeat);
