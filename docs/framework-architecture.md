# Framework architecture

```
                       ┌────────────────────────── this repository ───────────────────────────┐
 tests/<area>/*.spec   │  fixtures ──▶ AislePiiClient ──▶ BaseApiClient ──▶ Axios ──HTTPS──┐   │
   (what to check)     │  (aisle,data,  (one method per   (Bearer token,     (no Playwright  │   │
                       │   cleanup,db)   facade endpoint)  JSON, request ID,   tracing: no    │   │
                       │                                   redacted log)       bodies/tokens  │   │
 tests/catalog/*       │  assertions ◀── ApiResponse (body private; safe summary only)  in traces)│
   (plain-English      │  db (read-only) ◀── PiiRepository ◀── config/db-queries.json          │   │
    descriptions)      └──────────────────────────────────────────────────────────────────────┘   │
                                                                                                   ▼
                                    Aisle PII facade (testa2) ──▶ PII service ──▶ PII DB
```

## Layers

| Layer         | Files                                                   | Responsibility                                                                                               |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Configuration | `src/config/*`                                          | Parse and validate `.env`; the token and DB password are `Secret`s and registered with the log scrubber      |
| HTTP client   | `src/clients/base-api-client.ts`, `aisle-pii-client.ts` | Add `Authorization: Bearer …` and `Content-Type` centrally; never send tenant/caller/signature; safe logging |
| Endpoints     | `src/clients/endpoints.ts`                              | The 11 facade endpoints; which are retry-safe (reads only)                                                   |
| Models        | `src/models/*`                                          | Zod schemas of observed responses; provisional ones (search, transient, free-text) are marked                |
| Assertions    | `src/assertions/*`                                      | Status/shape/value checks whose messages never contain values or the token                                   |
| Test data     | `src/data/*`                                            | Run-unique fake users/emails/names; phones only from the approved list                                       |
| Fixtures      | `src/fixtures/*`                                        | `aisle`, `data`, `cleanup`, `db`, `log`; preflight health check; Blocked / security-finding helpers          |
| DB            | `src/db/*`                                              | Read-only adapter (rejects anything but SELECT/WITH), configurable query catalog                             |
| Reporting     | `reporting/*`                                           | Collector (sanitized results) → report, PDF, Excel/CSV/JSON, history                                         |

## Blocked, not faked

- `blockIfAccessDenied(res, …)` — a real 403 `AUTHORIZATION_DENIED` marks the test **Blocked** with the observed
  response; once Dev grants access the same test runs its real assertions.
- `blockedBy('BQ-xx', …)` — the expected behaviour is not confirmed; the test body does not run.
- `db` fixture — Blocked (BQ-04) while read-only DB access is not configured.
- `securityFinding('BQ-xx', …)` — tags a test that checks a known defect; it keeps its strict assertion and shows
  as **Security finding** when it fails.

## Secrets

The token is only read from `.env` / CI secrets, wrapped in `Secret` (not printable), registered with the log
scrubber (removed from any text), sent only in the `Authorization` header, and never logged — log lines record
`auth: "token" | "none" | "custom"` instead. Axios is used instead of Playwright's request API so traces can
never capture headers or bodies.

**Request/response capture for debugging** (`src/utils/exchange-recorder.ts`): every call is recorded as a curl
plus the exact response and shown in the report's test details. Bodies are kept in full because all test data is
synthetic; the token is replaced by `$AISLE_TEST_TOKEN` in the recorder, again in the collector and report
builder, and the report self-check refuses to write a report that contains the real token.
