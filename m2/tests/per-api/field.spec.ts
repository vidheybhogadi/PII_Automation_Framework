/**
 * Per-API FIELD checks, generated from the M2 design: PII input validation and normalisation (FIELD) — each invalid / edge value sent; a refused value changes nothing; accept rules per M2Q-06 / M2Q-07 / M2Q-30.
 * Blocked per design status until the cited questions are answered; prerequisites (special account states, gate
 * windows) block at runtime.
 */
import { defineChecks } from '../../src/checks/define';
import { runField } from '../../src/checks/per-api';

defineChecks('FIELD', 'M2 per-API checks — PII input validation and normalisation (FIELD)', runField);
