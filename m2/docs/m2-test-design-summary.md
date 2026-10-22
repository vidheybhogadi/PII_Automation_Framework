<!-- GENERATED FILE — do not edit by hand. Source: m2/scripts/* · Regenerate: npm run m2:docs -->

# Milestone 2 test design — summary

Workbook: [m2-test-cases.xlsx](m2-test-cases.xlsx) · Inventory source: [aisle-pii-affected-apis.md](aisle-pii-affected-apis.md) (Dev inventory (saurabh/pii-changes @ ae838f4, 16-Oct-2026)).

**2450 test cases** (92 scenario + 2358 per-API) over **209 inventory entries** (11 groups). PASS 0 · FAIL 0 · BLOCKED 1469 · NEED DEV CLARIFICATION 654 · NOT APPLICABLE 0 · NOT RUN 327. Nothing has been executed as an M2 test case yet.

## By type and category (same Type values as M1)

| Type     | Category                  | Cases | Smoke |
| -------- | ------------------------- | ----- | ----- |
| Positive | Functional                | 219   | 33    |
| Positive | Integration & consistency | 277   | 1     |
| Positive | Regression                | 3     | 0     |
| Negative | Validation                | 316   | 0     |
| Negative | Negative & edge case      | 9     | 1     |
| Negative | Unmigrated data           | 194   | 0     |
| Negative | State & idempotency       | 210   | 0     |
| Negative | Resilience                | 203   | 0     |
| Security | Authentication            | 390   | 31    |
| Security | Access control            | 136   | 0     |
| Security | PII exposure              | 130   | 0     |
| Security | Hidden name               | 115   | 1     |
| Database | DB persistence            | 48    | 0     |
| Contract | Response contract         | 200   | 0     |

## Groups

| Group                                                    | APIs | Cases    | Strategy                                                                                                                                                                               |
| -------------------------------------------------------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 PII integration routes (TEST_TOKEN)                   | 5    | 51       | Direct first-name read/write/batch routes on the app. Full functional + validation coverage; runnable now with the existing test token.                                                |
| G2 PII writes & account lifecycle                        | 13   | 203      | Onboarding, profile edit, phone login, hide-name, delete and reset — the app paths that WRITE PII. Deepest coverage: functional, negative, DB, cross-field, failure handling.          |
| G3 Single-profile reads                                  | 13   | 167      | Own and other-user profile responses. Migrated / unmigrated / hidden-name / read-gate states and owner-only exposure of email and phone.                                               |
| G4 Multi-profile lists (batch name hydration)            | 21   | 268      | Lists that hydrate many names at once (hydrate_first_names!). Correct name per profile, mixed migration states, hidden names, cache behaviour, no email/phone leakage.                 |
| G5 Interactions, chat, notifications & live audio        | 30   | 424      | Like / invite / accept / pass / report / connect / message / call / live-audio actions that read a name for the response, push or room. Representative deep checks + regression smoke. |
| G6 Own-profile updates (serializer / cache side effects) | 36   | 410      | Non-PII profile updates that rebuild the profile response or cache (own_detailed_v1, fill_cache!, sync_profile_to_kafka). One deep check, then a parametrised regression smoke.        |
| G7 Payment requests (PII sent to gateways / SMS)         | 12   | 150      | Requests that build provider customer payloads from PII (Cashfree, PayU, PhonePe, payment link, QR, SMS). Sandbox-only; correct values, no over-sharing.                               |
| G8 Payment verification & subscription (cache rebuild)   | 11   | 132      | Successful payment / restore / freebie flows that rebuild the profile cache. Regression only: activation still works and the rebuilt profile keeps the right name.                     |
| G9 Provider callbacks & webhooks (no user auth)          | 7    | 60       | PhonePe / Google Play / Apple / Pusher callbacks. Need genuine signed sandbox payloads — Dev-assisted. QA checks invalid signatures are refused without PII in the reply.              |
| G10 CMS / admin                                          | 52   | 640      | Admin profile views, edits, search, curation, reviews, member activity, exports and the ActiveAdmin IRL page. Admin auth + permission checks; correct name/email/phone per profile.    |
| M1 PII facade proxy (covered by Milestone 1)             | 9    | M1 suite | The /V1/api/v1/pii-test/* proxy routes. Already covered by the 109 Milestone 1 cases; not duplicated in M2.                                                                            |

## Runnable now (327 cases, no new access needed)

- `M2-PIIR-001` Write a first name with the test route, then read it back
- `M2-PIIR-002` Writing a new first name replaces the old one
- `M2-PIIR-003` Read a first name for a user that has none
- `M2-PIIR-004` Missing required parameters are refused with a clear message
- `M2-PIIR-007` Batch first-name read returns the right name for each user
- AUTH (Missing / invalid credential refused): 190 APIs
- TOKEN (Wrong credential type refused): 132 APIs

## Per-API checks

| Check     | Title                                   | Cases | Covered by scenario | N/A |
| --------- | --------------------------------------- | ----- | ------------------- | --- |
| POS       | Valid request succeeds with correct PII | 195   | 5                   | 0   |
| CONTRACT  | Response contract unchanged             | 200   | 0                   | 0   |
| AUTH      | Missing / invalid credential refused    | 200   | 0                   | 0   |
| TOKEN     | Wrong credential type refused           | 190   | 0                   | 10  |
| PARAM     | Missing / invalid parameters            | 174   | 5                   | 21  |
| BODY      | Malformed body / wrong data types       | 122   | 3                   | 75  |
| IDOR      | Cannot act on / read another user       | 134   | 0                   | 66  |
| EXPOSE    | No unintended PII exposure              | 124   | 0                   | 76  |
| UNMIG     | Unmigrated profile with read gate on    | 190   | 0                   | 10  |
| HIDDEN    | Hidden first name respected             | 112   | 0                   | 88  |
| GATE      | Read gate off vs on                     | 200   | 0                   | 0   |
| PIIDOWN   | PII service down / slow                 | 200   | 0                   | 0   |
| CACHE     | PII change reflected in later reads     | 62    | 1                   | 137 |
| STATE     | Wrong account / record state            | 77    | 0                   | 123 |
| REPEAT    | Repeated / double request               | 133   | 1                   | 66  |
| FIELD     | PII input validation & normalisation    | 11    | 4                   | 185 |
| DB-SAVE   | DB: persisted correctly, no duplicates  | 6     | 14                  | 180 |
| DB-REFUSE | DB: refused request writes nothing      | 10    | 5                   | 185 |
| DB-ISOL   | DB: other fields and users untouched    | 18    | 2                   | 180 |

## Blocking questions (cases affected)

| Question | Topic                           | Type                          | Cases |
| -------- | ------------------------------- | ----------------------------- | ----- |
| M2Q-03   | Test accounts                   | Access / environment          | 1990  |
| M2Q-24   | Contracts                       | Access / environment          | 706   |
| M2Q-04   | CMS access                      | Access / environment          | 512   |
| M2Q-02   | Read gates                      | Access / environment          | 411   |
| M2Q-17   | Payment sandboxes               | Access / environment          | 278   |
| M2Q-10   | Best-effort writes              | Access / environment          | 205   |
| M2Q-11   | PII read failures               | Contract / expected behaviour | 202   |
| M2Q-05   | Unmigrated profiles             | Contract / expected behaviour | 198   |
| M2Q-13   | Hide name                       | Contract / expected behaviour | 114   |
| M2Q-12   | Caching                         | Contract / expected behaviour | 66    |
| M2Q-14   | PII exposure rules              | Contract / expected behaviour | 53    |
| M2Q-16   | DB access & schema              | Access / environment          | 48    |
| M2Q-19   | Special auth routes             | Access / environment          | 21    |
| M2Q-06   | First-name rules                | Contract / expected behaviour | 16    |
| M2Q-20   | Test-token routes               | Contract / expected behaviour | 6     |
| M2Q-07   | Email rules                     | Contract / expected behaviour | 5     |
| M2Q-01   | Build under test                | Contract / expected behaviour | 4     |
| M2Q-18   | Notifications, email & SMS      | Access / environment          | 4     |
| M2Q-08   | Phone resync gaps               | Possible defect — confirm     | 3     |
| M2Q-15   | Account deletion (DPDP erasure) | Contract / expected behaviour | 3     |
| M2Q-21   | Admin search                    | Contract / expected behaviour | 3     |
| M2Q-25   | Release scope                   | Contract / expected behaviour | 3     |
| M2Q-09   | reset_profile                   | Possible defect — confirm     | 2     |
| M2Q-22   | Test-data cleanup               | Access / environment          | 2     |
| M2Q-23   | Performance                     | Contract / expected behaviour | 1     |
| M2Q-26   | Logs                            | Access / environment          | 1     |
