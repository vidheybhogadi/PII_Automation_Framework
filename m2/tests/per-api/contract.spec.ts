/**
 * Per-API CONTRACT checks, generated from the M2 design: Response contract unchanged (CONTRACT) — same keys and types as the approved staging baseline, no new or missing PII keys.
 * Compared only against APPROVED staging recordings (M2Q-24 answer); without one the case is Blocked. Recording
 * happens only on explicit request: npm run m2:contracts:record (see m2/src/baseline/baseline.ts).
 */
import { defineChecks } from '../../src/checks/define';
import { runContract } from '../../src/checks/per-api';

defineChecks('CONTRACT', 'M2 per-API checks — Response contract unchanged (CONTRACT)', runContract);
