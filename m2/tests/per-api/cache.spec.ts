/**
 * Per-API CACHE checks, generated from the M2 design: PII change reflected in later reads (CACHE) — warm read (must show the writer, else Blocked), change the name, re-read for up to 45 s; must be seen for own reads / test routes; no reversion once seen; window per M2Q-12.
 * Blocked per design status until the cited questions are answered; prerequisites (special account states, gate
 * windows) block at runtime.
 */
import { defineChecks } from '../../src/checks/define';
import { runCache } from '../../src/checks/per-api';

defineChecks('CACHE', 'M2 per-API checks — PII change reflected in later reads (CACHE)', runCache);
