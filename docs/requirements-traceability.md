# Requirements Traceability Matrix

<!-- GENERATED FILE — do not edit by hand. Source: reporting/core/catalog.ts · Regenerate: npm run docs:traceability -->

Each requirement comes from the **PII Service API Integration Guide** (section in the Source column).
**Type:** Documented = stated in the guide · Derived = follows directly from the guide · Policy = security
expectation not in the guide (see `known-gaps-and-questions.md` §3).

This document shows **design** traceability (which tests verify which requirement). **Execution status** per
requirement — VERIFIED / FAILED / PARTIAL / BLOCKED / NOT EXECUTED — comes from real runs and is shown in the
PII Sentinel dashboard (Requirements section) and its PDF. Test references ending in `*` cover every test with
that ID prefix.

**72 requirements** in 14 groups · 22 depend on an open backend question.

## Authentication

| Req       | Requirement                                                      | Type       | Source                | Endpoints                                                                                                                                                                                                                                                                                                                                                   | Tests                                                                                    | Open question |
| --------- | ---------------------------------------------------------------- | ---------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------- |
| R-AUTH-01 | Every /api/v1 request requires an Ed25519 signature              | Documented | Authentication        | `POST /api/v1/pii`<br>`POST /api/v1/pii/read`<br>`POST /api/v1/pii/{field}/search`<br>`POST /api/v1/pii/batch/read`<br>`POST /api/v1/transient/phones`<br>`POST /api/v1/transient/phones/resolve`<br>`POST /api/v1/transient/phones/promote`<br>`POST /api/v1/free-text/keys`<br>`POST /api/v1/free-text/keys/read`<br>`POST /api/v1/free-text/keys/revoke` | `PII-AUTH-016`, `PII-AUTH-020`                                                           | —             |
| R-AUTH-02 | Signature = Base64(Ed25519(SHA-256(exact body bytes)))           | Documented | Signature calculation | `POST /api/v1/pii`                                                                                                                                                                                                                                                                                                                                          | `UT-SIG-*`, `UT-CLI-001`, `PII-AUTH-001`, `PII-AUTH-011`                                 | —             |
| R-AUTH-03 | Signed bytes must exactly match transmitted bytes                | Documented | Signature calculation | `POST /api/v1/pii`                                                                                                                                                                                                                                                                                                                                          | `UT-SIG-007`, `UT-CLI-001`, `UT-CLI-007`, `PII-AUTH-008`, `PII-AUTH-009`, `PII-AUTH-010` | —             |
| R-AUTH-04 | Required headers: Content-Type, Caller-Id, Request-Id, Signature | Documented | Authentication        | `POST /api/v1/pii`                                                                                                                                                                                                                                                                                                                                          | `UT-CLI-002`, `PII-AUTH-002`, `PII-AUTH-012`, `PII-AUTH-015`, `PII-AUTH-018`             | Q-13          |
| R-AUTH-05 | Public key is bound to the caller ID                             | Derived    | Authentication        | `POST /api/v1/pii`                                                                                                                                                                                                                                                                                                                                          | `PII-AUTH-007`, `PII-AUTH-017`, `UT-SIG-008`                                             | —             |
| R-AUTH-06 | Invalid headers/caller/signature → 401                           | Documented | Common statuses       | `POST /api/v1/pii`                                                                                                                                                                                                                                                                                                                                          | `PII-AUTH-*`, `PII-DB-004`                                                               | Q-06          |
| R-AUTH-07 | Rejected requests are not processed                              | Derived    | Authentication        | `POST /api/v1/pii`                                                                                                                                                                                                                                                                                                                                          | `PII-AUTH-002`, `PII-AUTH-008`, `PII-DB-004`                                             | —             |
| R-AUTH-08 | Fresh X-Request-Id per call                                      | Documented | Checklist 6           | —                                                                                                                                                                                                                                                                                                                                                           | `UT-CLI-003`, `UT-CLI-009`                                                               | —             |
| R-AUTH-09 | 401 and 403 treated differently; not retried                     | Documented | Checklist 8           | `POST /api/v1/pii`<br>`POST /api/v1/pii/read`                                                                                                                                                                                                                                                                                                               | `PII-AUTH-019`, `PII-AZ-012`, `UT-CLI-010`                                               | —             |
| R-AUTH-10 | Reused request ID behaviour                                      | Derived    | Checklist 6           | —                                                                                                                                                                                                                                                                                                                                                           | `PII-AUTH-021`                                                                           | Q-14          |
| R-AUTH-11 | Replay protection                                                | Derived    | Authentication        | —                                                                                                                                                                                                                                                                                                                                                           | `PII-AUTH-022`                                                                           | Q-21          |

## Authorization

| Req     | Requirement                                         | Type       | Source              | Endpoints                                                                                                             | Tests                                                  | Open question |
| ------- | --------------------------------------------------- | ---------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------- |
| R-AZ-01 | Missing field permission → 403 AUTHORIZATION_DENIED | Documented | Field authorization | `POST /api/v1/pii`<br>`POST /api/v1/pii/read`<br>`POST /api/v1/pii/{field}/search`<br>`POST /api/v1/pii/batch/read`   | `PII-AZ-001`, `PII-AZ-002`, `PII-AZ-007`, `PII-AZ-008` | —             |
| R-AZ-02 | Read requires READ for every requested field        | Documented | §3 Read PII         | `POST /api/v1/pii/read`                                                                                               | `PII-AZ-003`, `PII-AZ-004`                             | —             |
| R-AZ-03 | Search requires SEARCH; include_values also READ    | Documented | §4 Search PII       | `POST /api/v1/pii/{field}/search`                                                                                     | `PII-AZ-005`, `PII-AZ-006`, `PII-AZ-007`               | —             |
| R-AZ-04 | Batch requires BULK_READ for every field            | Documented | §5 Batch read       | `POST /api/v1/pii/batch/read`                                                                                         | `PII-AZ-008`                                           | —             |
| R-AZ-05 | Transient permissions (WRITE/READ PHONE)            | Documented | §6–8                | `POST /api/v1/transient/phones`<br>`POST /api/v1/transient/phones/resolve`<br>`POST /api/v1/transient/phones/promote` | `PII-AZ-009`, `PII-AZ-010`                             | —             |
| R-AZ-06 | FREE_TEXT capability permissions                    | Documented | §9–11               | `POST /api/v1/free-text/keys`<br>`POST /api/v1/free-text/keys/read`<br>`POST /api/v1/free-text/keys/revoke`           | `PII-AZ-011`                                           | —             |

## Isolation

| Req      | Requirement                                      | Type       | Source          | Endpoints                                                                                     | Tests                                    | Open question |
| -------- | ------------------------------------------------ | ---------- | --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------- |
| R-TEN-01 | User identity is (tenant_id, user_id)            | Documented | Shared concepts | `POST /api/v1/pii`<br>`POST /api/v1/pii/read`                                                 | `PII-TI-001`, `PII-TI-005`, `PII-DB-003` | —             |
| R-TEN-02 | Read/search/batch restricted to requested tenant | Derived    | Shared concepts | `POST /api/v1/pii/read`<br>`POST /api/v1/pii/{field}/search`<br>`POST /api/v1/pii/batch/read` | `PII-TI-002`, `PII-TI-003`, `PII-TI-004` | —             |
| R-TEN-03 | Tenant scopes data; authorization separate       | Documented | Shared concepts | `POST /api/v1/pii/read`                                                                       | `PII-TI-006`, `PII-AZ-004`               | Q-27          |
| R-TEN-04 | Transient mapping owned by caller and tenant     | Documented | §7              | `POST /api/v1/transient/phones/resolve`<br>`POST /api/v1/transient/phones/promote`            | `PII-TR-003`, `PII-TR-004`               | —             |
| R-TEN-05 | Free-text key owned by caller and tenant         | Documented | §10–11          | `POST /api/v1/free-text/keys/read`<br>`POST /api/v1/free-text/keys/revoke`                    | `PII-FT-005`, `PII-FT-006`               | —             |

## PII Write

| Req     | Requirement                                             | Type       | Source          | Endpoints                                             | Tests                                                   | Open question |
| ------- | ------------------------------------------------------- | ---------- | --------------- | ----------------------------------------------------- | ------------------------------------------------------- | ------------- |
| R-WR-01 | Upsert: 201 new, 200 replace                            | Documented | §2              | `POST /api/v1/pii`                                    | `PII-WR-001`, `PII-WR-002`, `PII-DB-001`                | —             |
| R-WR-02 | Response has tenant, user, canonical field, key_version | Documented | §2              | `POST /api/v1/pii`                                    | `PII-WR-001`, `PII-WR-003`, `PII-CON-003`               | —             |
| R-WR-03 | Field name case-insensitive, stored uppercase           | Documented | §2              | `POST /api/v1/pii`                                    | `PII-WR-003`                                            | —             |
| R-WR-04 | Field length constraints                                | Documented | §2              | `POST /api/v1/pii`                                    | `PII-WR-005`, `PII-WR-005b`, `PII-WR-006`, `PII-WR-007` | —             |
| R-WR-05 | Malformed / missing / wrong-typed JSON → 422            | Documented | Common statuses | `POST /api/v1/pii`                                    | `PII-WR-004`, `PII-WR-011`, `PII-WR-012`                | Q-05          |
| R-WR-06 | Invalid email/phone → 400 VALIDATION_ERROR              | Documented | Common statuses | `POST /api/v1/pii`<br>`POST /api/v1/transient/phones` | `PII-WR-008`, `PII-WR-009`, `PII-TR-010`                | —             |
| R-WR-07 | Unsupported field rejected                              | Derived    | §2              | `POST /api/v1/pii`                                    | `PII-WR-010`                                            | Q-07          |

## PII Read

| Req     | Requirement                                   | Type       | Source | Endpoints               | Tests                                                                              | Open question |
| ------- | --------------------------------------------- | ---------- | ------ | ----------------------- | ---------------------------------------------------------------------------------- | ------------- |
| R-RD-01 | Selected fields; missing omitted; 404 if none | Documented | §3     | `POST /api/v1/pii/read` | `PII-RD-001`, `PII-RD-002`, `PII-RD-003`, `PII-RD-004`, `PII-RD-005`, `PII-RD-006` | —             |
| R-RD-02 | field_names must be non-empty                 | Documented | §3     | `POST /api/v1/pii/read` | `PII-RD-007`, `PII-RD-008`                                                         | —             |
| R-RD-03 | Read response contract                        | Documented | §3     | `POST /api/v1/pii/read` | `PII-RD-009`, `PII-CON-003`                                                        | —             |

## Search

| Req     | Requirement                                | Type       | Source | Endpoints                         | Tests                                                  | Open question |
| ------- | ------------------------------------------ | ---------- | ------ | --------------------------------- | ------------------------------------------------------ | ------------- |
| R-SR-01 | Exact match after normalization            | Documented | §4     | `POST /api/v1/pii/{field}/search` | `PII-SR-001`, `PII-SR-002`, `PII-SR-003`               | —             |
| R-SR-02 | include_values=false returns user IDs only | Documented | §4     | `POST /api/v1/pii/{field}/search` | `PII-SR-001`, `UT-AST-003`, `PII-CON-003`              | —             |
| R-SR-03 | include_values=true returns values         | Documented | §4     | `POST /api/v1/pii/{field}/search` | `PII-SR-010`                                           | —             |
| R-SR-04 | limit 1–100, default 10, truncated flag    | Documented | §4     | `POST /api/v1/pii/{field}/search` | `PII-SR-006`, `PII-SR-007`, `PII-SR-008`, `PII-SR-009` | Q-09          |
| R-SR-05 | Only searchable fields may be searched     | Documented | §4     | `POST /api/v1/pii/{field}/search` | `PII-SR-012`                                           | Q-18          |
| R-SR-06 | No-match behaviour                         | Derived    | §4     | `POST /api/v1/pii/{field}/search` | `PII-SR-004`                                           | Q-08          |

## Batch

| Req     | Requirement                           | Type       | Source | Endpoints                     | Tests                      | Open question |
| ------- | ------------------------------------- | ---------- | ------ | ----------------------------- | -------------------------- | ------------- |
| R-BR-01 | Cartesian product users × fields      | Documented | §5     | `POST /api/v1/pii/batch/read` | `PII-BR-001`               | —             |
| R-BR-02 | Item count ≤ batch_max_items          | Documented | §5     | `POST /api/v1/pii/batch/read` | `PII-BR-004`, `PII-BR-005` | Q-19          |
| R-BR-03 | user_ids 1–200, fields 1–64           | Documented | §5     | `POST /api/v1/pii/batch/read` | `PII-BR-007`               | —             |
| R-BR-04 | Duplicate pairs de-duplicated         | Documented | §5     | `POST /api/v1/pii/batch/read` | `PII-BR-006`               | Q-20          |
| R-BR-05 | Missing omitted; user with none → 404 | Documented | §5     | `POST /api/v1/pii/batch/read` | `PII-BR-002`, `PII-BR-003` | —             |
| R-BR-06 | One PII_BATCH_READ audit event        | Documented | §5     | `POST /api/v1/pii/batch/read` | `PII-DB-007`               | Q-26          |

## Normalization

| Req      | Requirement                                | Type       | Source              | Endpoints                                             | Tests                                                               | Open question |
| -------- | ------------------------------------------ | ---------- | ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- | ------------- |
| R-NRM-01 | Email trimmed + lowercased; must contain @ | Documented | Value normalization | `POST /api/v1/pii`                                    | `PII-NRM-001`, `PII-NRM-005`, `PII-WR-008`, `PII-SR-002`, `POC-001` | —             |
| R-NRM-02 | Phone digits only, 8–15 digits             | Documented | Value normalization | `POST /api/v1/pii`<br>`POST /api/v1/transient/phones` | `PII-NRM-002`, `PII-NRM-004`, `PII-WR-009`, `PII-TR-002`            | —             |
| R-NRM-03 | Text trimmed, whitespace collapsed         | Documented | Value normalization | `POST /api/v1/pii`                                    | `PII-NRM-003`, `PII-WR-013`                                         | Q-10          |

## Encryption

| Req      | Requirement                                            | Type       | Source | Endpoints                                                                  | Tests                                    | Open question |
| -------- | ------------------------------------------------------ | ---------- | ------ | -------------------------------------------------------------------------- | ---------------------------------------- | ------------- |
| R-ENC-01 | Values encrypted before persistence                    | Documented | §2     | `POST /api/v1/pii`                                                         | `POC-001`, `PII-DB-001`, `PII-DB-002`    | Q-03          |
| R-ENC-02 | key_version is the DEK version used                    | Documented | §2     | `POST /api/v1/pii`                                                         | `POC-001`, `PII-DB-001`                  | Q-16          |
| R-ENC-03 | Record bound to correct tenant/user; one row per field | Derived    | §2     | `POST /api/v1/pii`                                                         | `POC-001`, `PII-DB-001`, `PII-DB-003`    | —             |
| R-ENC-04 | Transient phone encrypted; consumed on promote         | Documented | §6, §8 | `POST /api/v1/transient/phones`<br>`POST /api/v1/transient/phones/promote` | `PII-DB-005`, `PII-TR-006`               | —             |
| R-ENC-05 | Free-text key is 256-bit AES-256-GCM                   | Documented | §9     | `POST /api/v1/free-text/keys`                                              | `PII-FT-001`, `PII-FT-009`, `UT-AST-010` | —             |
| R-ENC-06 | Revoked keys have REVOKED state                        | Documented | §11    | `POST /api/v1/free-text/keys/revoke`                                       | `PII-FT-003`, `PII-DB-006`               | —             |

## Transient

| Req     | Requirement                                          | Type       | Source          | Endpoints                                                                          | Tests                                                                | Open question |
| ------- | ---------------------------------------------------- | ---------- | --------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------- |
| R-TR-01 | Create returns transient_id + expires_at (201)       | Documented | §6              | `POST /api/v1/transient/phones`                                                    | `PII-TR-001`                                                         | —             |
| R-TR-02 | TTL within configured bounds                         | Documented | §6              | `POST /api/v1/transient/phones`                                                    | `PII-TR-008`, `PII-TR-009`                                           | Q-11          |
| R-TR-03 | Resolve returns normalized phone with no-store       | Documented | §7              | `POST /api/v1/transient/phones/resolve`                                            | `PII-TR-002`                                                         | —             |
| R-TR-04 | Missing/expired/consumed/foreign → 404               | Documented | Common statuses | `POST /api/v1/transient/phones/resolve`<br>`POST /api/v1/transient/phones/promote` | `PII-TR-003`, `PII-TR-004`, `PII-TR-005`, `PII-TR-006`, `PII-TR-012` | Q-12          |
| R-TR-05 | Promote stores PHONE, consumes mapping, repeat → 404 | Documented | §8              | `POST /api/v1/transient/phones/promote`                                            | `PII-TR-006`, `PII-TR-007`                                           | —             |

## Free-text

| Req     | Requirement                         | Type       | Source      | Endpoints                                                                  | Tests                                                   | Open question |
| ------- | ----------------------------------- | ---------- | ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------- | ------------- |
| R-FT-01 | Create key: 201, metadata, no-store | Documented | §9          | `POST /api/v1/free-text/keys`                                              | `PII-FT-001`, `PII-FT-008`                              | —             |
| R-FT-02 | Read active key with no-store       | Documented | §10         | `POST /api/v1/free-text/keys/read`                                         | `PII-FT-002`                                            | —             |
| R-FT-03 | Revoke → REVOKED; read then 404     | Documented | §10–11      | `POST /api/v1/free-text/keys/revoke`<br>`POST /api/v1/free-text/keys/read` | `PII-FT-003`, `PII-FT-004`                              | —             |
| R-FT-04 | Never log returned keys             | Documented | Checklist 7 | `POST /api/v1/free-text/keys`<br>`POST /api/v1/free-text/keys/read`        | `PII-FT-010`, `UT-CLI-011`, `UT-CLI-012`, `PII-SEC-004` | —             |

## Health

| Req      | Requirement                         | Type       | Source | Endpoints           | Tests         | Open question |
| -------- | ----------------------------------- | ---------- | ------ | ------------------- | ------------- | ------------- |
| R-HLT-01 | Readiness 200 envelope without auth | Documented | §1     | `GET /health/ready` | `PII-HLT-001` | —             |
| R-HLT-02 | Not ready → 503 SERVICE_NOT_READY   | Documented | §1     | `GET /health/ready` | `PII-HLT-002` | Q-17          |

## Contract

| Req      | Requirement                          | Type       | Source           | Endpoints                                                                                                                                                                                                                                                                                                                                                   | Tests                                       | Open question |
| -------- | ------------------------------------ | ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------- |
| R-ENV-01 | Success / error envelope shapes      | Documented | Shared concepts  | `POST /api/v1/pii`<br>`POST /api/v1/pii/read`<br>`POST /api/v1/pii/{field}/search`<br>`POST /api/v1/pii/batch/read`<br>`POST /api/v1/transient/phones`<br>`POST /api/v1/transient/phones/resolve`<br>`POST /api/v1/transient/phones/promote`<br>`POST /api/v1/free-text/keys`<br>`POST /api/v1/free-text/keys/read`<br>`POST /api/v1/free-text/keys/revoke` | `PII-CON-003`, `PII-CON-004`, `PII-CON-005` | —             |
| R-ENV-02 | OpenAPI matches documented inventory | Derived    | Endpoint summary | —                                                                                                                                                                                                                                                                                                                                                           | `PII-CON-001`, `PII-CON-002`                | Q-24          |

## Security

| Req      | Requirement                                          | Type       | Source                         | Endpoints                                                                                                      | Tests                                              | Open question |
| -------- | ---------------------------------------------------- | ---------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------- |
| R-SEC-01 | 413 BODY_TOO_LARGE above configured max              | Documented | Common statuses                | `POST /api/v1/pii`                                                                                             | `PII-SEC-002`                                      | Q-22          |
| R-SEC-02 | /docs/signature not exposed outside development      | Documented | Public documentation endpoints | —                                                                                                              | `PII-SEC-003`                                      | Q-23          |
| R-SEC-03 | No plaintext PII, signatures, keys or bodies in logs | Documented | Checklist 7                    | `POST /api/v1/pii`<br>`POST /api/v1/pii/read`                                                                  | `POC-001`, `PII-SEC-004`, `UT-RED-*`, `UT-CLI-012` | —             |
| R-SEC-04 | Bounded exponential backoff for 503                  | Documented | Checklist 9                    | —                                                                                                              | `UT-CLI-009`, `UT-CLI-010`, `UT-RTY-*`             | —             |
| R-SEC-05 | Honour Cache-Control: no-store                       | Documented | Checklist 10                   | `POST /api/v1/transient/phones/resolve`<br>`POST /api/v1/free-text/keys`<br>`POST /api/v1/free-text/keys/read` | `PII-TR-002`, `PII-FT-001`, `PII-FT-002`           | —             |
| R-SEC-06 | Error bodies do not echo PII                         | Policy     | P-01                           | `POST /api/v1/pii`                                                                                             | `PII-SEC-001`                                      | —             |
