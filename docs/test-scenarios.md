# Test Scenario Matrix

**Execution status legend:** every integration test below is **implemented but NOT yet executed against a
real PII service** (no environment access at build time). Unit tests (`UT-*`) **were executed and pass**.
`Blocked` = marked `fixme` with a question ID until backend information is provided.

**Precondition codes**

- **C** — core integration config: `PII_BASE_URL`, primary caller + key, `PII_TEST_EMAIL_DOMAIN` (tenants are generated per run unless set); service ready (checked automatically per worker).
- **PH** — `PII_TEST_PHONES` (approved numbers). **PH2** — at least 2 approved numbers.
- **T2** — a second tenant (generated per run, or `PII_TEST_TENANT_ID_SECONDARY`). **S** — secondary caller. **L** — limited caller (permission set in `setup-guide.md` §4).
- **DB** — DB engine, read-only credentials, SQL catalog (`database-setup.md`).

Tags: `@smoke` (fast critical path), `@regression` (all functional), `@security`, `@db`, `@poc`, `@contract`, `@slow`.

## POC

| ID      | Scenario                           | Pre   | Steps                                                                                  | Expected                                                                                                                                                                                                        | Status      |
| ------- | ---------------------------------- | ----- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| POC-001 | EMAIL write → DB → read → no leaks | C, DB | Pre-read (404); write mixed-case/space-padded EMAIL; query DB; read via API; scan logs | 201 + envelope; exactly 1 row with correct tenant/user/field; stored value ≠/∌ plaintext (utf8/hex/base64); DB key_version = API key_version (if exposed); read returns normalized email; logs contain no email | Implemented |

## Health & contract

| ID      | Scenario                                           | Pre   | Expected                                                                                        | Status             |
| ------- | -------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------- | ------------------ |
| HLT-001 | Readiness without auth                             | C     | 200, `{status:true, message:"Service is ready", data:{status:"ready"}, error:null}`, exact keys | Implemented        |
| HLT-002 | Not-ready contract                                 | —     | 503 `SERVICE_NOT_READY`, data.status `not_ready`                                                | Blocked Q-17       |
| CON-001 | OpenAPI lists all documented endpoints             | C     | every inventory method+path present                                                             | Implemented (Q-24) |
| CON-002 | No undocumented /api/v1 ops                        | C     | none beyond inventory                                                                           | Implemented        |
| CON-003 | PII payload exact keys (write/read/search×2/batch) | C     | keys exactly as documented                                                                      | Implemented        |
| CON-004 | Transient payload exact keys                       | C, PH | create/resolve/promote keys exact                                                               | Implemented        |
| CON-005 | Free-text + error envelope exact keys              | C     | create/read/revoke + 404 envelope keys exact                                                    | Implemented        |

## Write / normalization

| ID              | Scenario                                           | Pre                             | Expected                                                                 | Status                                    |
| --------------- | -------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| WR-001          | Create new field                                   | C                               | 201, tenant/user/`EMAIL`/int key_version, message "PII write successful" | Implemented                               |
| WR-002          | Replace existing                                   | C                               | 200; read returns new value                                              | Implemented                               |
| WR-003          | Field case-insensitive (`eMail`)                   | C                               | returned/read as `EMAIL`                                                 | Implemented                               |
| WR-004 ×4       | Each required field missing                        | C                               | 422; nothing persisted                                                   | Implemented                               |
| WR-005 ×3, 005b | Empty user_id/field/value/tenant_id                | C                               | 422                                                                      | Implemented                               |
| WR-006          | tenant 65 / user 129 / field 65 / value 1025 chars | C                               | 422 each; nothing persisted                                              | Implemented                               |
| WR-007          | user_id 128 + NAME value 1024 chars                | C                               | 201; read back equal                                                     | Implemented                               |
| WR-008          | Email without `@`                                  | C                               | 400 `VALIDATION_ERROR`; not persisted                                    | Implemented                               |
| WR-009          | Phone 7 / 16 / 0 digits                            | C                               | 400 `VALIDATION_ERROR`; not persisted                                    | Implemented                               |
| WR-010          | Unsupported field                                  | C                               | 400/403/404/422 error                                                    | Tolerant Q-07                             |
| WR-011          | Wrong JSON types                                   | C                               | 422                                                                      | Implemented                               |
| WR-012          | Malformed JSON (validly signed)                    | C                               | 422                                                                      | Implemented                               |
| WR-013          | Whitespace-only NAME                               | C                               | 400/422; not persisted                                                   | Tolerant Q-10                             |
| NRM-001         | Email `  MiXeD@...  `                              | C                               | read = trimmed lowercase                                                 | Implemented                               |
| NRM-002         | Phone `+91 (987) 654-3210` style                   | C, PH                           | read = digits only                                                       | Implemented                               |
| NRM-003         | Name with extra spaces                             | C                               | trimmed, single spaces, case preserved                                   | Implemented                               |
| NRM-004         | 8- and 15-digit phones                             | C, `PII_TEST_PHONE_8/15_DIGITS` | accepted and normalized                                                  | Optional (skipped: 10-digit numbers only) |
| NRM-005         | Already-normalized email                           | C                               | unchanged                                                                | Implemented                               |

## Read

| ID     | Scenario                                              | Pre   | Expected                    | Status      |
| ------ | ----------------------------------------------------- | ----- | --------------------------- | ----------- |
| RD-001 | One field                                             | C     | 200, count 1, correct value | Implemented |
| RD-002 | EMAIL+PHONE+NAME                                      | C, PH | 3 items, correct values     | Implemented |
| RD-003 | Select subset                                         | C     | only NAME returned          | Implemented |
| RD-004 | Mixed existing/missing                                | C     | missing omitted, count 1    | Implemented |
| RD-005 | None of requested exist                               | C     | 404 `PII_NOT_FOUND`         | Implemented |
| RD-006 | Unknown user                                          | C     | 404 `PII_NOT_FOUND`         | Implemented |
| RD-007 | Empty field_names                                     | C     | 422                         | Implemented |
| RD-008 | Missing request fields                                | C     | 422 each                    | Implemented |
| RD-009 | Items belong to requested tenant/user; count = length | C     | holds                       | Implemented |

## Search

| ID     | Scenario                    | Pre                        | Expected                                                                         | Status             |
| ------ | --------------------------- | -------------------------- | -------------------------------------------------------------------------------- | ------------------ |
| SR-001 | Exact email, ids only       | C                          | `matches=[{user_id}]` only (strict), count 1, truncated false, body has no email | Implemented        |
| SR-002 | Un-normalized query         | C                          | same match                                                                       | Implemented        |
| SR-003 | Formatted phone query       | C, PH                      | our user included                                                                | Implemented        |
| SR-004 | No match                    | C                          | 200 count 0 or 404                                                               | Tolerant Q-08      |
| SR-005 | 3 users same email          | C                          | count 3, all ids                                                                 | Implemented        |
| SR-006 | limit 2 < 3 matches         | C                          | count 2, truncated true                                                          | Implemented        |
| SR-007 | limit 2 = 2 matches         | C                          | truncated true (literal reading)                                                 | Implemented (Q-09) |
| SR-008 | No limit, default+1 matches | C                          | count = default (10), truncated                                                  | Implemented        |
| SR-009 | limit 0 / 101 / -1          | C                          | 422                                                                              | Implemented        |
| SR-010 | include_values=true         | C                          | full items with normalized value                                                 | Implemented        |
| SR-011 | Missing/invalid fields      | C                          | 422                                                                              | Implemented        |
| SR-012 | Non-searchable field        | `PII_NON_SEARCHABLE_FIELD` | rejected                                                                         | Blocked Q-18       |

## Batch read

| ID     | Scenario                           | Pre | Expected                      | Status             |
| ------ | ---------------------------------- | --- | ----------------------------- | ------------------ |
| BR-001 | 2 users × 2 fields                 | C   | 4 items, exact pairs & values | Implemented        |
| BR-002 | Some fields missing                | C   | omitted, count 3              | Implemented        |
| BR-003 | One user has none                  | C   | 404 whole batch               | Implemented        |
| BR-004 | Exactly max items (50)             | C   | 200, count 50                 | Implemented        |
| BR-005 | max + 1 items (all users exist)    | C   | rejected 400/413/422          | Tolerant Q-19      |
| BR-006 | Duplicate users/fields             | C   | 1 item                        | Implemented (Q-20) |
| BR-007 | Empty arrays; 201 users; 65 fields | C   | 422 / rejected                | Implemented        |

## Transient phone

| ID     | Scenario                          | Pre              | Expected                                                          | Status        |
| ------ | --------------------------------- | ---------------- | ----------------------------------------------------------------- | ------------- |
| TR-001 | Create                            | C, PH            | 201, UUID, expires_at ≈ now+ttl                                   | Implemented   |
| TR-002 | Resolve                           | C, PH            | 200, digits, same expires_at, `no-store`                          | Implemented   |
| TR-003 | Other caller resolve/promote      | C, PH, S         | 404; owner still resolves                                         | Implemented   |
| TR-004 | Other tenant resolve/promote      | C, PH, T2        | 404                                                               | Implemented   |
| TR-005 | Unknown / malformed id            | C                | 404 / 422                                                         | Implemented   |
| TR-006 | Promote new user                  | C, PH            | 200 created+consumed; PHONE readable; resolve 404; re-promote 404 | Implemented   |
| TR-007 | Promote over existing PHONE       | C, PH2           | created=false; new value read                                     | Implemented   |
| TR-008 | TTL min/max accepted; min-1/max+1 | C, PH            | 201 / 400                                                         | Implemented   |
| TR-009 | TTL 0, -1, "abc"                  | C, PH            | 400/422; 422                                                      | Tolerant Q-11 |
| TR-010 | Invalid phones                    | C                | 400                                                               | Implemented   |
| TR-011 | Missing fields                    | C, PH            | 422                                                               | Implemented   |
| TR-012 | Expired mapping                   | C, PH, short TTL | 404 resolve/promote                                               | Blocked Q-12  |

## Free-text keys

| ID     | Scenario                             | Pre   | Expected                                                       | Status             |
| ------ | ------------------------------------ | ----- | -------------------------------------------------------------- | ------------------ |
| FT-001 | Create                               | C     | 201, UUID, 32-byte Base64 key, AES-256-GCM, ACTIVE, `no-store` | Implemented        |
| FT-002 | Read                                 | C     | same key (fingerprint compare), `no-store`                     | Implemented        |
| FT-003 | Revoke then read                     | C     | REVOKED + revoked_at; read 404                                 | Implemented        |
| FT-004 | Revoke twice                         | C     | 404                                                            | Implemented (A-06) |
| FT-005 | Other caller read/revoke             | C, S  | 404; key still active                                          | Implemented        |
| FT-006 | Other tenant                         | C, T2 | 404                                                            | Implemented        |
| FT-007 | Unknown / malformed / missing tenant | C     | 404 / 422 / 422                                                | Implemented        |
| FT-008 | Keys are unique                      | C     | distinct id & material                                         | Implemented        |
| FT-009 | Local AES-256-GCM round trip         | C     | decrypts                                                       | Implemented        |
| FT-010 | Key never in logs                    | C     | no key in log/annotations                                      | Implemented        |

## Authentication (`@security`)

| ID           | Tamper                                                                                                                                                                                                               | Expected                             | Status        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------- |
| AUTH-001     | none (baseline)                                                                                                                                                                                                      | 201                                  | Implemented   |
| AUTH-002…016 | missing/empty/malformed/wrong-length/random signature; unregistered key; tampered body; whitespace mutation; trailing newline; raw-body scheme; missing/unknown/empty caller id; missing request id; no auth headers | 401 auth code; **nothing persisted** | Implemented   |
| AUTH-017     | Secondary caller's key with primary caller id (Pre: S)                                                                                                                                                               | 401; nothing persisted               | Implemented   |
| AUTH-018     | Missing Content-Type                                                                                                                                                                                                 | rejected; nothing persisted          | Tolerant Q-13 |
| AUTH-019     | Limited caller: bad signature vs valid (Pre: L)                                                                                                                                                                      | 401 vs 403                           | Implemented   |
| AUTH-020     | Unsigned call to each /api/v1 endpoint                                                                                                                                                                               | 401 all                              | Implemented   |
| AUTH-021     | Reused request id                                                                                                                                                                                                    | —                                    | Blocked Q-14  |
| AUTH-022     | Replay                                                                                                                                                                                                               | —                                    | Blocked Q-21  |

## Authorization (`@security`, Pre: L)

| ID     | Scenario                                       | Expected              | Status             |
| ------ | ---------------------------------------------- | --------------------- | ------------------ |
| AZ-001 | Write EMAIL without WRITE                      | 403; not persisted    | Implemented        |
| AZ-002 | Read EMAIL without READ                        | 403                   | Implemented        |
| AZ-003 | Read [NAME, EMAIL]                             | 403 (every field)     | Implemented        |
| AZ-004 | Read NAME (positive control)                   | 200                   | Implemented        |
| AZ-005 | Search EMAIL ids-only (positive control)       | 200                   | Implemented        |
| AZ-006 | include_values=true without READ               | 403, no value in body | Implemented        |
| AZ-007 | Search PHONE without SEARCH                    | 403                   | Implemented        |
| AZ-008 | Batch without BULK_READ                        | 403                   | Implemented        |
| AZ-009 | Transient create/promote without WRITE PHONE   | 403                   | Implemented (A-07) |
| AZ-010 | Resolve without READ PHONE                     | 403                   | Implemented        |
| AZ-011 | Free-text create/read/revoke without FREE_TEXT | 403                   | Implemented        |
| AZ-012 | 403 not retried                                | 1 call logged         | Implemented        |

## Tenant isolation (`@security`, Pre: T2)

| ID     | Scenario                                    | Expected                  | Status             |
| ------ | ------------------------------------------- | ------------------------- | ------------------ |
| TI-001 | Same user_id, 2 tenants, different emails   | each tenant reads its own | Implemented        |
| TI-002 | Read A's data via B                         | 404                       | Implemented        |
| TI-003 | Search in A with same email in B            | only A's user             | Implemented        |
| TI-004 | Batch via B                                 | 404                       | Implemented        |
| TI-005 | Update in A                                 | B unchanged               | Implemented        |
| TI-006 | Secondary caller reads same tenant (Pre: S) | 200 (documented model)    | Implemented (Q-27) |

## Response security

| ID      | Scenario                     | Expected                       | Status             |
| ------- | ---------------------------- | ------------------------------ | ------------------ |
| SEC-001 | Invalid email error body     | does not echo value            | Implemented (P-01) |
| SEC-002 | Body = max+1 bytes           | 413 `BODY_TOO_LARGE`           | Blocked Q-22       |
| SEC-003 | `/docs/signature` in non-dev | not usable                     | Blocked Q-23       |
| SEC-004 | Multi-endpoint flow          | no PII/keys/signatures in logs | Implemented        |

## Database (`@db`, Pre: DB)

| ID     | Scenario               | Expected                                                               | Status             |
| ------ | ---------------------- | ---------------------------------------------------------------------- | ------------------ |
| DB-001 | Replace value          | still 1 row; stored bytes changed; not plaintext; key_version matches  | Implemented        |
| DB-002 | PHONE & NAME at rest   | not plaintext                                                          | Implemented        |
| DB-003 | Same user in 2 tenants | 2 rows, each own tenant                                                | Implemented        |
| DB-004 | 401-rejected writes    | no rows                                                                | Implemented        |
| DB-005 | Transient lifecycle    | encrypted, tenant-bound, not consumed → consumed/removed after promote | Implemented (Q-25) |
| DB-006 | Free-text key revoke   | ACTIVE → REVOKED + revoked_at; key not stored raw                      | Implemented (Q-16) |
| DB-007 | Batch audit event      | exactly one `PII_BATCH_READ`                                           | Blocked Q-26       |

## Unit tests (framework self-tests — EXECUTED, 75/75 passing)

| Group           | IDs                                        | Covers                                                                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signer          | UT-SIG-001…014                             | RFC 8032 KAT; byte-for-byte match with guide's Python; digest-not-raw; mutations fail; wrong key; Base64/64-byte format; determinism; invalid keys (RSA/EC/garbage) → safe errors; Secret redaction                                                                                   |
| Client wire     | UT-CLI-001…014                             | transmitted bytes == signed bytes; headers; fresh request IDs; path encoding; unsigned health; header omission (Axios Content-Type injection prevented); tampering; bounded 503 retry only for read-only endpoints; ApiResponse never renders body; logs clean; transport errors safe |
| Config          | UT-CFG-001…010                             | defaults; aggregated actionable errors; no value echo; PEM formats; Secret wrapping; scope; booleans/bounds                                                                                                                                                                           |
| Redaction       | UT-RED-001…006                             | email/phone/PEM/Base64 scrubbing; UUID/timestamp preservation; deep key redaction; logger                                                                                                                                                                                             |
| Data            | UT-DAT-001…008                             | unique IDs across workers; normalization oracles; approved phone validation                                                                                                                                                                                                           |
| Assertions      | UT-AST-001…010                             | messages never contain values; strict search schema; 422 shapes; plaintext detection; leak detection                                                                                                                                                                                  |
| DB              | UT-DB-001…007                              | read-only SQL guard; param binding; alias contract; catalog validation; actionable config errors                                                                                                                                                                                      |
| Inventory/utils | UT-END-001…003, UT-RTY-001/002, UT-CLN-001 | inventory == guide; retry/backoff; cleanup                                                                                                                                                                                                                                            |
