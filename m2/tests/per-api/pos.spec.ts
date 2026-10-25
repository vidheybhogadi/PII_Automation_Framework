/**
 * Per-API POS checks (Valid request succeeds with correct PII), generated from the M2 design.
 * The request is Dev's cURL example with the run's synthetic values; the caller is chosen from the route's auth
 * (m2/src/checks/context.ts). Pass = 2xx, no other test account's personal data in the reply, and (audit fix
 * 2026-10-25; M2Q-37 answered: PII user_id = app user id, from code) the caller's own first name and every suite
 * account's entry equal that account's PII first name. A status-only reply is noted as such, with any effect seen in
 * the caller's / target's own profile; a reply without a comparable name is noted "value part not checkable".
 */
import { defineChecks } from '../../src/checks/define';
import { runPos } from '../../src/checks/per-api';

defineChecks('POS', 'M2 per-API checks — valid request succeeds (POS)', runPos);
