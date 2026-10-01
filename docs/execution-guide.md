# Execution guide

All commands run from the project root. The facade tests need `.env` with `AISLE_TEST_TOKEN`
(see [setup-guide.md](setup-guide.md)).

## Everyday commands

| Command                     | What it does                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run verify`            | typecheck + lint + format check + framework self-tests (no network)                               |
| `npm run check-env`         | validates `.env`, checks the token against the facade, shows which fields are accessible          |
| `npm run test:poc`          | POC-001…003 — the email proof of concept (save → read → DB)                                       |
| `npm run test:phase1`       | the 8 Phase-1 tests that prove the migration to the Aisle facade                                  |
| `npm run test:smoke`        | the Smoke suite                                                                                   |
| `npm run test:regression`   | the Regression suite                                                                              |
| `npm run test:security`     | token, tenant-spoofing and leak checks                                                            |
| `npm run test:db`           | read-only DB validation (Blocked until DB access is given)                                        |
| `npm run test:api`          | every facade test                                                                                 |
| `npm run test:all`          | all facade tests → report → PDF → `docs/test-cases.xlsx` → open report (extra args are passed on) |
| `npm run report`            | rebuild the report from the last run (`reports/latest/run-data.json`)                             |
| `npm run report:open`       | open the report                                                                                   |
| `npm run report:pdf`        | export the report to PDF                                                                          |
| `npm run docs:testcases`    | rebuild `docs/test-cases.xlsx` (keeps Tester Notes)                                               |
| `npm run docs:pending`      | rebuild `PENDING-PLACEHOLDERS.md`                                                                 |
| `npm run docs:traceability` | rebuild `docs/requirements-traceability.md`                                                       |

Every `test:*` command except `test:unit`, `test:debug` and `test:list` runs the full pipeline: tests → report
(`reports/qa-report/`, archived copy in `reports/archive/<timestamp>__<run-id>/`) → PDF → `docs/test-cases.xlsx`,
then opens the dashboard in your browser. Auto-open is skipped in CI; turn it off locally with `-- --no-open` or
`REPORT_OPEN=false`.

## Daily run and report email (GitHub Actions)

[`.github/workflows/pii-api-tests.yml`](../.github/workflows/pii-api-tests.yml) runs the full `npm run test:all`
on staging **every day at 08:00 IST** (cron `30 2 * * *`, UTC; GitHub may start it a few minutes late, and only
from `main`). Pull requests run only the offline checks. After the report and PDF are built, `npm run report:mail`
emails it: a short summary and the run link, then **every PDF page shown inline** in the body (no attachment). If
no report was produced, a short "run failed" email is sent instead. A manual run (Actions → Run workflow) can
switch the email off with `send_email`.

Settings in GitHub (Settings → Environments → `staging`):

| Name                         | Kind     | Value                                                                 |
| ---------------------------- | -------- | --------------------------------------------------------------------- |
| `SMTP_USER`, `SMTP_PASSWORD` | secret   | Microsoft 365 mailbox that sends the report (SMTP AUTH enabled by IT) |
| `REPORT_MAIL_TO`             | variable | comma-separated recipients (default `vidhey.bhogadi@infoedge.com`)    |
| `REPORT_MAIL_FROM`           | variable | optional sender address (defaults to `SMTP_USER`)                     |
| `SMTP_HOST`, `SMTP_PORT`     | variable | optional (default `smtp.office365.com`, `587`)                        |

Preview the email locally without sending: `npm run report:mail -- --dry-run` → `reports/email-preview/email.html`.

## Single tests and debugging

```bash
npx playwright test --grep AISLE-RD-001                 # one test
npx playwright test tests/security                      # one folder
npm run test:debug -- --grep AISLE-WR-002               # one worker, redacted log lines on the console
PII_TEST_RUN_ID=qa-auto-20260929t101500-ab12 npm run test:api -- -g AISLE-RD-001   # reproduce a run's IDs
```

Every test attaches a redacted `api-calls.log` (method, path, status, request ID, error code — never the token,
bodies or personal data) and `api-exchanges.json`: the **exact request (as a copy-paste curl) and response** of
each call. The report's test details show the latter — expand a request to copy the curl; failed tests also show
**Expected vs actual response**. Test data is fake, so bodies are shown in full; the token is always replaced by
`$AISLE_TEST_TOKEN`, so a copied curl runs with your own `.env`.

## Reading the results

- **Pass / Fail** — ran; Fail means investigate.
- **Security finding** — failed on a known, reported defect (a test marked with a BQ-xx security finding; none
  today). Expected until Dev fixes it; it still makes the run "not green".
- **Blocked** — could not be tested; the reason names the BQ-xx question (e.g. EMAIL access denied with the real
  403). These run for real automatically once the blocker is removed.
- **Skipped / Not Tested** — deliberately not run / not part of this run.

Test data can't be deleted (no delete API): every writing test records what it left behind in
`cleanup-summary.json`. Generated users all start with the run prefix (`qa-auto-…`).
