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

**37 requirements** in 14 groups · 18 depend on an open backend question.

## Authentication

| Req        | Requirement                                                                                                                              | Type   | Source                                              | Endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Tests | Open question |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------- |
| FR-AUTH-01 | Every endpoint requires the Aisle token; a missing, wrong or malformed token gets 401 with no data — out of scope: facade-only (no test) | Policy | Out of scope — facade-only (QA decision 2026-10-01) | `GET /api/v1/pii-test/health/ready`<br>`POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read`<br>`POST /api/v1/pii-test/{field}/search`<br>`POST /api/v1/pii-test/batch/read`<br>`POST /api/v1/pii-test/transient/phones`<br>`POST /api/v1/pii-test/transient/phones/resolve`<br>`POST /api/v1/pii-test/transient/phones/promote`<br>`POST /api/v1/pii-test/free-text/keys`<br>`POST /api/v1/pii-test/free-text/keys/read`<br>`POST /api/v1/pii-test/free-text/keys/revoke` |       | —             |
| FR-AUTH-02 | An expired token gets 401 — out of scope: facade-only, the test token is QA-only and the facade is temporary (no test)                   | Policy | Out of scope — facade-only (QA decision 2026-10-01) | `POST /api/v1/pii-test/read`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |       | —             |

## Isolation

| Req       | Requirement                                                                                                             | Type    | Source                                              | Endpoints                                               | Tests          | Open question |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------- | ------------------------------------------------------- | -------------- | ------------- |
| FR-ISO-01 | The tenant is always set by Aisle; a tenant sent by the client never takes effect — out of scope: facade-only (no test) | Policy  | Out of scope — facade-only (QA decision 2026-10-01) | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` |                | —             |
| FR-ISO-02 | The QA token’s reach over other users’ data — out of scope: facade-only, about the QA token (no test)                   | Policy  | Out of scope — facade-only (QA decision 2026-10-01) | `POST /api/v1/pii-test/read`                            |                | —             |
| FR-ISO-03 | A user ID is matched exactly (after trimming spaces): an ID in capitals or with one extra letter is a different user    | Derived | Staging, observed 2026-10-01                        | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` | `AISLE-WR-012` | BQ-34         |

## PII Save

| Req      | Requirement                                                                                                                             | Type    | Source                       | Endpoints                                                                                     | Tests                                                                                      | Open question |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------- |
| FR-WR-01 | A new field is saved with 201, a repeat save replaces it with 200; the reply has tenant, user, field and key version                    | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test`                                                                       | `AISLE-WR-001`, `AISLE-WR-002`, `AISLE-WR-020`, `AISLE-WR-027`, `AISLE-CON-001`, `POC-001` | BQ-29         |
| FR-WR-02 | Invalid requests are refused (422 list of problems), never with a server error, and change nothing                                      | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test`                                                                       | `AISLE-WR-003`, `AISLE-WR-004`, `AISLE-WR-011`, `AISLE-WR-017`, `AISLE-CON-002`            | —             |
| FR-WR-03 | Length limits: user ID 1–128 characters, value 1–1,024 characters (counted in characters, not bytes)                                    | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test`                                                                       | `AISLE-WR-004`, `AISLE-WR-005`, `AISLE-WR-006`, `AISLE-WR-015`, `AISLE-WR-016`             | —             |
| FR-WR-04 | An unknown field name is refused (403) on save, read and bulk read, also when mixed with known fields                                   | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read`<br>`POST /api/v1/pii-test/batch/read` | `AISLE-WR-008`, `AISLE-RD-005`, `AISLE-RD-007`, `AISLE-BR-006`, `AISLE-BR-007`             | —             |
| FR-WR-05 | Text is stored exactly as sent: any alphabet or emoji, and attack-looking text is never run as code; field names are not case-sensitive | Derived | Staging, observed 2026-10-01 | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read`                                       | `AISLE-WR-013`, `AISLE-WR-014`, `AISLE-WR-018`                                             | BQ-35         |
| FR-WR-06 | Saves sent at the same moment all succeed and leave one consistent value per user and field                                             | Derived | Staging, observed 2026-10-01 | `POST /api/v1/pii-test`                                                                       | `AISLE-WR-021`, `AISLE-WR-029`                                                             | —             |

## PII Read

| Req      | Requirement                                                                                     | Type    | Source                       | Endpoints                                                          | Tests                          | Open question |
| -------- | ----------------------------------------------------------------------------------------------- | ------- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------ | ------------- |
| FR-RD-01 | Reading returns exactly the saved value for that user and field, for every requested field      | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test/read`                                       | `AISLE-RD-001`, `AISLE-RD-006` | —             |
| FR-RD-02 | A user with no saved value gets 404 PII_NOT_FOUND                                               | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test/read`                                       | `AISLE-RD-003`                 | —             |
| FR-RD-03 | The field list must not be empty, and the user ID and field names must be real text (422 / 403) | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test/read`                                       | `AISLE-RD-004`, `AISLE-RD-009` | BQ-38         |
| FR-RD-04 | Fields the user has not saved are left out of the reply                                         | Derived | Staging, observed 2026-10-01 | `POST /api/v1/pii-test/read`                                       | `AISLE-RD-002`                 | —             |
| FR-RD-05 | A field name asked for twice is returned twice (no de-duplication) on read and bulk read        | Derived | Staging, observed 2026-10-01 | `POST /api/v1/pii-test/read`<br>`POST /api/v1/pii-test/batch/read` | `AISLE-RD-008`, `AISLE-BR-008` | —             |

## Bulk read

| Req      | Requirement                                                                                                                                    | Type    | Source                                              | Endpoints                          | Tests                                                          | Open question |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- | ------------- |
| FR-BR-01 | A bulk read returns every requested user × field, in the requested user order                                                                  | Derived | Staging, observed 2026-09-29                        | `POST /api/v1/pii-test/batch/read` | `AISLE-BR-001`, `AISLE-BR-004`, `AISLE-BR-010`, `AISLE-BR-012` | —             |
| FR-BR-02 | If any requested user has none of the fields, the whole bulk read gets 404; fields a user lacks are left out                                   | Derived | Staging, observed 2026-09-29                        | `POST /api/v1/pii-test/batch/read` | `AISLE-BR-002`, `AISLE-BR-011`                                 | BQ-42         |
| FR-BR-03 | The user list must hold 1–200 real IDs and the field list at least one real field (422 outside)                                                | Derived | Staging, observed 2026-09-29                        | `POST /api/v1/pii-test/batch/read` | `AISLE-BR-003`, `AISLE-BR-009`, `AISLE-BR-013`                 | BQ-18         |
| FR-BR-04 | A bulk read needs both the user list and the field list (422 when missing) — out of scope: facade-only, the facade rebuilds the body (no test) | Derived | Out of scope — facade-only (QA decision 2026-10-01) | `POST /api/v1/pii-test/batch/read` |                                                                | —             |

## Normalization

| Req       | Requirement                                                                                            | Type    | Source                       | Endpoints                                               | Tests                                                        | Open question |
| --------- | ------------------------------------------------------------------------------------------------------ | ------- | ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ | ------------- |
| FR-NRM-01 | Names are trimmed and runs of spaces collapsed (tabs and line breaks become spaces); capitals are kept | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` | `AISLE-NRM-001`, `AISLE-NRM-004`, `AISLE-NRM-005`, `POC-002` | BQ-36         |
| FR-NRM-02 | Emails are trimmed and lower-cased                                                                     | Derived | Staging, observed 2026-10-01 | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` | `AISLE-WR-010`                                               | —             |
| FR-NRM-03 | Phones are stored as digits only and invalid phones are refused (blocked)                              | Derived | BQ-03                        | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` | `AISLE-NRM-002`, `AISLE-NRM-003`, `AISLE-WR-028`             | BQ-03         |

## Email flow

| Req       | Requirement                                                                                            | Type    | Source                       | Endpoints                                               | Tests                                                                                                          | Open question |
| --------- | ------------------------------------------------------------------------------------------------------ | ------- | ---------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------- |
| FR-EML-01 | An email can be saved, replaced and read back cleaned up; badly formed or over-long emails are refused | Derived | Staging, observed 2026-10-01 | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read` | `AISLE-WR-009`, `AISLE-WR-010`, `AISLE-WR-022`, `AISLE-WR-023`, `AISLE-WR-024`, `AISLE-WR-025`, `AISLE-WR-026` | BQ-37         |

## Search

| Req      | Requirement                                                                                                                | Type    | Source                       | Endpoints                              | Tests                                                                                                          | Open question |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------- |
| FR-SR-01 | Email search finds users, returns values only when asked, marks cut-off results and handles no match (200, count 0)        | Derived | Staging, observed 2026-10-01 | `POST /api/v1/pii-test/{field}/search` | `AISLE-SR-001`, `AISLE-SR-002`, `AISLE-SR-003`, `AISLE-SR-005`, `AISLE-SR-008`, `AISLE-SR-010`, `AISLE-SR-016` | BQ-41         |
| FR-SR-02 | Search settings are checked: limit 1–100 (422 outside), wrong types handled predictably, empty or non-email values refused | Derived | Staging, observed 2026-09-29 | `POST /api/v1/pii-test/{field}/search` | `AISLE-SR-004`, `AISLE-SR-011`, `AISLE-SR-013`, `AISLE-SR-014`                                                 | BQ-40         |
| FR-SR-03 | Search only finds exact matches in the EMAIL field: wildcards, partial values and other fields never find a user           | Derived | Staging, observed 2026-10-01 | `POST /api/v1/pii-test/{field}/search` | `AISLE-SR-006`, `AISLE-SR-007`, `AISLE-SR-009`                                                                 | —             |
| FR-SR-04 | Search on fields other than EMAIL (NAME, PHONE, unknown) behaves predictably                                               | Derived | Staging, observed 2026-10-01 | `POST /api/v1/pii-test/{field}/search` | `AISLE-SR-015`                                                                                                 | BQ-32         |

## Temporary phone

| Req      | Requirement                                                                                                   | Type    | Source | Endpoints                                                                                                                                        | Tests        | Open question |
| -------- | ------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------- |
| FR-TR-01 | A temporary phone can be created, resolved and promoted once, expires on time and refuses bad input (blocked) | Derived | BQ-02  | `POST /api/v1/pii-test/transient/phones`<br>`POST /api/v1/pii-test/transient/phones/resolve`<br>`POST /api/v1/pii-test/transient/phones/promote` | `AISLE-TR-*` | BQ-03         |

## Free-text keys

| Req      | Requirement                                                                                                                      | Type    | Source                       | Endpoints                                                                                                                              | Tests        | Open question |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------- |
| FR-FT-01 | A free-text key can be created, read and revoked; every key is unique; revoked or unknown keys are gone; bad key IDs are refused | Derived | Staging, observed 2026-10-01 | `POST /api/v1/pii-test/free-text/keys`<br>`POST /api/v1/pii-test/free-text/keys/read`<br>`POST /api/v1/pii-test/free-text/keys/revoke` | `AISLE-FT-*` | BQ-33         |

## Contract

| Req       | Requirement                                                                            | Type    | Source                       | Endpoints                                                                                                                                                                                                                                                                         | Tests           | Open question |
| --------- | -------------------------------------------------------------------------------------- | ------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------- |
| FR-CON-01 | The data part of EMAIL, search and free-text-key replies has exactly the agreed fields | Derived | Staging, observed 2026-10-01 | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read`<br>`POST /api/v1/pii-test/batch/read`<br>`POST /api/v1/pii-test/{field}/search`<br>`POST /api/v1/pii-test/free-text/keys`<br>`POST /api/v1/pii-test/free-text/keys/read`<br>`POST /api/v1/pii-test/free-text/keys/revoke` | `AISLE-CON-003` | —             |

## Security

| Req       | Requirement                                                                                                                                                  | Type   | Source            | Endpoints                                                                                                    | Tests                       | Open question |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------- |
| FR-SEC-01 | Error replies do not repeat the submitted personal value or internal details (known finding BQ-08, low priority, no active test)                             | Policy | BQ-08             | `POST /api/v1/pii-test`                                                                                      |                             | BQ-08         |
| FR-SEC-02 | Test logs and reports never contain the Aisle token (shown as $AISLE_TEST_TOKEN); the call log holds no personal data; reports show fake test data by design | Policy | QA security rules | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read`                                                      | `AISLE-SEC-003`, `UT-RED-*` | —             |
| FR-SEC-03 | Error replies reveal no internal service details (stack traces, internal hosts, server or database names)                                                    | Policy | BQ-29             | `POST /api/v1/pii-test`<br>`POST /api/v1/pii-test/read`                                                      | `AISLE-SEC-005`             | BQ-29         |
| FR-SEC-04 | Replies with personal data tell browsers and proxies not to keep a copy (no-store) (blocked)                                                                 | Policy | BQ-39             | `POST /api/v1/pii-test/read`<br>`POST /api/v1/pii-test/batch/read`<br>`POST /api/v1/pii-test/{field}/search` | `AISLE-SEC-006`             | BQ-39         |

## Storage

| Req      | Requirement                                                                                                                            | Type   | Source | Endpoints               | Tests                   | Open question |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----------------------- | ----------------------- | ------------- |
| FR-DB-01 | Saved values are stored once per user and field and are not readable; refused saves leave nothing; encryption not yet proven (blocked) | Policy | BQ-04  | `POST /api/v1/pii-test` | `AISLE-DB-*`, `POC-003` | BQ-04         |

## Health

| Req       | Requirement                                               | Type    | Source                       | Endpoints                           | Tests           | Open question |
| --------- | --------------------------------------------------------- | ------- | ---------------------------- | ----------------------------------- | --------------- | ------------- |
| FR-HLT-01 | The health check with the token reports the service ready | Derived | Staging, observed 2026-09-29 | `GET /api/v1/pii-test/health/ready` | `AISLE-HLT-001` | —             |
