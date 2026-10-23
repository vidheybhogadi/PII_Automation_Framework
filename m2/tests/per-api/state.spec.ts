/**
 * Per-API STATE checks, generated from the M2 design: Wrong account / record state (STATE) — action repeated and unknown targets; no PII in errors, same outcome as the baseline.
 * Compared only against APPROVED staging recordings (M2Q-24 answer); without one the case is Blocked. Recording
 * happens only on explicit request: npm run m2:contracts:record (see m2/src/baseline/baseline.ts).
 */
import { defineChecks } from '../../src/checks/define';
import { runState } from '../../src/checks/per-api';

defineChecks('STATE', 'M2 per-API checks — Wrong account / record state (STATE)', runState);
