# Aisle PII API — Test Automation

## The idea

Aisle stores people's personal data (email, phone, name) through a **PII service** that keeps it **encrypted**.
QA does not call that service directly. QA tests the **Aisle PII facade**: Aisle's front door to the PII service.

```
QA automation ──Bearer token──▶ Aisle PII facade ──(tenant + signature added by Aisle)──▶ PII service ──▶ PII DB
      ▲                                                                                                   │
      └──────────────────────────── read-only DB validation (optional) ◀──────────────────────────────────┘
```

This project is an **automated test suite** for that facade. With one command it checks that:

| Checks that…                     | Example                                                                    |
| -------------------------------- | -------------------------------------------------------------------------- |
| **it works**                     | save a name, replace it, read it back, bulk-read several users             |
| **only the token gets in**       | no token, a wrong token or a malformed header is refused (401)             |
| **bad input is refused cleanly** | missing fields, wrong types, over-long values → 422; broken JSON → 400     |
| **the tenant can't be spoofed**  | a `tenant_id` sent by the caller never moves data out of tenant `aisle`    |
| **nothing leaks**                | error replies don't echo personal data; logs/reports never hold the token  |
| **the DB stores it protected**   | (once DB access is given) the stored value is not the readable plain value |

Every run ends with a **report** anyone can read in seconds, and an **Excel sheet** of all test cases.

### How one test run flows

```
npm run test:all
   │
   ├─▶ tests/…              a test makes fake, unique data (qa-auto-<run>-…) and calls the facade
   │     └─▶ src/clients        adds "Authorization: Bearer <token>" + JSON header centrally, sends, logs (redacted)
   │           └─▶ Aisle facade    authenticates QA, sets tenant "aisle", signs, forwards to the PII service
   │     ◀── src/assertions     checks status, response shape and values (never prints personal data)
   │     ◀── src/db             optionally confirms in the DB that the value is stored protected (read-only)
   │
   ├─▶ reporting/collector    saves each result WITHOUT any personal data or token
   └─▶ reporting/generator    builds the report + PDF + Excel  →  reports/qa-report/index.html
```

### How the automation works (step by step)

1. The test generates (or loads) controlled test data — always fake, unique per run.
2. The test calls the Aisle PII facade.
3. Aisle authenticates the QA request (the Bearer token).
4. Aisle internally adds the PII-service authentication (tenant + signature) — QA never does this.
5. The PII service processes the request.
6. The value is stored / retrieved.
7. The automation validates Aisle's response.
8. Where applicable, read-only DB validation checks the value is stored protected.
9. A sanitized result (no personal data, no token) goes to the report.

---

## Folder structure

```
PII_Automation_Framework/
│
├── tests/                          THE TESTS (54 planned) — one folder per area
│   ├── poc/                          POC-001…003: save name → read name → check DB (the first proof)
│   ├── health/                       facade readiness
│   ├── pii/                          save · read · search · bulk read · clean-up rules
│   ├── transient/                    temporary phones (create, resolve, promote)
│   ├── free-text/                    free-text encryption keys (create, read, revoke)
│   ├── security/                     token checks · tenant spoofing · leak checks
│   ├── contract/                     response formats
│   ├── db/                           read-only DB validation
│   ├── catalog/                      plain-English description of every test (Excel + report read this)
│   └── unit/                         self-tests of the framework itself (no network needed)
│
├── src/                            THE FRAMEWORK
│   ├── clients/
│   │   ├── aisle-pii-client.ts         one method per facade endpoint: writePii(), readPii(), batchRead() …
│   │   ├── base-api-client.ts          adds the Bearer token centrally, sends, logs safely
│   │   └── endpoints.ts                the 11 facade endpoints (/api/v1/pii-test…)
│   ├── fixtures/                     what every test receives (aisle, data, cleanup, db, log) + Blocked helpers
│   ├── assertions/                   expectSuccess(), expectUnauthorized(), expectValidationError() …
│   ├── models/                       expected request/response shapes (Zod) — observed on staging
│   ├── data/                         fake, unique test data (user IDs, emails, names, approved phones)
│   ├── db/                           read-only DB access + configurable query catalog
│   ├── config/                       reads and validates .env; the token is kept secret
│   └── utils/                        logger that hides secrets, retry, request IDs, clean-up list
│
├── reporting/                      THE REPORT (dashboard, PDF, Excel/CSV/JSON export, history)
├── scripts/                        helpers: test-all (tests → report → PDF → Excel), check-env, doc generators
├── docs/                           guides — start with backend-open-questions.md and coverage-matrix.md
│   └── test-cases.xlsx               ALL TEST CASES in Excel, grouped by endpoint
├── config/db-queries.example.json  template for the read-only DB queries (all names PENDING until Dev confirms)
├── .github/workflows/              CI: checks every pull request; facade tests daily 08:00 IST + report email, or on demand
├── .env.example                    settings template (no real values)
├── PENDING-PLACEHOLDERS.md         everything still owed by Dev, and which tests it blocks (generated)
└── playwright.config.ts            test runner: projects (unit / api), reporters
```

**Created locally, never committed:** `.env` (your settings + the token) · `reports/` · `test-results/` ·
`node_modules/`.

---

## Anatomy of a test

```ts
test(
  'AISLE-RD-001 Reading a saved name returns exactly that name',
  { tag: ['@smoke', '@phase1'] },
  async ({ aisle, data, cleanup }) => {
    const userId = data.userId('rd1'); // 1. fake, unique user
    const name = data.name();
    await seedField(aisle, cleanup, { userId, field: 'NAME', value: name }); // 2. setup: save it

    const read = expectSuccess(
      await aisle.readPii({ user_id: userId, field_names: ['NAME'] }), // 3. Bearer-authenticated call, no tenant_id
      200,
      readPiiDataSchema,
      'PII read successful', // 4. expected status + shape + message (observed)
    );
    expectSecretEquals(read.items[0]?.value, name, 'NAME'); // 5. compare without printing the value
  },
);
```

- **IDs** never change: `POC-001…003` (the NAME proof of concept) and `AISLE-<AREA>-NNN` —
  `HLT` health · `WR` save · `RD` read · `SR` search · `BR` bulk read · `NRM` clean-up rules · `TR` temporary
  phones · `FT` free-text keys · `AUTH` token · `SEC` security · `CON` response format · `DB` database.
- **Tags**: `@smoke` · `@phase1` · `@security` · `@db` · `@poc` (everything else is Regression).
- **Every test has a plain-English description** in `tests/catalog/<area>.ts` (what, why, steps, expected, the
  request sent, the checks made, type, priority). Self-test UT-DOC-002 fails until it exists. Test cases are added/changed/removed through the
  **testcase-manager** agent (see [CLAUDE.md](CLAUDE.md)): it proposes first, and changes nothing until approved.
- **Nothing is guessed.** Expected results come from behaviour observed on staging or from Dev's answers. Anything
  unconfirmed is marked **Blocked** with a question in [docs/backend-open-questions.md](docs/backend-open-questions.md).

---

## Statuses

| Status                 | Meaning                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| ✔ **Pass**             | Ran and passed                                                                                               |
| ✘ **Fail**             | Ran and failed — an automation or product problem to investigate ("Expected …, got …")                       |
| ⚠ **Security finding** | Ran and failed on a **known security defect** reported to Dev (none today). Not an automation problem.       |
| ⏸ **Blocked**          | Could not be tested: access, data or an answer from Dev is missing. The reason (BQ-xx) is shown. Not a pass. |
| ↷ **Skipped**          | Deliberately not run (e.g. out of scope via settings)                                                        |
| — **Not Tested**       | Not part of this run (or the facade was unreachable)                                                         |

Blocked tests unblock themselves: e.g. the EMAIL tests run for real as soon as Dev grants EMAIL access — today
they record the real `403 AUTHORIZATION_DENIED` as the reason.

---

## Running it

**Setup** (Node.js 20.19+):

```bash
npm ci && npx playwright install chromium
npm run verify                     # typecheck, lint, format, framework self-tests (no network)
cp .env.example .env               # then put the Aisle test token in AISLE_TEST_TOKEN (never commit it)
npm run check-env                  # checks settings, the token and which fields the Aisle caller can use
```

**Run against the Aisle staging facade** (`https://testa2.aisle.co/V1`):

```bash
npm run test:poc                   # POC-001…003 (NAME) — POC-003 is Blocked until read-only DB access (BQ-04)
npm run test:phase1                # the 10 Phase-1 tests that prove the migration
npm run test:all                   # all tests → report → PDF → Excel
npm run report                     # rebuild the report from the last run
npm run report:open
```

Subsets: `npm run test:smoke` · `npm run test:security` · `npm run test:db` · one test:
`npx playwright test --grep AISLE-RD-001`. All commands: [docs/execution-guide.md](docs/execution-guide.md).

---

## Rules (enforced in code)

- The Aisle test token lives only in `.env` / CI secrets. It is never hard-coded, printed, logged, put in reports or
  error messages; the logger scrubs it and any `Authorization` header.
- Logs never contain bodies or personal data. The **report** shows each call's exact request (curl) and response for
  debugging — safe because all test data is fake — with the token always shown as `$AISLE_TEST_TOKEN`.
  Assertions compare without printing values.
- Fake data only (`qa-auto-…` users, `example.test` emails, team-approved phone numbers). Never production data.
- The database is read-only (SELECT only — writes are rejected by the framework).
- Never fake results: a test that can't run shows as **Blocked** or **Skipped**, with the reason.

---

## Status and docs

| Part                 | Tests | Status                                                                                   |
| -------------------- | :---: | ---------------------------------------------------------------------------------------- |
| Framework self-tests |  60   | passing (`npm run verify`)                                                               |
| Aisle facade tests   |  54   | written; see the migration report for the latest staging run and what is Blocked and why |

[Backend open questions](docs/backend-open-questions.md) · [Coverage matrix](docs/coverage-matrix.md) ·
[Pending placeholders](PENDING-PLACEHOLDERS.md) · [Test cases (Excel)](docs/test-cases.xlsx) ·
[Setup](docs/setup-guide.md) · [Commands](docs/execution-guide.md) · [Endpoints](docs/endpoint-inventory.md) · [Aisle API (curl)](docs/aisle-api.md) ·
[Architecture](docs/framework-architecture.md) · [Database](docs/database-setup.md) · [Report](docs/reporting.md) ·
[Troubleshooting](docs/troubleshooting.md) · [Archive (old direct-PII design)](docs/archive/)
