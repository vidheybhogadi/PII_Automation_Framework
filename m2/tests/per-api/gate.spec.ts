/**
 * Per-API GATE checks, generated from the M2 design: Read gate off vs on (GATE, Dev-assisted) — the same request in a Dev window with the gates off and in one with them on (M2_GATE_WINDOW=off|on); same status and keys, no 5xx, no other user’s PII.
 * Dev-assisted: Blocked per design until the cited questions are answered, and at runtime until Dev opens the
 * window. Nothing here switches gates or breaks services by itself.
 */
import { defineChecks } from '../../src/checks/define';
import { runGate } from '../../src/checks/per-api';

defineChecks('GATE', 'M2 per-API checks — Read gate off vs on (GATE, Dev-assisted)', runGate);
