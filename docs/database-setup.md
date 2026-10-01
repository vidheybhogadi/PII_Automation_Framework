# Database setup (read-only validation)

Flow checked: **Aisle facade save → PII service → PII DB → read-only DB query → Aisle facade read**.

> The PII DB schema has **not** been confirmed for the Aisle facade (**BQ-04** in
> [backend-open-questions.md](backend-open-questions.md)). No table or column name in this repository is presented
> as verified: every name in `config/db-queries.example.json` is a `PENDING_` placeholder. Until Dev provides
> access and the layout, every DB test shows as **Blocked (BQ-04)** — never passed, never failed.

## 1. What to request from Dev

1. Engine (PostgreSQL or MySQL), host, port, database name for staging.
2. A **read-only** DB user (SELECT only). Automation never writes to the DB.
3. The table and column names for PII values: user, field, tenant (if stored), stored value, key version.
4. How encryption is represented (algorithm, nonce/IV, auth tag, key version), so the tests can check the real
   storage format instead of only "the readable value is not there".

## 2. Configure

```bash
DB_ENGINE=postgres            # or mysql
DB_HOST=… DB_PORT=5432 DB_NAME=… DB_USER=<read-only user> DB_PASSWORD=<from secret store>
DB_SSL=true
DB_QUERIES_FILE=config/db-queries.json
```

```bash
cp config/db-queries.example.json config/db-queries.json    # git-ignored
# replace every PENDING_… name with the confirmed table/column names
```

## 3. SQL catalog contract

Each query is `{ "sql": "...", "params": [...] }` or `null`. Rules (enforced by `parseQueryCatalog`, UT-DB-001/005):

- a single `SELECT`/`WITH` statement; `DELETE`, `UPDATE`, `INSERT`, `DROP`, `TRUNCATE` and every other write are rejected
- use the engine's placeholders (`$1, $2…` for PostgreSQL, `?` for MySQL), in the order listed in `params`
- return **exactly these column aliases**:

| Query             | Params (order)              | Required aliases                                                | Optional aliases                                                                                                      |
| ----------------- | --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `findPiiRecords`  | `tenant_id, user_id, field` | `tenant_id`, `user_id`, `field`, `encrypted_value` (bytes/text) | `key_version` (int); `nonce`, `auth_tag`, `lookup_token` (bytes, `bytea`); `created_at`, `updated_at` (timestamps)    |
| `findKeyRegistry` | _(none)_                    | `key_version` (int), `status`                                   | — (never `*`, never a wrapped-key / DEK column: rejected by the framework, UT-DB-009)                                 |
| `findFreeTextKey` | `key_id`                    | `status`                                                        | `tenant_id`, `caller_id`, `created_at`, `revoked_at`, `encrypted_key_material` (every column that could hold the key) |

The tenant passed is the one the facade **returns** (observed `"aisle"`) — QA never chooses it. The PII-service design
(tech doc v3) has no tenant column; ask Dev how the tenant is stored (BQ-04).

The design-format tests (AISLE-DB-006…012) need `nonce`, `auth_tag`, `lookup_token`, `created_at` and `updated_at`;
the QA database user therefore needs SELECT on the encrypted-value, nonce and auth-tag columns (the design's
`pii_readonly_ops` role cannot see them). `nonce`, `auth_tag` and `lookup_token` must come back as bytes.
`findTransientPhone` stays `null` until temporary-phone storage is confirmed (BQ-02, BQ-04); `findFreeTextKey`
needs the free-text key table (BQ-45).

**Never** point these queries at the Aisle app database (`aisleweb`): it is out of scope and holds real users' data.

### Audit trail (MongoDB)

The audit trail lives in MongoDB `audit_trails`, not in SQL. Tests read it through `AuditRepository`
(`src/db/audit-repository.ts`): one read-only look-up by request ID. No implementation exists yet, so AISLE-DB-014
and AISLE-DB-015 are **Blocked (BQ-30)** until Dev provides read-only access; the MongoDB driver is added then.

## 4. Safety measures built in

- Session forced read-only (PostgreSQL `default_transaction_read_only=on`; MySQL `SET SESSION TRANSACTION READ ONLY`).
- SQL guard rejects anything but a single SELECT/WITH.
- Parameters are always bound by the driver.
- Rows are validated against the alias contract; errors list column names only, never values.
- Driver errors are re-thrown with the driver code only (no host, user or connection string).
- A query that still contains `PENDING_` counts as not configured and never runs.

## 5. What the DB tests do and do not claim

AISLE-DB-006…013 also check the storage layout from the PII-service design (12-byte nonce, 16-byte auth tag, key
version, fresh encryption on every save, search fingerprints, one active key, free-text key storage). Those
expectations come from the design and are marked "to be confirmed by Dev" (BQ-04, BQ-45).

The basic tests verify: the record exists after a save, the user/field (and tenant, if stored) association, a single row after
a replace, that the stored bytes change when the value changes, that the readable value (plain, hex, Base64) is not
stored, and that the key version matches the API. They **do not** claim that "readable value absent" proves strong
encryption — that needs the storage format from Dev (BQ-04).
