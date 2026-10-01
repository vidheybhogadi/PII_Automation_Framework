# Project rules for Claude

## Test cases

Architecture under test: **QA automation → Aisle PII facade (Bearer token) → PII service → PII DB**. QA calls only
the Aisle facade; never the PII service directly, never Ed25519 signing, never a QA-supplied `tenant_id`.

Any request to draft, add, modify or remove Aisle PII API test cases goes through the **testcase-manager** agent
(`.claude/agents/testcase-manager.md`) — never edit tests directly.

1. Call the agent to **PROPOSE** (it changes nothing) and show the user its test-case table.
2. Wait for the user's approval or changes.
3. Send the approval (with any changes) back to the same agent to **IMPLEMENT**. It updates the test code, the test
   catalog, traceability, `docs/test-cases.xlsx` and the generated docs, then runs `npm run verify`.

Demo data (`reporting/fixtures/`) is never changed for test-case edits.

## Backend open questions (`docs/backend-open-questions.md`)

- Keep **only open questions** in this file. When a question is answered, resolved, confirmed or closed, **delete its
  row** (don't change its status) and update the tests / coverage matrix that cited it. Remove a section whose table
  becomes empty.
- When no questions remain, replace the tables with the "✅ All clear" message from the template comment in the file.
- Self-test UT-DOC-003 fails if a row is not `Open` or a question table is left empty; regenerate
  `PENDING-PLACEHOLDERS.md` (`npm run docs:pending`) after every change.

## Always

- Never log or print the Aisle test token, the Authorization header value, DB credentials or other secrets. The
  token lives only in `.env` / CI secrets and appears in reports only as `$AISLE_TEST_TOKEN`.
- Reports show the exact request (curl) and response of every call for debugging — allowed because ALL test data
  is synthetic (user decision, 2026-10-01). The redacted `api-calls.log` and console logs still hold no bodies.
- Expected results come only from observed staging behaviour or Dev's answers (`docs/backend-open-questions.md`) —
  never guessed. Unknowns are marked Blocked with a BQ-xx question; real defects stay failing (security findings).
- Synthetic test data only; never production records or real phone numbers. Read-only DB access only.
- Never fabricate test results. Do not commit or push unless asked.
