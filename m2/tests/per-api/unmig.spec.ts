/**
 * Per-API UNMIG checks, generated from the M2 design: Unmigrated profile with the read gate on (UNMIG).
 * NOT APPLICABLE on staging: every staging profile is migrated and new QA accounts write to PII at creation
 * (M2Q-05, QA lead 2026-10-24). Each case is skipped with a `not-applicable` annotation (report: Not Applicable) —
 * never a pass, a failure or Blocked. The cases stay listed for traceability.
 */
import { defineChecks } from '../../src/checks/define';
import { runUnmig } from '../../src/checks/per-api';

defineChecks('UNMIG', 'M2 per-API checks — Unmigrated profile with the read gate on (UNMIG)', runUnmig);
