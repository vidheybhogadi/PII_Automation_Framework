# Project rules for Claude

## Repository layout (M1 / M2 split, 2026-10-19)

Everything is organised by milestone. Put new files in the matching folder; never recreate the old root `src/`,
`tests/`, `config/` or `test-data/` folders.

| Folder       | Holds                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `core/`      | Shared, milestone-agnostic code (`utils/`, `db/` read-only adapter, `config/placeholders.ts`). Never imports from `m1/` or `m2/`.      |
| `m1/`        | Milestone 1 (Aisle PII facade): `src/`, `tests/` (+ `catalog/`, `unit/`), `config/db-queries*.json`, `scripts/`, `docs/`, `test-data/` |
| `m2/`        | Milestone 2 (Aisle business APIs): `tests/` (Playwright project `m2-api`), `scripts/`, `docs/`                                         |
| `reporting/` | Shared report (dashboard, PDF, exports, history)                                                                                       |
| `scripts/`   | Shared helpers: `test-all.ts`, `check-env.ts`, `sync-ci-env.ts`, report mail                                                           |
| `docs/`      | Shared guides: setup, execution (commands), architecture, reporting, troubleshooting                                                   |

- **npm scripts:** milestone commands are prefixed — `m1:test:*`, `m1:docs:*`, `m2:test`, `m2:docs`. Shared tooling
  is unprefixed: `verify`, `typecheck`, `lint`, `format`, `check-env`, `ci:sync-env`, `report:*`.
- **Playwright projects:** M1 keeps the names `unit` and `api` (the reporting layer, run history and demo data key on
  them); M2 uses `m2-api`.
- **CI:** `.github/workflows/m1-pii-api-tests.yml` (M1 only; M2 gets its own workflow once it has tests).
- **DB:** `DB_QUERIES_FILE=m1/config/db-queries.json`. The PII DB is behind PgBouncer (port 6432), which rejects
  startup options, so `core/db/db-client.ts` runs every query in its own `BEGIN READ ONLY` transaction.

## Test cases

Architecture under test: **QA automation → Aisle PII facade (Bearer token) → PII service → PII DB**. QA calls only
the Aisle facade; never the PII service directly, never Ed25519 signing, never a QA-supplied `tenant_id`.

Any request to draft, add, modify or remove Aisle PII API test cases goes through the **testcase-manager** agent
(`.claude/agents/testcase-manager.md`) — never edit tests directly.

1. Call the agent to **PROPOSE** (it changes nothing) and show the user its test-case table.
2. Wait for the user's approval or changes.
3. Send the approval (with any changes) back to the same agent to **IMPLEMENT**. It updates the test code, the test
   catalog, traceability, `m1/docs/test-cases.xlsx` and the generated docs, then runs `npm run verify`.

Demo data (`reporting/fixtures/`) is never changed for test-case edits.

### Milestone 2 — Aisle business APIs (exception to the facade-only rule above)

Milestone 2 tests the real Aisle application APIs that read/write first name, email and phone through the PII
integration (`m2/docs/aisle-pii-affected-apis.md`, branch `saurabh/pii-changes`). These are called with the auth each
route needs — user JWT, web JWT, `TEST_TOKEN` (`/V1/pii_integration/*`), CMS admin JWT — never with Ed25519 signing or
`X-PII-*` headers. The facade-only rule applies to Milestone 1 only.

- The M2 design workbook (`m2/docs/m2-test-cases.xlsx`, built from `m2/scripts/m2-test-cases.data.ts` by
  `npm run m2:docs`) is a Dev-review document and may be edited directly. M2 **test code** changes still go through
  the testcase-manager agent (PROPOSE → approval → IMPLEMENT).
- M2 open questions use `M2Q-xx` IDs and live in the workbook's Dev Review sheet; M1 `BQ-xx` rules are unchanged.
- M2 tests must run separately from M1 (own Playwright project / tag `@m2`). Synthetic accounts only; payment,
  webhook and CMS-write cases never run against real providers or real users.

## Backend open questions (`m1/docs/backend-open-questions.md`)

- Keep **only open questions** in this file. When a question is answered, resolved, confirmed or closed, **delete its
  row** (don't change its status) and update the tests / coverage matrix that cited it. Remove a section whose table
  becomes empty.
- When no questions remain, replace the tables with the "✅ All clear" message from the template comment in the file.
- Self-test UT-DOC-003 fails if a row is not `Open` or a question table is left empty; regenerate
  `m1/docs/PENDING-PLACEHOLDERS.md` (`npm run m1:docs:pending`) after every change.

## Always

- Never log or print the Aisle test token, the Authorization header value, DB credentials or other secrets. The
  token lives only in `.env` / CI secrets and appears in reports only as `$AISLE_TEST_TOKEN`.
- Reports show the exact request (curl) and response of every call for debugging — allowed because ALL test data
  is synthetic (user decision, 2026-10-01). The redacted `api-calls.log` and console logs still hold no bodies.
- Expected results come only from observed staging behaviour or Dev's answers (`m1/docs/backend-open-questions.md`) —
  never guessed. Unknowns are marked Blocked with a BQ-xx question; real defects stay failing (security findings).
- Synthetic test data only; never production records or real phone numbers. Read-only DB access only.
- Never fabricate test results. Do not commit or push unless asked.
