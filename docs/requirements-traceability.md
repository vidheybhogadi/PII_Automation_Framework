# Requirements Traceability Matrix

<!-- GENERATED FILE — do not edit by hand. Source: reporting/core/catalog.ts · Regenerate: npm run docs:traceability -->

Architecture under test: **QA automation → Aisle PII facade → PII service → PII DB**. Each requirement comes
from behaviour observed on the Aisle staging facade or from the backend team (see
`backend-open-questions.md`; the Source column names the question). **Type:** Derived = observed / confirmed
behaviour · Policy = security expectation · Documented = legacy entry kept for the demo dataset.

This document shows **design** traceability (which tests verify which requirement). **Execution status** per
requirement — VERIFIED / FAILED / PARTIAL / BLOCKED / NOT EXECUTED — comes from real runs and is shown in the
report dashboard (Requirements section) and its PDF. Test references ending in `*` cover every test with
that ID prefix.

**29 requirements** in 13 groups · 22 depend on an open backend question.

## Authentication

| Req        | Requirement                                                                                               | Type    | Source                                                | Endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Tests                                                                  | Open question |
| ---------- | --------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------- |
| FR-AUTH-01 | Every endpoint requires the Aisle token; a missing, wrong or malformed token gets 401 with no data        | Derived | Staging, observed 2026-09-29                          | `GET /api/v1/pii-test/health/ready`<br>`POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read`<br>`POST /api/v1/pii-test/{field}/search`<br>`POST /api/v1/pii-test/batch/read`<br>`POST /api/v1/pii-test/transient/phones`<br>`POST /api/v1/pii-test/transient/phones/resolve`<br>`POST /api/v1/pii-test/transient/phones/promote`<br>`POST /api/v1/pii-test/free-text/keys`<br>`POST /api/v1/pii-test/free-text/keys/read`<br>`POST /api/v1/pii-test/free-text/keys/revoke` | `AISLE-AUTH-001`, `AISLE-AUTH-002`, `AISLE-AUTH-003`, `AISLE-AUTH-004` | BQ-09         |
| FR-AUTH-02 | An expired token gets 401 — out of scope: the test token is QA-only and the facade is temporary (no test) | Policy  | BQ-11 (closed – out of scope, QA decision 2026-10-01) | `POST /api/v1/pii-test/read`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |                                                                        | —             |

## Isolation

| Req       | Requirement                                                                       | Type   | Source                       | Endpoints                                               | Tests           | Open question |
| --------- | --------------------------------------------------------------------------------- | ------ | ---------------------------- | ------------------------------------------------------- | --------------- | ------------- |
| FR-ISO-01 | The tenant is always set by Aisle; a tenant sent by the client never takes effect | Policy | Staging, observed 2026-09-29 | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` | `AISLE-SEC-001` | BQ-06         |
| FR-ISO-02 | One user’s data is protected from other users through the facade (blocked)        | Policy | BQ-07                        | `POST /api/v1/pii-test/read`                            | `AISLE-SEC-004` | BQ-07         |

## PII Save

| Req      | Requirement                                                                                                          | Type    | Source                       | Endpoints                                                                                     | Tests                                                           | Open question |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------- |
| FR-WR-01 | A new field is saved with 201, a repeat save replaces it with 200; the reply has tenant, user, field and key version | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test`                                                                       | `AISLE-WR-001`, `AISLE-WR-002`, `AISLE-CON-001`, `POC-001`      | —             |
| FR-WR-02 | Invalid requests are refused (422 list of problems; broken JSON 400) and change nothing                              | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test`                                                                       | `AISLE-WR-003`, `AISLE-WR-004`, `AISLE-WR-007`, `AISLE-CON-002` | BQ-09         |
| FR-WR-03 | Length limits: user ID 1–128 characters, value 1–1,024 characters                                                    | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test`                                                                       | `AISLE-WR-004`, `AISLE-WR-005`, `AISLE-WR-006`                  | BQ-05         |
| FR-WR-04 | An unknown field name is refused (403) on save, read and bulk read                                                   | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read`<br>`POST /api/v1/pii-test/batch/read` | `AISLE-WR-008`, `AISLE-RD-005`, `AISLE-BR-006`                  | BQ-12         |

## PII Read

| Req      | Requirement                                                        | Type    | Source                       | Endpoints                    | Tests          | Open question |
| -------- | ------------------------------------------------------------------ | ------- | ---------------------------- | ---------------------------- | -------------- | ------------- |
| FR-RD-01 | Reading returns exactly the saved value for that user and field    | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test/read` | `AISLE-RD-001` | —             |
| FR-RD-02 | A user with no saved value gets 404 PII_NOT_FOUND                  | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test/read` | `AISLE-RD-003` | —             |
| FR-RD-03 | The field list must not be empty and the user ID is required (422) | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test/read` | `AISLE-RD-004` | BQ-05         |
| FR-RD-04 | Fields the user has not saved are left out of the reply (blocked)  | Derived | BQ-01                        | `POST /api/v1/pii-test/read` | `AISLE-RD-002` | BQ-01         |

## Bulk read

| Req      | Requirement                                                                | Type    | Source                                                  | Endpoints                          | Tests                          | Open question |
| -------- | -------------------------------------------------------------------------- | ------- | ------------------------------------------------------- | ---------------------------------- | ------------------------------ | ------------- |
| FR-BR-01 | A bulk read returns every requested user × field                           | Derived | Staging, observed 2026-09-29                            | `POST /api/v1/pii-test/batch/read` | `AISLE-BR-001`, `AISLE-BR-004` | BQ-19         |
| FR-BR-02 | If any requested user has no value, the whole bulk read gets 404           | Derived | Staging, observed 2026-09-29                            | `POST /api/v1/pii-test/batch/read` | `AISLE-BR-002`                 | —             |
| FR-BR-03 | The user list must hold 1–200 IDs (422 outside)                            | Derived | Staging, observed 2026-09-29                            | `POST /api/v1/pii-test/batch/read` | `AISLE-BR-003`                 | BQ-18         |
| FR-BR-04 | A bulk read needs both the user list and the field list (422 when missing) | Derived | Inferred from save/read behaviour; to verify on staging | `POST /api/v1/pii-test/batch/read` | `AISLE-BR-005`                 | BQ-09         |

## Normalization

| Req       | Requirement                                                               | Type    | Source                       | Endpoints                                               | Tests                            | Open question |
| --------- | ------------------------------------------------------------------------- | ------- | ---------------------------- | ------------------------------------------------------- | -------------------------------- | ------------- |
| FR-NRM-01 | Names are trimmed and runs of spaces collapsed; capitals are kept         | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` | `AISLE-NRM-001`, `POC-002`       | —             |
| FR-NRM-02 | Emails are trimmed and lower-cased (blocked)                              | Derived | BQ-01                        | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` | `AISLE-WR-010`                   | BQ-01         |
| FR-NRM-03 | Phones are stored as digits only and invalid phones are refused (blocked) | Derived | BQ-03                        | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` | `AISLE-NRM-002`, `AISLE-NRM-003` | BQ-03         |

## Email flow

| Req       | Requirement                                                                               | Type    | Source | Endpoints                                               | Tests                          | Open question |
| --------- | ----------------------------------------------------------------------------------------- | ------- | ------ | ------------------------------------------------------- | ------------------------------ | ------------- |
| FR-EML-01 | An email can be saved and read back cleaned up, and an invalid email is refused (blocked) | Derived | BQ-01  | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` | `AISLE-WR-009`, `AISLE-WR-010` | BQ-01         |

## Search

| Req      | Requirement                                                                                                         | Type    | Source                                      | Endpoints                              | Tests                                                          | Open question |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------- | -------------------------------------- | -------------------------------------------------------------- | ------------- |
| FR-SR-01 | Email search finds users, returns values only when asked, marks cut-off results and handles no match (200, count 0) | Derived | Staging, observed 2026-10-01 (BQ-01, BQ-13) | `POST /api/v1/pii-test/{field}/search` | `AISLE-SR-001`, `AISLE-SR-002`, `AISLE-SR-003`, `AISLE-SR-005` | BQ-13         |
| FR-SR-02 | The search limit must be 1–100 (422 outside), checked before access                                                 | Derived | Staging, observed 2026-09-29                | `POST /api/v1/pii-test/{field}/search` | `AISLE-SR-004`                                                 | BQ-05         |

## Temporary phone

| Req      | Requirement                                                            | Type    | Source | Endpoints                                                                                                                                        | Tests        | Open question |
| -------- | ---------------------------------------------------------------------- | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------- |
| FR-TR-01 | A temporary phone can be created, resolved and promoted once (blocked) | Derived | BQ-02  | `POST /api/v1/pii-test/transient/phones`<br>`POST /api/v1/pii-test/transient/phones/resolve`<br>`POST /api/v1/pii-test/transient/phones/promote` | `AISLE-TR-*` | BQ-02         |

## Free-text keys

| Req      | Requirement                                                                                        | Type    | Source                               | Endpoints                                                                                                                              | Tests        | Open question |
| -------- | -------------------------------------------------------------------------------------------------- | ------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------- |
| FR-FT-01 | A free-text key can be created, read and revoked; revoked keys are gone (second revoke reply open) | Derived | Staging, observed 2026-10-01 (BQ-02) | `POST /api/v1/pii-test/free-text/keys`<br>`POST /api/v1/pii-test/free-text/keys/read`<br>`POST /api/v1/pii-test/free-text/keys/revoke` | `AISLE-FT-*` | BQ-33         |

## Security

| Req       | Requirement                                                                                                                                                  | Type   | Source            | Endpoints                                               | Tests                       | Open question |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------- | ------------------------------------------------------- | --------------------------- | ------------- |
| FR-SEC-01 | Error replies do not repeat the submitted personal value or internal details (known finding BQ-08, low priority, no active test)                             | Policy | BQ-08             | `POST /api/v1/pii-test`                                 |                             | BQ-08         |
| FR-SEC-02 | Test logs and reports never contain the Aisle token (shown as $AISLE_TEST_TOKEN); the call log holds no personal data; reports show fake test data by design | Policy | QA security rules | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` | `AISLE-SEC-003`, `UT-RED-*` | —             |
| FR-SEC-03 | Error replies reveal no internal service details (stack traces, internal hosts, server or database names)                                                    | Policy | BQ-29             | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` | `AISLE-SEC-005`             | BQ-29         |

## Storage

| Req      | Requirement                                                                                               | Type   | Source | Endpoints               | Tests                   | Open question |
| -------- | --------------------------------------------------------------------------------------------------------- | ------ | ------ | ----------------------- | ----------------------- | ------------- |
| FR-DB-01 | Saved values are stored once per user and field and are not readable; encryption not yet proven (blocked) | Policy | BQ-04  | `POST /api/v1/pii-test` | `AISLE-DB-*`, `POC-003` | BQ-04         |

## Health

| Req       | Requirement                                               | Type    | Source                       | Endpoints                           | Tests           | Open question |
| --------- | --------------------------------------------------------- | ------- | ---------------------------- | ----------------------------------- | --------------- | ------------- |
| FR-HLT-01 | The health check with the token reports the service ready | Derived | Staging, observed 2026-09-29 | `GET /api/v1/pii-test/health/ready` | `AISLE-HLT-001` | BQ-15         |
