# Test data

This folder intentionally contains **no PII and no data files**.

All test data is synthetic and generated at runtime by [`src/data/test-data-factory.ts`](../src/data/test-data-factory.ts):

| Data     | Source              | Rule                                                                                                                                          |
| -------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant   | Aisle facade        | set by Aisle from the Bearer token — QA never sends a `tenant_id`                                                                             |
| User IDs | generated           | `<runId>-w<worker>-<seq>-<label>` (e.g. `qa-auto-20260926t101500-9f3a-w1-4-rd1`)                                                              |
| Emails   | generated           | `<runId without dashes>.w<worker>.<seq>.<label>@<AISLE_TEST_EMAIL_DOMAIN>` (approved, non-deliverable domain)                                 |
| Names    | generated           | `Qa Auto <letters>` — synthetic                                                                                                               |
| Phones   | `AISLE_TEST_PHONES` | **only team-approved test numbers**. The framework never invents a valid-looking phone number; with none configured, phone tests are Blocked. |

## How to obtain approved phone numbers

Ask the QA lead / compliance for numbers reserved for testing in the target environment (for example numbers from a
provider's documented test range, or company-owned test SIMs). Add them comma-separated to `AISLE_TEST_PHONES` in
`.env` or the CI secret store.

## Traceability and cleanup

Every value embeds the run ID, so automation data is identifiable. There is no delete API for PII (BQ-10 in
[`docs/backend-open-questions.md`](../docs/backend-open-questions.md)); free-text keys are revoked after each test and
transient mappings expire. Each test's `cleanup-summary.json` lists what was left behind. **Never** delete or modify
rows directly in a shared database.
