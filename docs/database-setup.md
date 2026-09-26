# Database Setup

> The integration guide does **not** document the PII service's database technology, schema, table names,
> encryption columns, key-version storage or audit table (**Q-03**). No SQL in this repository is presented as
> verified. You must supply it after confirming with the PII backend team.

## 1. What to request

1. Engine: PostgreSQL or MySQL, plus host, port and database name for the QA environment.
2. A **read-only** DB user (SELECT only on the PII tables). Automation never writes to the DB.
3. The table/column names for: PII records, transient phones, free-text keys, audit events.
4. Confirmation of which columns hold ciphertext, key version, consumed state, revocation state.

## 2. Configure

```bash
DB_ENGINE=postgres            # or mysql
DB_HOST=... DB_PORT=5432 DB_NAME=... DB_USER=<read-only user> DB_PASSWORD=<from secret store>
DB_SSL=true
DB_QUERIES_FILE=config/db-queries.json
```

```bash
cp config/db-queries.example.json config/db-queries.json    # git-ignored
# replace every <placeholder> with the confirmed SQL
```

## 3. SQL catalog contract

Each query is `{ "sql": "...", "params": [...] }` or `null`. Rules (enforced by `parseQueryCatalog`, UT-DB-001/005):

- a single `SELECT`/`WITH` statement; no data-modifying keywords
- use the engine's placeholders (`$1, $2…` for PostgreSQL, `?` for MySQL), in the order listed in `params`
- return **exactly these column aliases**:

| Query                        | Params (order)              | Required aliases                                                       | Optional aliases                                    |
| ---------------------------- | --------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| `findPiiRecords`             | `tenant_id, user_id, field` | `tenant_id`, `user_id`, `field`, `encrypted_value` (bytes/text)        | `key_version` (int)                                 |
| `findTransientPhone`         | `transient_id`              | `tenant_id`, `encrypted_value`, `expires_at`, `is_consumed` (bool/0/1) | `caller_id`                                         |
| `findFreeTextKey`            | `key_id`                    | `tenant_id`, `status`                                                  | `caller_id`, `revoked_at`, `encrypted_key_material` |
| `findAuditEventsByRequestId` | `request_id`                | `event_type`                                                           | —                                                   |

The `field` parameter is passed in canonical uppercase (`EMAIL`), as documented ("stored uppercase").

## 4. Safety measures built in

- Session forced read-only (PostgreSQL `default_transaction_read_only=on`; MySQL `SET SESSION TRANSACTION READ ONLY`).
- SQL guard rejects anything but a single SELECT/WITH.
- Parameters are always bound by the driver.
- Rows are validated against the alias contract; errors list column names only, never values.
- Driver errors are re-thrown with the driver code only (no host, user or connection string).
- Connections are pooled per worker (max 4) and closed at worker teardown.

## 5. What the DB tests do and do not claim

They verify association (tenant/user/field), single-row upsert, "not stored as plaintext" (utf8/hex/base64 forms),
that ciphertext changes when the value changes, key_version consistency with the API, transient consumption and key revocation state.
They **do not** claim that "plaintext absent" proves strong encryption, assume deterministic ciphertext, or compare against
hard-coded ciphertext.

## 6. Behaviour when not configured

`DB_ENGINE=none` (default): every test requesting the `db` fixture **fails** with an actionable `DbConfigError`.
Run `npm run test:api -- --grep-invert @db` to exclude DB tests explicitly until the DB is available.
