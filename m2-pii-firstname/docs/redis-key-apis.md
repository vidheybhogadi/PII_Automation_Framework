# Redis key APIs (Aisle Engineering tester quick reference, 2026-11-09)

Part of the M2 PII First Name suite (`m2-pii-firstname/`). Aisle Engineering shared this Postman quick
reference on 2026-11-09 (requested for PII testing: read and delete one user's cached details in Redis). The same two
endpoints exist on the Aisle backend (aisle_new) and on the vernacular backend (desiapp), each with its own service URL,
admin token and Redis connection. `{{base_url}}` is replaced with the staging URLs: Aisle `https://testa2.aisle.co`,
vernacular `https://testapp.koode.co`. `{{redis_key}}`, `{{admin_token}}` and `{{app_name}}` stay placeholders.

Used by the M2 PII First Name suite to read and clear a test user's caches. The Aisle rows are documented on the API
Guide from [api-docs-routes.json](api-docs-routes.json) (read by `scripts/api-docs/export.ts`); the vernacular rows are
in the API Guide's shared vernacular folder. Neither is part of the Milestone 2 (Aisle business APIs) inventory.

| ID      | Backend   | Method | URL                                                   | Purpose                         |
| ------- | --------- | ------ | ----------------------------------------------------- | ------------------------------- |
| API-213 | aisle_new | GET    | `https://testa2.aisle.co/admin/redis-keys?key=<key>`  | Read a string value             |
| API-214 | aisle_new | DELETE | `https://testa2.aisle.co/admin/redis-keys?key=<key>`  | Delete one exact key (any type) |
| VN-RK1  | desiapp   | GET    | `https://testapp.koode.co/admin/redis-keys?key=<key>` | Read a string value             |
| VN-RK2  | desiapp   | DELETE | `https://testapp.koode.co/admin/redis-keys?key=<key>` | Delete one exact key (any type) |

Source: Aisle backend `app/controllers/admin/redis_keys_controller.rb`, routes `config/routes.rb:619-620`
(origin/develop_new @ bd85044, commit afb5748 "redis keys for show and destroy", 2026-11-09).

## The quick reference (verbatim, base URL filled in)

TESTER QUICK REFERENCE · POSTMAN

**Redis key APIs**

aisle_new & desiapp · Same endpoints, separate service URLs and admin tokens

### Postman setup

Set `{{base_url}}` to the target service URL and `{{redis_key}}` to a disposable test key. Use an Admin token with
registered Redis permissions and completed CMS OTP verification.

| Header        | Value                      | Applies to    |
| ------------- | -------------------------- | ------------- |
| Authorization | `Bearer {{admin_token}}`   | Both services |
| webcms        | `true`                     | Both services |
| App-Name      | `{{app_name}}` (e.g. Anbe) | desiapp only  |

Request body: none. Pass key in Postman's Params tab for both requests.

### 1. Read a string value · GET

```text
GET https://testa2.aisle.co/admin/redis-keys?key={{redis_key}}
GET https://testapp.koode.co/admin/redis-keys?key={{redis_key}}
```

Example 200 response for key `redis-api-test` containing `hello`:

```json
{ "status": true, "key": "redis-api-test", "value": "hello" }
```

Returns the stored string unchanged, including JSON strings and empty strings. GET does not read hashes, lists, sets,
or other non-string values.

### 2. Delete one exact key · DELETE

```text
DELETE https://testa2.aisle.co/admin/redis-keys?key={{redis_key}}
DELETE https://testapp.koode.co/admin/redis-keys?key={{redis_key}}
```

Example 200 response:

```json
{ "status": true, "key": "redis-api-test", "deleted": true }
```

Supports any Redis data type. An absent key returns 200 with `deleted: false`. Wildcards are literal; deletion does
not expand patterns.

### Expected error responses

| HTTP status | Condition                                             |
| ----------- | ----------------------------------------------------- |
| 400         | Missing, blank, or invalid key                        |
| 401         | Admin token, permissions, device, or OTP check failed |
| 404         | GET: key does not exist                               |
| 422         | GET: key holds a non-string Redis value               |
| 503         | Redis operation unavailable                           |

**Quick test:** Read a disposable string key → GET 200. Delete it → DELETE 200 / `deleted: true`. Read again → GET 404. Delete again → DELETE 200 / `deleted: false`. Repeat for each service.

Aisle Engineering · 9 November 2026 · Each service uses its own configured REDIS connection
