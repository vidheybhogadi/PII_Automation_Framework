/**
 * Per-API HIDDEN checks, generated from the M2 design: Hidden first name respected (HIDDEN) — another user’s reply never contains the hidden profile’s full first name.
 * Blocked per design status until the cited questions are answered; prerequisites (special account states, gate
 * windows) block at runtime.
 */
import { defineChecks } from '../../src/checks/define';
import { runHidden } from '../../src/checks/per-api';

defineChecks('HIDDEN', 'M2 per-API checks — Hidden first name respected (HIDDEN)', runHidden);
