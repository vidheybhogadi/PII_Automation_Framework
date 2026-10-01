# Backend open questions — Aisle PII facade

Architecture under test: **QA automation → Aisle PII facade (Bearer token) → PII service → PII DB**.

Staging facade: `https://testa2.aisle.co/V1`. The "What we observed" column shows what staging does today.

How questions affect tests:

- A test that cannot run meaningfully without an answer, access or data is **Blocked** (never passed or failed),
  with the question ID as the reason.
- A feature Dev confirms as unsupported becomes **Not Applicable**.
- `(Q1)`…`(Q28)` refer to the numbered question list QA agreed to send to Dev.

**All questions below are open — waiting for an answer from Dev.**

## Access / permissions

| ID    | Question                                                                                                                                                                                        | What we observed                                                                 | Blocks / affects                                                         | Status |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------ |
| BQ-01 | (Q3) Please grant the Aisle caller READ, WRITE, SEARCH and BULK_READ on **EMAIL**, and confirm EMAIL normalization (trim + lower-case?).                                                        | Every EMAIL save / read / search / bulk read returns 403 `AUTHORIZATION_DENIED`. | AISLE-WR-009, AISLE-WR-010, AISLE-RD-002, AISLE-SR-001…003, AISLE-SR-005 | Open   |
| BQ-03 | (Q4) Does the Aisle caller have READ/WRITE on **PHONE**? Please provide approved test phone numbers (nobody's real number); `+91 98765 43210` from the curl collection is not assumed approved. | Not probed: we never send phone numbers that are not approved.                   | AISLE-NRM-002, AISLE-NRM-003, AISLE-TR-001…004                           | Open   |
| BQ-23 | (Q5) Which SEARCH permissions are enabled for the Aisle caller (which fields)?                                                                                                                  | EMAIL search → 403.                                                              | AISLE-SR-001…003, AISLE-SR-005                                           | Open   |
| BQ-02 | Are temporary phones and free-text encryption keys meant to be used through the facade? If yes, please grant that access.                                                                       | Every temporary-phone and free-text-key call returns 403 `AUTHORIZATION_DENIED`. | AISLE-TR-001…004, AISLE-FT-001…003                                       | Open   |

## API contract

| ID    | Question                                                       | What we observed                         | Blocks / affects | Status |
| ----- | -------------------------------------------------------------- | ---------------------------------------- | ---------------- | ------ |
| BQ-28 | (Q14) What are the temporary-phone TTL (`ttl_seconds`) limits? | Not observable (temporary phones → 403). | AISLE-TR-001…004 | Open   |
| BQ-13 | Search with no match: 200 with `count: 0`, or 404?             | Not observable (search → 403).           | AISLE-SR-005     | Open   |

## Security

| ID    | Question                                                                                                                                                                                 | What we observed                                                                                                                                                                   | Blocks / affects                             | Status |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------ |
| BQ-07 | (Q16, Q17) What is the expected cross-user authorization behaviour? Is the Aisle test token allowed to read and write **arbitrary** user IDs?                                            | Made-up user IDs are accepted for save and read with the same token; there is no per-user restriction.                                                                             | AISLE-SEC-004                                | Open   |
| BQ-08 | (Q18) **Security finding:** should error responses ever contain submitted PII? Today 422 errors echo the request in `detail[].input` — the submitted value and the internal `tenant_id`. | A save with a missing `user_id` returns 422 whose `input` contains `field`, `value` and `tenant_id: "aisle"` (each error listed twice). A wrong-type field echoes only that field. | AISLE-SEC-002 (expected to FAIL until fixed) | Open   |
| BQ-29 | (Q19) Which internal PII-service details must never reach the QA-facing response? Are `tenant_id` and `key_version` in success responses intended?                                       | Success responses include `tenant_id` and `key_version`. Error bodies checked on 2026-09-29/30 contained no stack traces, internal hosts or server banners.                        | AISLE-SEC-005                                | Open   |

## Database

| ID    | Question                                                                                                                                                                                                                 | What we observed | Blocks / affects                                | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ----------------------------------------------- | ------ |
| BQ-04 | (Q20–Q23) Which DB/table stores the PII? Which columns hold tenant, user, field and stored value (and key version)? What is the encryption / storage representation? Is read-only DB access available for QA automation? | Not available.   | POC-003, AISLE-DB-001…003                       | Open   |
| BQ-30 | (Q24) What DB validation is officially expected from QA (existence, association, protected storage, replacement, audit)?                                                                                                 | —                | POC-003, AISLE-DB-001…003 (scope of the checks) | Open   |

## Authentication

| ID    | Question                                                                                   | What we observed | Blocks / affects                                       | Status |
| ----- | ------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------ | ------ |
| BQ-11 | (Q25) How can QA obtain an **expired** (or revoked) Aisle test token for negative testing? | Not available.   | AISLE-AUTH-005                                         | Open   |
| BQ-31 | (Q26) Are there separate QA tokens for different authorization scenarios (e.g. read-only)? | One token only.  | Future authorization tests (none written: not guessed) | Open   |

## Search

| ID    | Question                                                                                                                                                                                          | What we observed                                                                  | Blocks / affects                       | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| BQ-32 | (Q27, Q28) Is NAME search supported? The only documented search endpoint is `/api/v1/pii-test/EMAIL/search`; QA keeps the EMAIL search tests separate and does NOT invent a NAME search endpoint. | Not probed (undocumented). No NAME search test exists until Dev confirms support. | NAME search (coverage matrix: Blocked) | Open   |

## Other

| ID    | Question                                                                                                             | What we observed                                                                                    | Blocks / affects                                          | Status |
| ----- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------ |
| BQ-10 | Is there an approved way to purge run-prefixed synthetic test data (`qa-auto-…`) on staging? There is no delete API. | Every write stays. Investigation probes on 2026-09-29 left NAME values for users `qa-auto-probe-…`. | All writing tests (clean-up is reported as "left behind") | Open   |
