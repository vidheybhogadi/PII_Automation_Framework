> **ARCHIVED — out of scope.** This page describes the old design in which QA called the PII service
> directly (Ed25519 signing, caller IDs, tenant_id in requests). QA now tests only the **Aisle PII facade**
> (QA → Aisle → PII service → DB). Current open questions: [../backend-open-questions.md](../backend-open-questions.md).

# Tech doc v3 — analysis against the test framework

Source: `tech_doc_v3_detailed.md` (PII Service architecture, chapters 00–21), received 2026-09-26.
The framework was built from the **PII Service API Integration Guide** (`PII.pdf`). This page records what the
tech doc answers, where the two documents disagree, what was changed, and what is still needed.

## 1. The headline

The tech doc answers about 20 of our open questions. It also describes a **different API contract** from the
Integration Guide. Both cannot be what QA runs, so the first question for Dev is **Q-30: which one is
deployed?**

## 2. Where the two documents disagree

| Topic                       | Integration Guide (`PII.pdf`)                                 | Tech doc v3                                                                            | Question     |
| --------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------ |
| Save                        | `POST /api/v1/pii` `{tenant_id, user_id, field, value}`       | `POST /api/v1/pii/{field}` `{user_id, value, idempotency_key?}`; 201 new / 200 updated | Q-30         |
| Read                        | `POST /api/v1/pii/read` `{tenant_id, user_id, field_names[]}` | `POST /api/v1/pii/{field}/read` `{user_id}`                                            | Q-30         |
| Search                      | `POST /api/v1/pii/{field}/search` with `tenant_id`            | Same path, `{value, limit, include_values}`, no tenant                                 | Q-30         |
| Bulk read                   | `{tenant_id, user_ids, fields}` → list of items               | `{user_ids, fields}` → `{data:[{user_id, EMAIL:…}], requested_fields}`                 | Q-30         |
| Temporary phones            | 3 endpoints                                                   | Not present                                                                            | Q-30         |
| Encryption keys (free text) | 3 endpoints                                                   | Not present                                                                            | Q-30         |
| Extra endpoints             | —                                                             | `POST /api/v1/auth/verify`, `GET /health/live`, `GET /metrics`                         | Q-39         |
| Request-ID header           | `X-Request-Id`                                                | `X-PII-Request-Id` (UUIDv4)                                                            | handled (§3) |
| Body-hash header            | none                                                          | `X-PII-Body-Hash` required (hex SHA-256)                                               | handled (§3) |
| Success body                | `{status, message, data, error:null}`                         | Flat, e.g. `{user_id, field, key_version}`                                             | Q-33         |
| Error body                  | `{status:false, message, data, error:{code, message}}`        | `{error_code, message, request_id}`                                                    | Q-33         |
| Tenants                     | `tenant_id` on every call                                     | No tenant concept                                                                      | Q-37         |
| Fields                      | EMAIL, PHONE, NAME                                            | EMAIL, PHONE, FIRST_NAME, LAST_NAME                                                    | Q-31         |
| Permissions                 | READ, WRITE, SEARCH, BULK_READ                                | `can_read`, `can_write`, `can_bulk_read` (no SEARCH)                                   | Q-32         |
| `truncated` in search       | true when matches reach the limit                             | true only when there are more matches than the limit                                   | Q-36         |
| Health response             | Envelope                                                      | `{status, checks}`                                                                     | Q-34         |

**Where they agree:**

- **Signing is identical:** Ed25519 over the 32-byte SHA-256 digest of the exact body bytes, sent as standard
  Base64. The framework's signer already matches both documents byte-for-byte.
- **Callers:** one registered key pair per calling service, with per-field permissions.
- **Auth failures:** always a single 401.

## 3. What was changed in the framework

| Change                                                                                                               | Why                                                             | Safe under both contracts?            |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| Every signed request now also sends `X-PII-Body-Hash` (hex SHA-256 of the signed bytes)                              | Required by tech doc §11.1                                      | Yes — an unexpected header is ignored |
| Every request sends the same UUIDv4 as both `X-Request-Id` and `X-PII-Request-Id`; "no request ID" tests remove both | Header name differs between the documents                       | Yes                                   |
| `X-PII-Body-Hash` added to the logger's denylist (new self-test UT-RED-008)                                          | It is an unkeyed hash of a body containing PII (tech doc §29.2) | —                                     |
| `.env.example`: `DB_ENGINE=postgres`, `PII_MAX_BODY_BYTES=1048576`                                                   | Tech doc §1.4 and §12.4                                         | Yes (confirm the QA value)            |
| `config/db-queries.example.json`: PII table and columns filled from tech doc §24                                     | Q-03 answered                                                   | Tenant column still pending (Q-37)    |
| Bulk-read audit query set to `null`                                                                                  | Audit is in MongoDB, not SQL (§39)                              | PII-DB-007 waits on Q-35              |
| Waiting-test notes (Q-14, Q-17, Q-21) now quote the tech doc's answer                                                | Clear next step once Q-38 / Q-34 are answered                   | —                                     |
| `known-gaps-and-questions.md`: tech doc answers (§1b) and new questions Q-30–Q-39                                    | Traceability                                                    | —                                     |

Nothing was rewritten to the tech doc's contract. Doing that before Q-30 is answered would risk replacing a
correct test suite with a wrong one.

## 4. What happens after Q-30 is answered

**If the Integration Guide is deployed:** nothing more to change. Run the suite, then use the tech doc's
answers (§1b of the questions list) to tighten tests that currently accept several answers.

**If tech doc v3 is deployed**, the test logic stays but the API layer is reworked:

| Area                                  | Work                                                                                                                                                                          | Tests affected                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Client and request models             | New paths and bodies for save/read/search/bulk read; drop `tenant_id`                                                                                                         | All PII tests                                                 |
| Response models                       | Flat success bodies and the `{error_code, message, request_id}` error body                                                                                                    | All tests                                                     |
| Temporary phones, encryption keys     | Not in the contract → retired                                                                                                                                                 | 22 tests, plus their permission, database and contract checks |
| Tenant isolation                      | Redesign around caller/application isolation, or retire                                                                                                                       | 6 tests + PII-DB-003                                          |
| Permissions                           | Rework the limited caller to `can_read` / `can_write` / `can_bulk_read`                                                                                                       | 12 tests                                                      |
| Health                                | `{status, checks}`; add `/health/live`                                                                                                                                        | 2 tests                                                       |
| New tests the tech doc makes possible | Body-hash mismatch → 401; `/api/v1/auth/verify`; `Cache-Control: no-store` on every response; uniform 401 body; `BATCH_TOO_LARGE`; `FIELD_NOT_SEARCHABLE`; 201 vs 200 on save | New                                                           |

Estimate for the rework: about 3–5 days, mostly in `src/clients`, `src/models` and the request builders.

## 5. Useful facts for the test environment (from the tech doc)

- Caller IDs must match `^[a-z0-9][a-z0-9-]{1,62}$` (lower case, digits, hyphens), e.g. `qa-automation-primary`.
- Maximum body size 1 MiB; search results capped per caller (default 20) and rate-limited (default 10/s).
- Auth failures are never detailed to the client — use the response `request_id` to ask Dev for the reason in
  their logs.
- Encrypted values are bound to the environment (`prod`, `staging`, …): production data can never be read in
  QA, so QA must use its own synthetic data (which the framework already does).
- The service returns `Cache-Control: no-store` on every response.
