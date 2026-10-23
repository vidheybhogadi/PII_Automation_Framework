/**
 * Per-API UNMIG checks, generated from the M2 design: Unmigrated profile with the read gate on (UNMIG) — a Dev-provided unmigrated profile (M2Q-32) in the request; no 5xx, no other user’s value; field value per M2Q-05.
 * Blocked per design status until the cited questions are answered; prerequisites (special account states, gate
 * windows) block at runtime.
 */
import { defineChecks } from '../../src/checks/define';
import { runUnmig } from '../../src/checks/per-api';

defineChecks('UNMIG', 'M2 per-API checks — Unmigrated profile with the read gate on (UNMIG)', runUnmig);
