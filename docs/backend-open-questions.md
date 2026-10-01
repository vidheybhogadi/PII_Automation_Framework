# Backend open questions — Aisle PII facade

Architecture under test: **QA automation → Aisle PII facade (Bearer token) → PII service → PII DB**.

Staging facade: `https://testa2.aisle.co/V1`. The "What we observed" column shows what staging does today.

How questions affect tests:

- A test that cannot run meaningfully without an answer, access or data is **Blocked** (never passed or failed),
  with the question ID as the reason.
- A feature Dev confirms as unsupported becomes **Not Applicable**.
- `(Q1)`…`(Q28)` refer to the numbered question list QA agreed to send to Dev.

**Only open questions are kept here.** When Dev answers a question, or QA confirms or closes it, its row is
deleted (the answer lives in the tests, `docs/coverage-matrix.md` and git history). When the last question is
removed, replace the tables with the "All clear" message below. Self-test UT-DOC-003 enforces this.

<!-- When no questions remain, use exactly:
## ✅ All clear
No open questions for the backend team — everything QA needs has been answered or provided. 🎉
-->

## Access / permissions

| ID    | Question                                                                                                                                        | What we observed                                                                        | Blocks / affects                               | Status |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | ------ |
| BQ-03 | (Q4) Please provide **approved test phone numbers** (nobody's real number); `+91 98765 43210` from the curl collection is not assumed approved. | PHONE access works, but no approved number exists yet, so no phone value has been sent. | AISLE-NRM-002, AISLE-NRM-003, AISLE-TR-001…004 | Open   |
| BQ-02 | Are **temporary phones** meant to be used through the facade? If yes, please confirm the access and the response format.                        | Not probed yet: it needs approved test phone numbers (BQ-03).                           | AISLE-TR-001…004                               | Open   |

## API contract

| ID    | Question                                                                    | What we observed                                                                                                                                  | Blocks / affects                                                                       | Status |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------ |
| BQ-28 | (Q14) What are the temporary-phone TTL (`ttl_seconds`) limits?              | Not observable (temporary phones → 403).                                                                                                          | AISLE-TR-001…004                                                                       | Open   |
| BQ-33 | Revoking a free-text key that is already revoked: 404, or 200 (idempotent)? | 2026-10-01: second revoke → 200 (requestId `84bb72f3-92ca-4330-898e-7a82a66198af`). Read after revoke → 404 and unknown key ID → 404 as expected. | AISLE-FT-004 (Blocked until answered). AISLE-FT-003 no longer checks the second revoke | Open   |

## Security

| ID    | Question                                                                                                                                                                  | What we observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Blocks / affects                                                                             | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------ |
| BQ-07 | (Q16, Q17) What is the expected cross-user authorization behaviour? Is the Aisle test token allowed to read and write **arbitrary** user IDs?                             | Made-up user IDs are accepted for save and read with the same token; there is no per-user restriction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | AISLE-SEC-004                                                                                | Open   |
| BQ-08 | (Q18) **Low-priority hygiene fix:** please stop echoing request values in 422 error replies (`detail[].input` contains the submitted value and the internal `tenant_id`). | A save with a missing `user_id` returns 422 whose `input` contains `field`, `value` and `tenant_id: "aisle"` (each error listed twice). A wrong-type field echoes only that field. Still reproduces on 2026-10-01 (requestId `0d66b064-6fbf-4187-9dc2-3da052f318c3`). **Which layer produces this 422?** The echoed body contains `tenant_id`, which only Aisle adds, and the format differs from the facade's own errors — so it looks like the PII service; if so it remains after the facade is retired. **QA assessment (2026-10-01):** in production Aisle builds the request itself and its own APIs would not pass the PII-service 422 on to end users. The remaining risk is only that the PII service echoes submitted values back to its caller, where they could land in the caller’s logs. | No active test (AISLE-SEC-002 removed 2026-10-01); requirement FR-SEC-01 kept as a known gap | Open   |
| BQ-29 | (Q19) Which internal PII-service details must never reach the QA-facing response? Are `tenant_id` and `key_version` in success responses intended?                        | Success responses include `tenant_id` and `key_version`. Error bodies checked on 2026-09-29/30 contained no stack traces, internal hosts or server banners.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | AISLE-SEC-005                                                                                | Open   |

## Database

| ID    | Question                                                                                                                                                                                                                 | What we observed | Blocks / affects                                | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ----------------------------------------------- | ------ |
| BQ-04 | (Q20–Q23) Which DB/table stores the PII? Which columns hold tenant, user, field and stored value (and key version)? What is the encryption / storage representation? Is read-only DB access available for QA automation? | Not available.   | POC-003, AISLE-DB-001…003                       | Open   |
| BQ-30 | (Q24) What DB validation is officially expected from QA (existence, association, protected storage, replacement, audit)?                                                                                                 | —                | POC-003, AISLE-DB-001…003 (scope of the checks) | Open   |

## Authentication

| ID    | Question                                                                                   | What we observed | Blocks / affects                                       | Status |
| ----- | ------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------ | ------ |
| BQ-31 | (Q26) Are there separate QA tokens for different authorization scenarios (e.g. read-only)? | One token only.  | Future authorization tests (none written: not guessed) | Open   |

## Search

| ID    | Question                                                                                                                                                                                          | What we observed                                                                  | Blocks / affects                       | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| BQ-32 | (Q27, Q28) Is NAME search supported? The only documented search endpoint is `/api/v1/pii-test/EMAIL/search`; QA keeps the EMAIL search tests separate and does NOT invent a NAME search endpoint. | Not probed (undocumented). No NAME search test exists until Dev confirms support. | NAME search (coverage matrix: Blocked) | Open   |

## Other

| ID    | Question                                                                                                             | What we observed                                                                                    | Blocks / affects                                          | Status |
| ----- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------ |
| BQ-10 | Is there an approved way to purge run-prefixed synthetic test data (`qa-auto-…`) on staging? There is no delete API. | Every write stays. Investigation probes on 2026-09-29 left NAME values for users `qa-auto-probe-…`. | All writing tests (clean-up is reported as "left behind") | Open   |
