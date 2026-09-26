# Execution Guide

## Commands

| Command                                 | Runs                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| `npm run verify`                        | typecheck + lint + format check + unit tests (no service)          |
| `npm run test:unit`                     | framework self-tests only (no service, no .env)                    |
| `npm run test:api`                      | all integration tests against `PII_BASE_URL`                       |
| `npm run test:poc`                      | POC-001 (Write → DB → Read)                                        |
| `npm run test:smoke`                    | `@smoke` critical path (15 tests)                                  |
| `npm run test:regression`               | `@regression` (all functional)                                     |
| `npm run test:security`                 | `@security` (auth, authz, tenant isolation, response security)     |
| `npm run test:db`                       | `@db` (needs DB config)                                            |
| `npm run test:debug`                    | integration tests, 1 worker, no retries, redacted logs to console  |
| `npm test`                              | unit + integration                                                 |
| `npm run test:list`                     | list all tests without running                                     |
| `npm run test:all`                      | tests → dashboard → history → PDF (see docs/reporting.md)          |
| `npm run report`                        | PII Sentinel dashboard from the last run → `reports/qa-report`     |
| `npm run report:pdf`                    | programmatic PDF of the dashboard                                  |
| `npm run report:open`                   | open the latest report (`-- --demo` opens the demo report)         |
| `npm run report:demo`                   | sample report + PDF from made-up DEMO data → `reports/demo-report` |
| `npm run report:dev`                    | live preview while editing the report's design                     |
| `npm run report:test`                   | tests for the report itself                                        |
| `npm run report:clean`                  | delete generated reports (`-- --all` also deletes run history)     |
| `npm run report:playwright`             | Playwright's raw HTML report (`reports/html`)                      |
| `npm run check-env`                     | validate `.env` and send one signed probe per caller               |
| `npm run keys:generate -- <path>`       | create an Ed25519 caller key pair (`<path>.pem` + `.pub.pem`)      |
| `npm run typecheck` / `lint` / `format` | code checks and formatting                                         |
| `npm run docs:traceability`             | regenerate `docs/requirements-traceability.md`                     |

Useful Playwright options (append after `--`):

```bash
npm run test:api -- -g "PII-WR-00"                 # by ID prefix
npm run test:api -- tests/transient                # by folder
npm run test:api -- --grep-invert @db              # everything except DB
npm run test:api -- --workers=2                    # parallelism
ENV_FILE=.env.qa npm run test:smoke                # environment selection
PII_TEST_RUN_ID=qa-auto-20260926t101500-ab12 npm run test:api -- -g PII-RD-001   # reproduce a run's IDs
```

`test:debug` sets env vars inline (macOS/Linux). On Windows PowerShell:
`$env:PII_LOG_TO_CONSOLE='true'; npx playwright test --project=api --workers=1`.

## Reading results

- **PII Sentinel dashboard**: `reports/qa-report/index.html` (+ `report.pdf`, `results.csv`, `results.json`, `summary.txt`) — see `docs/reporting.md`.
- **Playwright HTML report**: `reports/html` — each test has `api-calls.log` (redacted: endpoint, method, request ID, caller role,
  status, error code, duration) and, where relevant, `cleanup-summary.json`.
- **Annotations**: `blocked` (question ID + reason) and `assumption` (tolerant expectation).
- **JUnit**: `reports/junit/results.xml` for CI dashboards. **JSON**: `reports/json/results.json`.
- Traces/screenshots/videos are deliberately off (see architecture §3).

Statuses: _passed_; _failed_ (real defect **or** missing config — the message says which); _skipped_ (out of scope via
`PII_ENDPOINTS_IN_SCOPE`, or a data prerequisite like PH2); _fixme_ (blocked by a backend question).

## Parallelism and data

Tests are independent: every test creates its own run-prefixed users, emails and keys. Batch seeding is chunked (10 at a time).
The run ID is shared across workers. Use a dedicated QA tenant: data is never deleted (no delete API, Q-15).

## Correlating with server logs

Every call's `X-Request-Id` is in `api-calls.log`. Give it to the backend team to find the matching server-side log entry.
