/**
 * Per-API PIIDOWN checks, generated from the M2 design: PII service down / slow (PIIDOWN, Dev-assisted) — the request during an approved PII-service failure window (M2_PII_OUTAGE_WINDOW=true); no internals, no other user’s PII, latency recorded.
 * Dev-assisted: Blocked per design until the cited questions are answered, and at runtime until Dev opens the
 * window. Nothing here switches gates or breaks services by itself.
 */
import { defineChecks } from '../../src/checks/define';
import { runPiiDown } from '../../src/checks/per-api';

defineChecks('PIIDOWN', 'M2 per-API checks — PII service down / slow (PIIDOWN, Dev-assisted)', runPiiDown);
