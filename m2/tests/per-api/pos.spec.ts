/**
 * Per-API POS checks (Valid request succeeds with correct PII), generated from the M2 design.
 * The request is Dev's cURL example with the run's synthetic values; the caller is chosen from the route's auth
 * (m2/src/checks/context.ts). Pass = 2xx and no other test account's personal data in the reply; the PII keys
 * present are recorded. Comparing values with the PII service needs the app user → PII user_id mapping (M2Q-37).
 */
import { defineChecks } from '../../src/checks/define';
import { runPos } from '../../src/checks/per-api';

defineChecks('POS', 'M2 per-API checks — valid request succeeds (POS)', runPos);
