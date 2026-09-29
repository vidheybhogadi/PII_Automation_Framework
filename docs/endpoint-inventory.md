# Endpoint inventory — Aisle PII facade

Base URL (verified staging): `https://testa2.aisle.co/V1`. Every endpoint needs
`Authorization: Bearer <AISLE_TEST_TOKEN>`; POST bodies are JSON (`Content-Type: application/json`).
Requests never contain `tenant_id` — Aisle sets it (responses show `"tenant_id": "aisle"`).

Source: the Aisle "PII Test API Curl Collection" + staging behaviour observed on 2026-09-29. Code:
[src/clients/endpoints.ts](../src/clients/endpoints.ts).

| Key                     | Method + path                                    | Body                             | Access today (2026-09-29)                    |
| ----------------------- | ------------------------------------------------ | -------------------------------- | -------------------------------------------- |
| `healthReady`           | `GET /api/v1/pii-test/health/ready`              | —                                | ✔ 200 `{"data":{"status":"ready"}}`          |
| `writePii`              | `POST /api/v1/pii-test`                          | `{user_id, field, value}`        | ✔ NAME (201 new / 200 replace) · ✘ EMAIL 403 |
| `readPii`               | `POST /api/v1/pii-test/read`                     | `{user_id, field_names[]}`       | ✔ NAME · ✘ EMAIL 403                         |
| `searchPii`             | `POST /api/v1/pii-test/{FIELD}/search`           | `{value, limit, include_values}` | ✘ 403 (BQ-01)                                |
| `batchReadPii`          | `POST /api/v1/pii-test/batch/read`               | `{user_ids[], fields[]}`         | ✔ NAME · ✘ EMAIL 403                         |
| `createTransientPhone`  | `POST /api/v1/pii-test/transient/phones`         | `{phone, ttl_seconds}`           | ✘ 403 (BQ-02)                                |
| `resolveTransientPhone` | `POST /api/v1/pii-test/transient/phones/resolve` | `{transient_id}`                 | ✘ 403 (BQ-02)                                |
| `promoteTransientPhone` | `POST /api/v1/pii-test/transient/phones/promote` | `{transient_id, user_id}`        | ✘ 403 (BQ-02)                                |
| `createFreeTextKey`     | `POST /api/v1/pii-test/free-text/keys`           | `{}`                             | ✘ 403 (BQ-02)                                |
| `readFreeTextKey`       | `POST /api/v1/pii-test/free-text/keys/read`      | `{key_id}`                       | ✘ 403 (BQ-02)                                |
| `revokeFreeTextKey`     | `POST /api/v1/pii-test/free-text/keys/revoke`    | `{key_id}`                       | ✘ 403 (BQ-02)                                |

## Observed response formats

| Case                         | Status | Body                                                                                                  |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Success                      | 2xx    | `{status: true, message, data, error: null}` — e.g. `"PII write successful"`, `"PII read successful"` |
| No / wrong / malformed token | 401    | empty body, `text/html`                                                                               |
| Broken JSON                  | 400    | `{status: false, error: "Invalid JSON", message: "Request body must be valid JSON"}`                  |
| Access not granted           | 403    | `{status: false, message: "Authorization denied", data: null, error: {code: "AUTHORIZATION_DENIED"}}` |
| Nothing saved for the user   | 404    | `{status: false, message: "PII value not found", error: {code: "PII_NOT_FOUND"}}`                     |
| Validation error             | 422    | FastAPI `{detail: [{type, loc, msg, input, ctx}]}` — echoes the input (security finding BQ-08)        |

Observed limits: `user_id` 1–128 chars, `value` 1–1,024 chars, `field_names` ≥ 1, bulk read `user_ids` 1–200
(exactly 200 returned 403 — BQ-18), `fields` ≥ 1. Unconfirmed items are listed in
[backend-open-questions.md](backend-open-questions.md).
