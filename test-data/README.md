# Test data

This folder intentionally contains **no PII and no data files**.

All test data is generated at runtime by [`src/data/test-data-factory.ts`](../src/data/test-data-factory.ts):

| Data     | Source                              | Rule                                                                                                                                                                                                  |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant   | `PII_TEST_TENANT_ID` / `_SECONDARY` | dedicated non-production tenants only                                                                                                                                                                 |
| User IDs | generated                           | `<runId>-w<worker>-<seq>-<label>` (e.g. `qa-auto-20260926t101500-9f3a-w1-4-rd1`)                                                                                                                      |
| Emails   | generated                           | `<runId>.w<worker>.<seq>.<label>@<PII_TEST_EMAIL_DOMAIN>` (approved, non-deliverable domain)                                                                                                          |
| Names    | generated                           | `Qa Auto <letters>` — synthetic                                                                                                                                                                       |
| Phones   | `PII_TEST_PHONES`                   | **only team-approved test numbers**. The framework never invents a valid-looking phone number. Invalid-by-construction values (7 or 16 digits) are used only in rejection tests and are never stored. |

## How to obtain approved phone numbers

Ask the QA lead / compliance for numbers reserved for testing in the target environment (for example numbers from a
provider's documented test range, or company-owned test SIMs). Add them comma-separated to `PII_TEST_PHONES` in `.env`
or the CI secret store. You need at least 1 (most tests), 2 (TR-007), plus one 8-digit and one 15-digit number (NRM-004).

## Traceability and cleanup

Every value embeds the run ID, so automation data is identifiable. There is no delete API for PII (Q-15); free-text keys
are revoked after each test; transient mappings expire. Each test's `cleanup-summary.json` lists what was left behind.
**Never** delete or modify rows directly in a shared database.
