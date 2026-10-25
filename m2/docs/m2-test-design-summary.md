<!-- GENERATED FILE — do not edit by hand. Source: m2/scripts/* · Regenerate: npm run m2:docs -->

# Milestone 2 test design — summary

Workbook: [m2-test-cases.xlsx](m2-test-cases.xlsx) · Inventory source: [aisle-pii-affected-apis.md](aisle-pii-affected-apis.md) (Dev inventory (saurabh/pii-changes @ ae838f4, 16-Oct-2026)).

**2177 test cases** (108 scenario + 2069 per-API) over **212 inventory entries** (11 groups). PASS 612 · FAIL 348 · BLOCKED 1216 · NEED DEV CLARIFICATION 0 · WAITING 1 · NOT APPLICABLE 0 · NOT RUN 0. Nothing has been executed as an M2 test case yet.

## By type and category (same Type values as M1)

| Type     | Category                  | Cases | Smoke |
| -------- | ------------------------- | ----- | ----- |
| Positive | Functional                | 222   | 33    |
| Positive | Integration & consistency | 277   | 1     |
| Positive | Regression                | 3     | 0     |
| Negative | Validation                | 318   | 0     |
| Negative | Negative & edge case      | 10    | 1     |
| Negative | Unmigrated data           | 2     | 0     |
| Negative | State & idempotency       | 211   | 0     |
| Negative | Resilience                | 204   | 0     |
| Security | Authentication            | 390   | 31    |
| Security | Access control            | 64    | 0     |
| Security | PII exposure              | 105   | 0     |
| Security | Hidden name               | 115   | 1     |
| Database | DB persistence            | 56    | 0     |
| Contract | Response contract         | 200   | 0     |

## Groups

| Group                                                    | APIs | Cases    | Strategy                                                                                                                                                                               |
| -------------------------------------------------------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 PII integration routes (TEST_TOKEN)                   | 5    | 51       | Direct first-name read/write/batch routes on the app. Full functional + validation coverage; runnable now with the existing test token.                                                |
| G2 PII writes & account lifecycle                        | 13   | 183      | Onboarding, profile edit, phone login, hide-name, delete and reset — the app paths that WRITE PII. Deepest coverage: functional, negative, DB, cross-field, failure handling.          |
| G3 Single-profile reads                                  | 13   | 149      | Own and other-user profile responses. Hidden-name and read-gate states and owner-only exposure of email and phone.                                                                     |
| G4 Multi-profile lists (batch name hydration)            | 21   | 235      | Lists that hydrate many names at once (hydrate_first_names!). Correct name per profile, hidden names, cache behaviour, no email/phone leakage.                                         |
| G5 Interactions, chat, notifications & live audio        | 30   | 381      | Like / invite / accept / pass / report / connect / message / call / live-audio actions that read a name for the response, push or room. Representative deep checks + regression smoke. |
| G6 Own-profile updates (serializer / cache side effects) | 36   | 351      | Non-PII profile updates that rebuild the profile response or cache (own_detailed_v1, fill_cache!, sync_profile_to_kafka). One deep check, then a parametrised regression smoke.        |
| G7 Payment requests (PII sent to gateways / SMS)         | 12   | 137      | Requests that build provider customer payloads from PII (Cashfree, PayU, PhonePe, payment link, QR, SMS). Sandbox-only; correct values, no over-sharing.                               |
| G8 Payment verification & subscription (cache rebuild)   | 11   | 121      | Successful payment / restore / freebie flows that rebuild the profile cache. Regression only: activation still works and the rebuilt profile keeps the right name.                     |
| G9 Provider callbacks & webhooks (no user auth)          | 7    | 58       | PhonePe / Google Play / Apple / Pusher callbacks. Need genuine signed sandbox payloads — Dev-assisted. QA checks invalid signatures are refused without PII in the reply.              |
| G10 CMS / admin                                          | 52   | 589      | Admin profile views, edits, search, curation, reviews, member activity, exports and the ActiveAdmin IRL page. Admin auth + permission checks; correct name/email/phone per profile.    |
| M1 PII facade proxy (covered by Milestone 1)             | 12   | M1 suite | The /V1/api/v1/pii-test/* proxy routes (incl. readiness and free-text keys). Already covered by the 109 Milestone 1 cases; not duplicated in M2.                                       |

## Runnable now (960 cases, no new access needed)

- `M2-PIIR-001` Write a first name with the test route, then read it back
- `M2-PIIR-002` Writing a new first name replaces the old one
- `M2-PIIR-003` Read a first name for a user that has none
- `M2-PIIR-004` Missing required parameters are refused with a clear message
- `M2-PIIR-005` First-name write validation: null, empty, whitespace, too long, wrong type
- `M2-PIIR-006` First-name normalisation: spaces, repeated spaces, case, Unicode
- `M2-PIIR-007` Batch first-name read returns the right name for each user
- `M2-PIIR-008` Batch reads: size limit and malformed lists
- `M2-PIIR-009` Profile first names by profile ref (real synthetic profiles)
- `M2-PIIR-010` First-name source diagnostic for a profile
- `M2-FNAME-001` New user’s first name from onboarding is saved to PII and shown on own profile
- `M2-FNAME-002` Onboarding does not overwrite an existing first name
- `M2-FNAME-003` Web onboarding saves first name the same way as app onboarding
- `M2-FNAME-004` Editing the first name updates PII and every own-profile read
- `M2-FNAME-006` Repeated and identical name edits stay consistent
- `M2-FNAME-007` Edit / onboarding with missing, null, empty or whitespace first name
- `M2-FNAME-008` App edit normalises the first name the same way in PII and the local field
- `M2-FNAME-011` Hide-name toggle on an ineligible profile (no verified selfie)
- `M2-FNAME-015` Same profile with the first-name gate off and on
- `M2-FNAME-017` A name change reaches other users’ lists (cache propagation)
- `M2-EMAIL-001` Onboarding email is saved to PII and returned on the owner’s profile
- `M2-EMAIL-002` Onboarding does not overwrite an existing email
- `M2-EMAIL-007` Email with the gate off (gate on: waiting)
- `M2-PHONE-001` New user’s phone login writes the national number to PII
- `M2-PHONE-005` Phone login with formatted, short, long or invalid numbers
- `M2-XFLD-001` Changing the first name leaves email and phone unchanged
- `M2-XFLD-003` Owner’s profile returns all three fields matching PII
- `M2-XFLD-005` One user’s changes never affect another user
- `M2-SEC-006` Error responses do not echo submitted PII or internal details
- `M2-INT-003` A name written through the M1 facade does not refresh app caches
- `M2-FT-001` A sent chat message (text + quoted previous message) is readable by the other person exactly as sent
- `M2-FT-004` Many messages in one conversation: order, pagination and the created_at cursor still work
- `M2-FT-007` A third user cannot read or post into another pair’s conversation
- POS (Valid request succeeds with correct PII): 95 APIs
- CONTRACT (Response contract unchanged): 99 APIs
- AUTH (Missing / invalid credential refused): 190 APIs
- TOKEN (Wrong credential type refused): 188 APIs
- PARAM (Missing / invalid parameters): 65 APIs
- BODY (Malformed body / wrong data types): 48 APIs
- IDOR (Cannot act on / read another user): 22 APIs
- EXPOSE (No unintended PII exposure): 3 APIs
- GATE (Read gate off: same value read back (gate on: waiting)): 102 APIs
- CACHE (PII change reflected in later reads): 6 APIs
- STATE (Wrong account / record state): 49 APIs
- REPEAT (Repeated / double request): 59 APIs
- FIELD (PII input validation & normalisation): 1 APIs

## Per-API checks

| Check     | Title                                                  | Cases | Covered by scenario | N/A |
| --------- | ------------------------------------------------------ | ----- | ------------------- | --- |
| POS       | Valid request succeeds with correct PII                | 195   | 5                   | 0   |
| CONTRACT  | Response contract unchanged                            | 200   | 0                   | 0   |
| AUTH      | Missing / invalid credential refused                   | 200   | 0                   | 0   |
| TOKEN     | Wrong credential type refused                          | 190   | 0                   | 10  |
| PARAM     | Missing / invalid parameters                           | 174   | 5                   | 21  |
| BODY      | Malformed body / wrong data types                      | 122   | 3                   | 75  |
| IDOR      | Cannot act on / read another user                      | 61    | 0                   | 139 |
| EXPOSE    | No unintended PII exposure                             | 98    | 0                   | 102 |
| HIDDEN    | Hidden first name respected                            | 112   | 0                   | 88  |
| GATE      | Read gate off: same value read back (gate on: waiting) | 200   | 0                   | 0   |
| PIIDOWN   | PII service down / slow                                | 200   | 0                   | 0   |
| CACHE     | PII change reflected in later reads                    | 58    | 1                   | 141 |
| STATE     | Wrong account / record state                           | 77    | 0                   | 123 |
| REPEAT    | Repeated / double request                              | 133   | 1                   | 66  |
| FIELD     | PII input validation & normalisation                   | 11    | 6                   | 183 |
| DB-SAVE   | DB: persisted correctly, no duplicates                 | 6     | 16                  | 178 |
| DB-REFUSE | DB: refused request writes nothing                     | 12    | 5                   | 183 |
| DB-ISOL   | DB: other fields and users untouched                   | 20    | 2                   | 178 |

## Blocking questions (cases affected)

| Question | Topic                                     | Type                                 | Cases |
| -------- | ----------------------------------------- | ------------------------------------ | ----- |
| M2Q-03   | Test accounts                             | Access / environment                 | 1873  |
| M2Q-36   | Onboarding prerequisites                  | Access / environment                 | 1597  |
| M2Q-24   | Contracts                                 | Access / environment                 | 707   |
| M2Q-04   | CMS access                                | Access / environment                 | 481   |
| M2Q-17   | Payment sandboxes                         | Access / environment                 | 270   |
| M2Q-37   | PII user_id for app users                 | Access / environment                 | 251   |
| M2Q-02   | Read gates                                | Access / environment                 | 219   |
| M2Q-43   | Read gates ON                             | Waiting for Dev (environment change) | 217   |
| M2Q-10   | Best-effort writes                        | Access / environment                 | 206   |
| M2Q-11   | PII read failures                         | Contract / expected behaviour        | 202   |
| M2Q-32   | Special account states                    | Access / environment                 | 145   |
| M2Q-13   | Hide name                                 | Contract / expected behaviour        | 114   |
| M2Q-45   | Dev-only ids and actions                  | Access / environment                 | 113   |
| M2Q-12   | Caching                                   | Contract / expected behaviour        | 61    |
| M2Q-16   | DB access & schema                        | Access / environment                 | 57    |
| M2Q-44   | DB verification on hold                   | Access / environment                 | 57    |
| M2Q-14   | PII exposure rules                        | Contract / expected behaviour        | 53    |
| M2Q-41   | Web token issuance                        | Access / environment                 | 26    |
| M2Q-46   | Missing ref acts on an arbitrary member   | Possible defect — confirm            | 22    |
| M2Q-19   | Special auth routes                       | Access / environment                 | 19    |
| M2Q-27   | Free-text contract                        | Contract / expected behaviour        | 18    |
| M2Q-06   | First-name rules                          | Contract / expected behaviour        | 17    |
| M2Q-29   | Free-text failures & revoked keys         | Contract / expected behaviour        | 8     |
| M2Q-33   | App DB (aisleweb) read access             | Access / environment                 | 8     |
| M2Q-35   | Test-token route contracts                | Contract / expected behaviour        | 6     |
| M2Q-07   | Email rules                               | Contract / expected behaviour        | 5     |
| M2Q-15   | Account deletion (DPDP erasure)           | Contract / expected behaviour        | 5     |
| M2Q-18   | Notifications, email & SMS                | Access / environment                 | 5     |
| M2Q-01   | Build under test                          | Contract / expected behaviour        | 4     |
| M2Q-05   | Unmigrated profiles                       | Contract / expected behaviour        | 4     |
| M2Q-30   | Free-text limits                          | Contract / expected behaviour        | 4     |
| M2Q-21   | Admin search                              | Contract / expected behaviour        | 3     |
| M2Q-22   | Test-data cleanup                         | Access / environment                 | 3     |
| M2Q-25   | Release scope                             | Contract / expected behaviour        | 3     |
| M2Q-40   | Test-route first-name write fails         | Possible defect — confirm            | 3     |
| M2Q-08   | Phone resync gaps                         | Possible defect — confirm            | 2     |
| M2Q-09   | reset_profile                             | Possible defect — confirm            | 2     |
| M2Q-28   | Legacy free text                          | Contract / expected behaviour        | 2     |
| M2Q-20   | Test-token routes                         | Contract / expected behaviour        | 1     |
| M2Q-23   | Performance                               | Contract / expected behaviour        | 1     |
| M2Q-26   | Logs                                      | Access / environment                 | 1     |
| M2Q-31   | More free-text flows                      | Access / environment                 | 1     |
| M2Q-34   | Mongo (audit trail)                       | Access / environment                 | 1     |
| M2Q-42   | Login response without credential         | Possible defect — confirm            | 1     |
| M2Q-38   | Unauthenticated payment verification      | Possible defect — confirm            | 0     |
| M2Q-39   | Invalid tokens cause server errors        | Possible defect — confirm            | 0     |
| M2Q-47   | Deleting accounts stuck before onboarding | Access / environment                 | 0     |
| M2Q-48   | Chat send to an unconnected member        | Contract / expected behaviour        | 0     |
