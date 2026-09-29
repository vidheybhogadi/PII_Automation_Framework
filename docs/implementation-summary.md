# Implementation summary — migration to the Aisle PII facade (2026-09-29)

**Architecture now under test:** QA automation → Aisle PII facade (Bearer token) → PII service → PII DB.

## What changed

- **Removed from active execution:** the 133 direct-PII-service tests, Ed25519 signing
  (`src/auth/ed25519-signer.ts`), caller-key handling and key generation, QA-supplied tenants, the direct
  PII client, and their self-tests. They remain in git history; the design docs are in `docs/archive/`.
- **Added:** `src/clients/aisle-pii-client.ts` (Bearer token added centrally, no tenant/caller/signature),
  facade endpoints (`/api/v1/pii-test…`), `AISLE_*` settings with the token as a scrubbed `Secret`, Blocked /
  security-finding helpers, 49 facade tests, `docs/backend-open-questions.md`, `docs/coverage-matrix.md`.
- **Reused:** Playwright runner, Axios transport, redacting logger, retry, test-data factory, read-only DB
  layer, assertions, report / PDF / Excel / CSV / JSON, history, CI structure.
- **Reporting:** statuses Pass · Fail · Security finding · Blocked · Skipped · Not Tested; product name
  "Aisle PII API Automation".

## First staging results (https://testa2.aisle.co/V1)

| Result           | Tests                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pass             | 25                                                                                                                                                                      |
| Security finding | 1 — AISLE-SEC-002 (BQ-08: 422 errors echo the submitted value and the internal tenant_id)                                                                               |
| Blocked          | 23 — EMAIL/search access (BQ-01), temporary phones / free-text keys (BQ-02), approved phones (BQ-03), DB access (BQ-04), cross-user rule (BQ-07), expired token (BQ-11) |
| Fail             | 0                                                                                                                                                                       |

Framework self-tests: 61/61 · report tests: 56/56.
