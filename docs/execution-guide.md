# Execution guide

All commands run from the project root. The facade tests need `.env` with `AISLE_TEST_TOKEN`
(see [setup-guide.md](setup-guide.md)).

## Everyday commands

| Command                        | What it does                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `npm run verify`               | typecheck + lint + format check + framework self-tests (no network)                                  |
| `npm run check-env`            | validates `.env`, checks the token against the facade, shows which fields are accessible             |
| `npm run m1:test:poc`          | POC-001…003 — the email proof of concept (save → read → DB)                                          |
| `npm run m1:test:phase1`       | the 8 Phase-1 tests that prove the migration to the Aisle facade                                     |
| `npm run m1:test:smoke`        | the Smoke suite                                                                                      |
| `npm run m1:test:regression`   | the Regression suite (includes the two `@slow` expiry tests, ~5½ min, run in parallel)               |
| `npm run m1:test:security`     | token, tenant-spoofing and leak checks                                                               |
| `npm run m1:test:db`           | read-only DB validation (Blocked until DB access is given)                                           |
| `npm run m1:test:api`          | every facade test                                                                                    |
| `npm run m1:test:all`          | all facade tests → report → PDF → `m1/docs/test-cases.xlsx` → open report (extra args are passed on) |
| `npm run report`               | rebuild the report from the last run (`reports/latest/run-data.json`)                                |
| `npm run report:open`          | open the report                                                                                      |
| `npm run report:pdf`           | export the report to PDF                                                                             |
| `npm run m1:docs:testcases`    | rebuild `m1/docs/test-cases.xlsx` (keeps Tester Notes)                                               |
| `npm run m1:docs:pending`      | rebuild `m1/docs/PENDING-PLACEHOLDERS.md`                                                            |
| `npm run m1:docs:traceability` | rebuild `m1/docs/requirements-traceability.md`                                                       |
| `npm run m2:test`              | Milestone 2 business-API tests (project `m2-api`, 2 workers) → `reports/m2/latest/run-data.json`     |
| `npm run m2:test:smoke`        | the M2 Smoke suite (`@smoke`)                                                                        |
| `npm run m2:test:unit`         | M2 framework self-tests (no network; part of `npm run verify`)                                       |
| `npm run m2:report`            | build the M2 report (`reports/m2/qa-report/`) from the last M2 run                                   |
| `npm run m2:contracts:record`  | record staging contract baselines (explicit only) → `m2/contracts/recorded/` + `REVIEW.md`           |
| `npm run m2:contracts:approve` | approve reviewed recordings: `-- --by "<name>" <case…\|all>` → `m2/contracts/approved/`              |
| `npm run m2:docs`              | rebuild `m2/docs/m2-test-cases.xlsx` (+ results of the last M2 run) and the API docs                 |
| `npm run docs:api:drift`       | API docs drift check (run after each M2 run) → `m2/docs/api-drift-report.md` (see below)             |
| `npm run m2:test:drift`        | `m2:test`, then the drift check on that run                                                          |

Every `test:*` command except `m1:test:unit`, `m1:test:debug` and `m1:test:list` runs the full pipeline: tests → report
(`reports/qa-report/`, archived copy in `reports/archive/<timestamp>__<run-id>/`) → PDF → `m1/docs/test-cases.xlsx`,
then opens the dashboard in your browser. Auto-open is skipped in CI; turn it off locally with `-- --no-open` or
`REPORT_OPEN=false`.

## API docs drift check (after each M2 run)

`npm run docs:api:drift` spots changes to the documented APIs automatically and writes
`m2/docs/api-drift-report.md` (+ `.json`), grouped by endpoint, each item with its evidence and a confidence:

- **Code** — fetches `origin/develop_new` in the read-only Aisle clone (`AISLE_REPO_DIR`, default
  `~/Downloads/PII/aisle_new`) and reads `config/routes.rb` and the controllers with `git show` (never checks out, runs
  or copies that code). It compares them with the documented snapshot `ae838f4`: removed routes, new routes under a
  documented controller (listed only — new APIs go through the new-API flow), request params read
  (`params[...]`, `require`/`permit`, `dig`, `fetch`, `required_param(...)`) and literal `render json:` keys.
- **Staging** — the 2xx exchanges of the latest M2 run (`reports/m2/latest/run-data.json`, or `-- --run <file>`):
  request field names sent and top-level response field names returned.
- Anything dynamic (params handed on whole, keys built at run time, routes made by a gem, code and staging
  disagreeing) is listed under **Needs review** or **Could not be determined** and is never applied.

Review the report, then `npm run docs:api:drift -- --apply` appends the evidence-backed changes to
`m2/docs/api-changes.json` (append-only; re-running adds nothing twice) and regenerates `docs/API-Documentation.md`;
`npm run docs:api:publish` updates the API_Guide site. On the site, removed params and response fields stay struck
through ("Removed on <date>") for 90 days, removed endpoints are kept with a Removed badge and left out of the counts,
and every endpoint shows "What changed" and "Last verified". Add `--document-new-routes` to also document the routes found
only in the code (no Dev document) **docs-only**, labelled "from code — confirm with Dev": they are recorded in
`m2/docs/code-discovered-routes.json` / `.md` and added to the docs (`docsOnly: true`) but never to the M2 inventory,
so they get no QA group, test case or test code. Only what the code literally shows is recorded; the rest is "not
stated". Options: `--no-fetch`, `--head <ref>`, `--base <ref>`,
`--repo <path>`.

## Daily run and report email (GitHub Actions)

[`.github/workflows/m1-pii-api-tests.yml`](../.github/workflows/m1-pii-api-tests.yml) runs the full `npm run m1:test:all`
on staging **Monday to Friday** (only from `main`). The cron is `30 20 * * 0-4` (UTC), which is **02:00 IST**
Mon–Fri. It is set 6 hours before the wanted 08:00 IST because GitHub has been starting scheduled runs about 6 hours
late. GitHub does not guarantee the start time, so on a day it runs on time, the run happens at 02:00 IST. A first
job (`schedule-gate`) skips any scheduled run that starts on a Saturday or Sunday in IST. Pull requests run only the
offline checks. After the report and PDF are built, `npm run report:mail`
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
npx playwright test m1/tests/security                      # one folder
npm run m1:test:debug -- --grep AISLE-WR-002               # one worker, redacted log lines on the console
PII_TEST_RUN_ID=qa-auto-20260929t101500-ab12 npm run m1:test:api -- -g AISLE-RD-001   # reproduce a run's IDs
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
