/**
 * Per-API EXPOSE checks (No unintended PII exposure), generated from the M2 design.
 * User B calls a route in which user A is visible (connected pair). Pass = A's phone (national and full) and email
 * never appear anywhere in B's reply. CMS views (role allow-list, M2Q-14) and payment payloads (sandbox, M2Q-17)
 * follow their design status.
 */
import { defineChecks } from '../../src/checks/define';
import { runExpose } from '../../src/checks/per-api';

defineChecks('EXPOSE', 'M2 per-API checks — no unintended PII exposure (EXPOSE)', runExpose);
