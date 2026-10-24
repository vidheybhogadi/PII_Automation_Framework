/**
 * Per-API GATE checks, generated from the M2 design: Read gate off — same value read back (gate on: waiting).
 * Read gates are OFF on testa2 (M2Q-02, QA lead 2026-10-24): writes go to the PII service, reads come from the app
 * database. Each case writes a new fake value where the route writes (otherwise uses the account's current values),
 * reads it back and checks no 5xx, no other test account's data and no unlisted personal-data field. The gate-ON
 * half ("gate on → PII value") is recorded as waiting for Dev (M2Q-43). Nothing here switches gates.
 */
import { defineChecks } from '../../src/checks/define';
import { runGate } from '../../src/checks/per-api';

defineChecks('GATE', 'M2 per-API checks — Read gate off: same value read back (GATE)', runGate);
