# Setup guide

Architecture under test: **QA automation → Aisle PII facade (Bearer token) → PII service → PII DB**.

QA needs only the **Aisle test token** to run the facade tests. There are no keys to generate, no caller IDs to
register and no tenant IDs to configure: Aisle sets the tenant (`aisle`) and signs requests to the PII service
internally.

## 1. Install

```bash
npm ci
npx playwright install chromium     # only needed for the report tests / PDF export
npm run verify                      # typecheck, lint, format, framework self-tests (no network)
```

## 2. Configure

```bash
cp .env.example .env
```

Fill in `.env` (git-ignored, keep it private — `chmod 600 .env`):

| Setting                                 | Needed for                    | Where to get it                                                                               |
| --------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `AISLE_TEST_TOKEN`                      | every facade test             | Aisle backend team. **Secret** — never commit, paste into chats, tickets or screenshots.      |
| `AISLE_BASE_URL`                        | every facade test             | Defaults to the verified staging facade `https://testa2.aisle.co/V1` (`testa3` doesn't exist) |
| `AISLE_TEST_EMAIL_DOMAIN`               | email tests                   | Default `example.test` (reserved — can never receive mail)                                    |
| `AISLE_TEST_PHONES`                     | phone / temporary-phone tests | QA lead / Aisle backend: team-approved test numbers only (BQ-03). Empty → those tests Blocked |
| `AISLE_TEST_USER_ID`, `…_OTHER_USER_ID` | optional                      | Only if Dev asks QA to use fixed approved test users; otherwise tests generate their own      |
| `DB_*` + `config/db-queries.json`       | POC-003, AISLE-DB-\*          | Aisle backend / DBA: read-only access and the table layout (BQ-04). Missing → Blocked         |

Values starting with `PENDING_` count as "not set". The full list of what is still owed, and which tests it
blocks, is generated in [PENDING-PLACEHOLDERS.md](../PENDING-PLACEHOLDERS.md).

## 3. Check

```bash
npm run check-env
```

This validates `.env` without printing secrets, calls the facade health check with the token, and probes which
fields the Aisle caller can use (a read of a random user that cannot exist — it creates no data):

```
✔ Facade ready and token accepted: GET /api/v1/pii-test/health/ready -> HTTP 200 …
✔ NAME: … -> HTTP 404 code=PII_NOT_FOUND — access OK
⚠ EMAIL: … -> HTTP 403 code=AUTHORIZATION_DENIED — NOT granted to the Aisle caller — tests needing it will be BLOCKED
```

## 4. CI

The GitHub workflow (`.github/workflows/pii-api-tests.yml`) needs, in the GitHub Environment (`staging`):

| Name                      | Kind     | Notes                                               |
| ------------------------- | -------- | --------------------------------------------------- |
| `AISLE_TEST_TOKEN`        | Secret   | required                                            |
| `AISLE_BASE_URL`          | Variable | optional (defaults to `https://testa2.aisle.co/V1`) |
| `AISLE_TEST_PHONES`       | Secret   | optional                                            |
| `DB_*`, `DB_QUERIES_JSON` | Var/Sec  | optional (read-only DB validation)                  |

Until `AISLE_TEST_TOKEN` is set there, the scheduled integration job fails at `check-env` (by design).
