/**
 * Per-API BODY checks, generated from the M2 design: Malformed body / wrong data types (BODY) — broken JSON, wrong types per key, extra user_id / tenant_id / first_name keys; no 5xx, no echo, no PII written, same outcome as the baseline.
 * Compared only against APPROVED staging recordings (M2Q-24 answer); without one the case is Blocked. Recording
 * happens only on explicit request: npm run m2:contracts:record (see m2/src/baseline/baseline.ts).
 */
import { defineChecks } from '../../src/checks/define';
import { runBody } from '../../src/checks/per-api';

defineChecks('BODY', 'M2 per-API checks — Malformed body / wrong data types (BODY)', runBody);
