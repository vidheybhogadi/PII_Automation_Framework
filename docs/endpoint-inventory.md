# Endpoint Inventory

Source: guide section **"Endpoint summary"** and sections 1–11. Code: [src/clients/endpoints.ts](../src/clients/endpoints.ts)
(single source of truth; unit test UT-END-001 asserts it matches the guide).

## Scope note — "10 endpoints" (Q-01)

The guide lists **11 functional endpoints**: `GET /health/ready` (unauthenticated) plus **10 signed
`/api/v1/*` endpoints**. "10 endpoints" most likely means the 10 authenticated ones. The framework automates
**all 11** and does not silently drop any. Scope is configurable:

```bash
PII_ENDPOINTS_IN_SCOPE=all                           # default
PII_ENDPOINTS_IN_SCOPE=writePii,readPii,searchPii    # subset — excluded suites show "skipped: out of scope"
```

## Functional endpoints

| #   | Key                   | Method | Path                               | Auth | Permission                         | Success               | No-store | Auto-retry on 503 | Client method             |
| --- | --------------------- | ------ | ---------------------------------- | ---- | ---------------------------------- | --------------------- | -------- | ----------------- | ------------------------- |
| 1   | healthReady           | GET    | `/health/ready`                    | No   | —                                  | 200 (503 not ready)   | –        | yes               | `healthReady()`           |
| 2   | writePii              | POST   | `/api/v1/pii`                      | Yes  | WRITE on field                     | 201 new / 200 replace | –        | no                | `writePii()`              |
| 3   | readPii               | POST   | `/api/v1/pii/read`                 | Yes  | READ on every field                | 200                   | –        | yes               | `readPii()`               |
| 4   | searchPii             | POST   | `/api/v1/pii/{field}/search`       | Yes  | SEARCH (+READ if `include_values`) | 200                   | –        | yes               | `searchPii(field, …)`     |
| 5   | batchReadPii          | POST   | `/api/v1/pii/batch/read`           | Yes  | BULK_READ on every field           | 200                   | –        | yes               | `batchReadPii()`          |
| 6   | createTransientPhone  | POST   | `/api/v1/transient/phones`         | Yes  | WRITE on PHONE                     | 201                   | –        | no                | `createTransientPhone()`  |
| 7   | resolveTransientPhone | POST   | `/api/v1/transient/phones/resolve` | Yes  | READ on PHONE                      | 200                   | **yes**  | yes               | `resolveTransientPhone()` |
| 8   | promoteTransientPhone | POST   | `/api/v1/transient/phones/promote` | Yes  | WRITE on PHONE                     | 200                   | –        | no                | `promoteTransientPhone()` |
| 9   | createFreeTextKey     | POST   | `/api/v1/free-text/keys`           | Yes  | WRITE on FREE_TEXT                 | 201                   | **yes**  | no                | `createFreeTextKey()`     |
| 10  | readFreeTextKey       | POST   | `/api/v1/free-text/keys/read`      | Yes  | READ on FREE_TEXT                  | 200                   | **yes**  | yes               | `readFreeTextKey()`       |
| 11  | revokeFreeTextKey     | POST   | `/api/v1/free-text/keys/revoke`    | Yes  | WRITE on FREE_TEXT                 | 200                   | –        | no                | `revokeFreeTextKey()`     |

## Request/response contracts (documented)

| Endpoint              | Request fields (type, constraint)                                                                                   | Response `data` fields                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| writePii              | tenant_id (1–64), user_id (1–128), field (1–64, case-insensitive, stored uppercase), value (1–1024)                 | tenant_id, user_id, field, key_version (int, informational)                                           |
| readPii               | tenant_id, user_id, field_names (non-empty string[])                                                                | tenant_id, user_id, items[{tenant_id,user_id,field,value}], count                                     |
| searchPii             | path `field`; tenant_id, value (1–1024), limit? (1–100, default 10, server-capped), include_values? (default false) | tenant_id, field, matches ([{user_id}] or [{tenant_id,user_id,field,value}]), count, truncated        |
| batchReadPii          | tenant_id, user_ids (1–200), fields (1–64); users×fields ≤ `batch_max_items` (dev 50)                               | tenant_id, items[…], count                                                                            |
| createTransientPhone  | tenant_id, phone (1–64 chars, normalizes to 8–15 digits), ttl_seconds (positive int; dev 300–604800)                | tenant_id, transient_id (UUID), expires_at                                                            |
| resolveTransientPhone | tenant_id, transient_id (UUID)                                                                                      | tenant_id, transient_id, phone (normalized), expires_at                                               |
| promoteTransientPhone | tenant_id, transient_id (UUID), user_id (1–128)                                                                     | tenant_id, transient_id, user_id, field="PHONE", key_version, created, consumed                       |
| createFreeTextKey     | tenant_id                                                                                                           | tenant_id, key_id (UUID), key (Base64, 256-bit), algorithm="AES-256-GCM", status="ACTIVE", created_at |
| readFreeTextKey       | tenant_id, key_id (UUID)                                                                                            | same as create                                                                                        |
| revokeFreeTextKey     | tenant_id, key_id (UUID)                                                                                            | tenant_id, key_id, status="REVOKED", revoked_at                                                       |

## Required headers (all `/api/v1/*`)

| Header          | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| Content-Type    | `application/json`                                           |
| X-PII-Caller-Id | registered caller/service ID                                 |
| X-Request-Id    | fresh UUID v4 per call                                       |
| X-PII-Signature | `Base64(Ed25519.sign(privateKey, SHA256(exact body bytes)))` |

## Documented error codes

400 `VALIDATION_ERROR` · 401 `AUTHENTICATION_FAILED` / `INVALID_SIGNATURE` · 403 `AUTHORIZATION_DENIED` ·
404 `PII_NOT_FOUND` / `TRANSIENT_PHONE_NOT_FOUND` / `FREE_TEXT_KEY_NOT_FOUND` · 413 `BODY_TOO_LARGE` ·
422 FastAPI validation · 500 `INTERNAL_ERROR` / `DECRYPTION_FAILED` · 503 `KEY_UNAVAILABLE` /
`KEY_VERSION_NOT_FOUND` / `DATABASE_ERROR` · readiness 503 `SERVICE_NOT_READY`.

## Public documentation endpoints (not in functional scope)

| Method | Path              | Use in framework                                                                           |
| ------ | ----------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/openapi.json`   | CON-001/002: drift check against this inventory                                            |
| GET    | `/docs`, `/redoc` | not used                                                                                   |
| POST   | `/docs/signature` | SEC-003: must **not** be exposed outside development. The framework never uses it to sign. |
