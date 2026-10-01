# Troubleshooting

| Symptom                                                                | Likely cause                                        | Fix                                                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ConfigError: Aisle API tests cannot run — … AISLE_TEST_TOKEN`         | `.env` absent or token not set                      | `cp .env.example .env`, set `AISLE_TEST_TOKEN`, run `npm run check-env`                    |
| `Aisle rejected the test token … HTTP 401`                             | Wrong / rotated token                               | Ask the Aisle backend team for the current test token                                      |
| Every call → 401 with an empty body                                    | Token missing, wrong, or header malformed           | `npm run check-env`; never add "Bearer" to the value in `.env` — the client adds it        |
| `ApiTransportError: … (ENOTFOUND …)`                                   | Wrong host (e.g. `testa3`, which does not exist)    | Use `AISLE_BASE_URL=https://testa2.aisle.co/V1`                                            |
| `(ETIMEDOUT/ECONNABORTED …)` on the first call                         | Staging cold start (~14 s observed 2026-09-29)      | Retry; `PII_HTTP_TIMEOUT_MS` defaults to 30 s                                              |
| `Preflight failed — facade not ready`                                  | Facade/PII service not ready                        | Wait, or contact the backend team with the request ID from `api-calls.log`                 |
| EMAIL / search / free-text tests show **Blocked (ACCESS)**             | Access granted on 2026-10-01 is refused again (403) | Ask Dev; `npm run check-env` shows which fields are accessible                             |
| Temporary-phone tests show **Blocked (BQ-02/BQ-03)**                   | No approved test phones; access not confirmed       | Expected until Dev answers BQ-02 / BQ-03                                                   |
| Phone tests show **Blocked (BQ-03)**                                   | No approved test phone numbers                      | Get approved numbers; put them in `AISLE_TEST_PHONES`                                      |
| DB tests show **Blocked (BQ-04)**                                      | DB access / query catalog not configured            | See [database-setup.md](database-setup.md)                                                 |
| `Row 0 of "findPiiRecords" does not match the required column aliases` | Catalog SQL returns wrong aliases                   | Alias columns exactly as in `database-setup.md` §3                                         |
| `Only read-only SELECT/WITH queries are permitted`                     | Catalog contains a write or multiple statements     | Use a single SELECT                                                                        |
| `npm ci` warns about install scripts (esbuild/fsevents)                | npm install-script policy                           | Harmless; `npm install-scripts approve esbuild` if `tsx` scripts fail                      |
| Need more detail on a failure                                          | —                                                   | `npm run test:debug -- -g <ID>`; logs are redacted (no token, no bodies, no personal data) |
