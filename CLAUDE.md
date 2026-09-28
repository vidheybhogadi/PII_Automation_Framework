# Project rules for Claude

## Test cases

Any request to draft, add, modify or remove PII service test cases goes through the **testcase-manager** agent
(`.claude/agents/testcase-manager.md`) — never edit tests directly.

1. Call the agent to **PROPOSE** (it changes nothing) and show the user its test-case table.
2. Wait for the user's approval or changes.
3. Send the approval (with any changes) back to the same agent to **IMPLEMENT**. It updates the test code, the test
   catalog, traceability, `docs/test-cases.xlsx` and the generated docs, then runs `npm run verify`.

Demo data (`reporting/fixtures/`) is never changed for test-case edits.

## Always

- Never log plaintext PII, private keys, signatures, full PII request bodies, DB credentials or secrets.
- Synthetic test data only; never production records or real phone numbers. Read-only DB access only.
- Never fabricate test results. Do not commit or push unless asked.
