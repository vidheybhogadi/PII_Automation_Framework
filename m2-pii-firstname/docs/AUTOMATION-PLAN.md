# M2 PII First Name — Automation Plan

**Goal:** white-box test every place where the Aisle Network apps read, write, search, show, send or store a user's
**first name** after the PII migration — and automate it.

**Approach:** group the APIs by the **code path** that decides where the name comes from (PII service, Aisle DB or a
cache). Test each path **deeply** through one representative API, and run a **quick sweep** on every other API.

**Status key:** ✅ Done · 🔄 In progress · ⏳ Not started · ⛔ Blocked (waiting on someone)

Last updated: 2026-11-12 (3.2 schema scan + 3.3 downstream trace done, 3 new inventory rows; vernac 8.4.6 done — full vernac run 45 pass / 3 fail / 9 skipped, all restores verified)

**Current scope (QA lead, 2026-11-09):** first finish the first name for **Aisle, Aisle CMS, Vernac and Vernac CMS**.
Everything else is logged under [Logged for later](#logged-for-later) and picked up afterwards.

---

## Progress at a glance

| Phase                                                                | Status         |
| -------------------------------------------------------------------- | -------------- |
| 1. Find every place the first name is used                           | ✅ Done        |
| 2. Set up access and test tools                                      | ✅ Done        |
| 3. Check nothing is missed (current scope)                           | 🔄 In progress |
| 4. Design the test cases                                             | 🔄 In progress |
| 5. Prepare test data                                                 | 🔄 In progress |
| 6. Build the automation                                              | 🔄 In progress |
| 7. Run, report and maintain                                          | 🔄 In progress |
| 8. Vernacular apps (Arike, Neene, Neetho, Anbe; HeyDil out of scope) | 🔄 In progress |

---

## Coverage by area

"Found in code" = the inventory lists it · "Can observe" = QA has a way to see it on staging · "Test cases" = designed
and automated.

| Area                                                      | Found in code     | Can observe on staging                                                                                    | Test cases              | What is missing                             |
| --------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------- |
| Aisle APIs                                                | ✅ 110 places     | ✅ app + test token                                                                                       | 🟡 designed + automated | Dev answers (M2FNQ-08 … 29)                 |
| Aisle CMS                                                 | ✅ 68 places      | ✅ admin + associate logins                                                                               | 🟡 designed + automated | CMS queue states (M2FNQ-22)                 |
| Aisle background jobs                                     | ✅ 69 places      | 🟡 only through their effects                                                                             | ⏳                      | Case design                                 |
| Postgres (Aisle DB)                                       | ✅                | ✅ read-only: `aisleweb` (20,161 of 20,171 tables) + `pii` (8 of 9), no write rights (checked 2026-11-11) | ✅ scan done (3.2)      | —                                           |
| PII DB / PII service                                      | ✅                | ✅ read-only + test routes                                                                                | ✅ M1 (109 cases)       | —                                           |
| Redis (profile, PII, chat-list, live-audio caches)        | ✅                | ✅ Redis key API                                                                                          | 🟡 11 cases (8 pass)    | Chat-list / live-audio cache cases          |
| Mongo (mongo_profiles, onboarding log, notification logs) | ✅                | ❌ no access                                                                                              | ⏳                      | Read-only API or access from Dev            |
| Notifications (push, SMS, WhatsApp)                       | ✅                | ❌                                                                                                        | ⏳                      | Test device or Dev view of sent payloads    |
| Email (Mandrill / Mailchimp)                              | ✅                | ❌                                                                                                        | ⏳                      | Test inbox                                  |
| Events (Kafka, CleverTap, Meta, profile sync)             | ✅                | ❌                                                                                                        | ⏳                      | Kafka / CleverTap staging access from Dev   |
| Invoices (PDF + GST e-invoice)                            | ✅                | ❌                                                                                                        | ⏳                      | A test-mode payment that creates an invoice |
| Payment providers (Cashfree, PayU)                        | ✅                | 🟡 sandbox only                                                                                           | ⏳                      | Sandbox confirmation                        |
| Chat copies (PubNub, Firebase)                            | ✅                | ❌                                                                                                        | ⏳                      | Dev view or test app                        |
| Logs / error tracker                                      | ✅                | ❌                                                                                                        | ⏳                      | Dev check (name must not be logged)         |
| Exports (CSV, account data)                               | ✅                | ✅ through CMS                                                                                            | ⏳                      | Case design                                 |
| Search (PII search, CMS search)                           | ✅                | ✅                                                                                                        | ⏳                      | Case design                                 |
| Django service (discover, concierge, share link)          | ✅ 10 places      | ❓ base URL / auth unknown                                                                                | ⏳                      | Access details                              |
| Mobile apps (Aisle + vernacular, Android + iOS)           | ✅ 63 places      | 🟡 manual on device                                                                                       | ⏳                      | iOS not required for runs                   |
| Vernacular backend + vernacular CMS                       | ✅ 98 places      | 🟡 CMS admin + associate + OTP ✅, read-only DB ✅; app test users pending                                | ⏳                      | Phase 8                                     |
| Jilebi                                                    | ❌ no code access | ❌                                                                                                        | ⏳                      | Access or "skip"                            |
| Web frontend, Graph service, analytics warehouse, backups | ❌ not read       | ❌                                                                                                        | ⏳                      | Phase 3 (3.3, 3.4)                          |

---

## Phase 1 — Find every place the first name is used ✅

| #   | Task                                                        | Status | Notes                                                                                              |
| --- | ----------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| 1.1 | Read the code of all apps and services for first-name usage | ✅     | 9 repos: Aisle backend, Aisle CMS, vernacular backend, 4 mobile apps, notification service, Django |
| 1.2 | Group every usage by division and code path                 | ✅     | 426 places · 63 code paths · 11 divisions                                                          |
| 1.3 | Pick one representative API (★) per path                    | ✅     | 107 representatives                                                                                |
| 1.4 | Build the inventory workbook                                | ✅     | [firstname-inventory.xlsx](firstname-inventory.xlsx) (`npm run m2fn:inventory`)                    |
| 1.5 | Keep this work apart from Milestone 2                       | ✅     | Own folder `m2-pii-firstname/`                                                                     |

## Phase 2 — Set up access and test tools ✅

| #   | Task                                                                                      | Status | Notes                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1 | Save the Redis key API document (read / delete a cache key)                               | ✅     | [redis-key-apis.md](redis-key-apis.md)                                                                                               |
| 2.2 | Publish the Redis key APIs on the API Guide (Aisle + vernacular)                          | ✅     | aisleapidocs.netlify.app                                                                                                             |
| 2.3 | CMS logins (admin + associate) stored safely in `.env`                                    | ✅     | Never printed or committed                                                                                                           |
| 2.4 | Complete the admin's Google Authenticator (OTP) setup for scripted logins                 | ✅     | Secret only in `.env`                                                                                                                |
| 2.5 | Confirm on staging: Redis key names, flags, cache refill, roles                           | ✅     | Read and write flags are **ON** on testa2; associate is refused                                                                      |
| 2.6 | Build the suite skeleton (own workbook, Playwright project `m2fn-api`, `m2fn:*` commands) | ✅     | [m2fn-test-cases.xlsx](m2fn-test-cases.xlsx) · `npm run m2fn:test` / `m2fn:test:unit` / `m2fn:docs` · self-tests in `npm run verify` |
| 2.7 | Build the 11 Redis key API tests (M2FN-RDK-001 … 011)                                     | ✅     | Staging run 2026-11-09: **8 passed, 0 failed, 3 skipped** (RDK-005, 010 wait for Dev; RDK-009 waits for staging profile approval)    |

## Phase 3 — Check nothing is missed ⏳

| #   | Task                                                                                         | Status | Notes                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Re-scan Aisle, Aisle CMS and vernac code at the latest commit and compare with the inventory | ✅     | Aisle + Aisle CMS: nothing new · Vernac re-scanned on desiapp `develop` @ f89046944: 113 rows (77 unchanged, 17 changed, 19 new); inventory now 445 rows, 68 paths                                                                                          |
| 3.2 | Scan the Postgres schema for every column that can hold a name                               | ✅     | 2026-11-12, schema + JSON key names only (`docs/postgres-name-columns.md`): one new place, `paint_bar_mixers.personal_details.name` → FN-AIS-111; 2 legacy tables; `pii_migration_audit_outbox` and vernac `sms_notification_tracks` not readable (ask Dev) |
| 3.3 | Trace downstream copies: Kafka consumers, Graph service, analytics                           | ✅     | 2026-11-12 (`docs/downstream-copies.md`): only Kafka profile sync carries the name (FN-BKG-059); 2 new rows FN-BKG-070 (Slack event alert), FN-VRN-064 (vernac push log); consumers outside our repos → ask Dev                                             |
| 3.4 | Decide on repos we have not read: Jilebi, web frontend, Graph service                        | ⛔     | Needs access or a "skip" from the QA lead                                                                                                                                                                                                                   |
| 3.5 | Review the inventory's Paths sheet and mark what is out of scope                             | ⏳     | QA lead                                                                                                                                                                                                                                                     |

## Phase 4 — Design the test cases 🔄

Scope now: **Aisle (110 rows) + Aisle CMS (68 rows)**. Proposal approved by the QA lead on 2026-11-11 (56 cases:
55 deep + 1 sweep), with answers to M2FNQ-06 (selfie via CMS), 07 (approval via CMS), 24 (M1 facade write) and
30 (opt-in 51-account batch flag). Vernac / Vernac CMS follow after their re-scan.

| #   | Task                                                                                                                             | Status | Notes                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Deep cases per path: flag on/off, cache miss/hit, no PII value, PII error, hidden name, update-then-read, batches over 50, roles | ✅     | Aisle + Aisle CMS: 50 deep cases (PRF, LST, OWN, FUL, HID, CHT, LIV, WRT, RST, FLG, ERR, CMS, SRC, CMW); vernac ⏳                                                                                                                                                        |
| 4.2 | Cases for every bypass path (reads the Aisle DB directly)                                                                        | ✅     | reset profile (RST-001), CMS member-list search (SRC-002), sparks filter (CMS-008), likes filter (CMS-007), chat list (CHT-002/004 ⛔ M2FNQ-10)                                                                                                                           |
| 4.3 | One sweep case over every other API: name equals the PII value                                                                   | ✅     | M2FN-SWP-001: 36 rows now + 21 after CMS approval; 84 rows cannot be called (reasons on the workbook’s "Sweep Rows" sheet)                                                                                                                                                |
| 4.4 | Side-channel cases: push text, email, invoice, Kafka, Redis copies, Postgres vs PII DB                                           | ⏳     | Logged for later (current scope: only effects visible through Aisle / CMS replies, Redis and the Aisle DB)                                                                                                                                                                |
| 4.5 | Coverage matrix: every path × every edge case → a test case (no empty cells)                                                     | ✅     | Workbook sheet "Coverage Matrix" (checked by `npm run m2fn:docs`)                                                                                                                                                                                                         |
| 4.6 | Proposal reviewed and approved by the QA lead                                                                                    | ✅     | Aisle + Aisle CMS approved 2026-11-11; Vernac + Vernac CMS approved 2026-11-11 ✅                                                                                                                                                                                         |
| 4.7 | Implement the approved cases (design data, helpers, specs, workbook)                                                             | ✅     | `scripts/m2fn-firstname-cases.data.ts`, `scripts/m2fn-sweep.ts`, `src/first-name.ts`, `tests/scenarios/fn-*.spec.ts`                                                                                                                                                      |
| 4.8 | First staging run of the runnable cases                                                                                          | ✅     | 2026-11-11 (testa2, 1 worker, 123 tests): **71 passed, 1 failed, 51 skipped**. Failed: M2FN-WRT-004 (an onboarding re-submit renamed the user — possible defect M2FNQ-31). Skipped: Dev questions, no selfie record to verify (M2FNQ-06), relations the suite cannot make |
| 4.9 | Open questions M2FNQ-08 … 29 (except 24) answered by Dev                                                                         | ⛔     | Waiting for Dev (gate / outage windows, conversation key, CMS queues, contracts, possible defects)                                                                                                                                                                        |

## Phase 5 — Prepare test data ⏳

| #   | Task                                                         | Status | Notes                                                                                                          |
| --- | ------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------- |
| 5.1 | Create ~10 synthetic accounts, one per edge case             | ✅     | Suite creates its own +91 10xxxxxxxx accounts per run (`M2_CREATE_ACCOUNTS=true`), approved via CMS (M2FNQ-07) |
| 5.2 | Give test users a different name in PII than in the Aisle DB | ✅     | Divergent user D (PII name ≠ Aisle-DB name) and no-PII user N, built by `src/first-name.ts`                    |

## Phase 6 — Build the automation 🔄

| #   | Task                                                               | Status | Notes                                                                                        |
| --- | ------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------- |
| 6.1 | Build the highest-risk paths first (bypasses, caches, hidden name) | ✅     | Aisle + Aisle CMS (2026-11-11); vernac ⏳                                                    |
| 6.2 | Build the remaining deep cases and the sweep                       | ✅     | 66 cases + 57 sweep tests = 123 tests in project m2fn-api                                    |
| 6.3 | Self-tests and `npm run verify` pass                               | ✅     | UT-M2FN-001 … 007 pass; repo format check flags only the untracked `m2/scripts/.tmp-like.ts` |

## Phase 7 — Run, report and maintain ⏳

| #   | Task                                              | Status | Notes                                                                                            |
| --- | ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| 7.1 | First full run on staging                         | 🔄     | Aisle + Aisle CMS 2026-11-11: 71 passed, 1 failed (WRT-004 → M2FNQ-31), 51 blocked; vernac ⏳    |
| 7.2 | Collect findings for Dev                          | 🔄     | So far: M2FN-WRT-004 (re-onboarding overwrites the PII name). The QA lead decides when to report |
| 7.3 | Daily / on-request runs                           | ⏳     | Report in `reports/m2fn`                                                                         |
| 7.4 | Re-scan the code when Aisle changes               | ⏳     |                                                                                                  |
| 7.5 | Reuse the structure for email (M3) and phone (M4) | ⏳     |                                                                                                  |

## Phase 8 — Vernacular apps 🔄

| #     | Task                                                                                                                                      | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1   | Confirm which build runs on testapp.koode.co (PII branch `jup/pii` or not)                                                                | 🔄     | Code says `develop` (contains `jup/pii` and the Redis key route; `staging` branch does not) — confirm with Dev                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 8.2   | Vernacular CMS logins (admin + associate)                                                                                                 | ✅     | Admin + associate logins in `.env` (M2FN_VN_CMS_*); admin OTP secret saved (user-approved, from the vernac test DB) and verified 2026-11-11. Redis key API on vernac: same answers as Aisle (404 / 200 deleted:false / 400); associate → 401                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8.3   | Vernacular app test users, staging OTP, DB read access, flag switching                                                                    | 🔄     | DB ✅ read-only: `desiapp_production` is vernac **test** data (QA lead, 2026-11-11); 217 of 224 tables readable, no write. Name in `account_profiles.first_name` (+ `hide_first_name`); `profile_view` (DB view, not used by app code) copies it; flags in `app_features`. Test users ✅: team numbers 1061616161 … 1069696969, OTP 1234, for Anbe, Arike, Neene and Neetho (not HeyDil), usable for every case incl. writes (QA lead exception 2026-11-11; restore names after). Flags ✅ (read from `app_features`, 2026-11-11): every `pii_*` read/write feature, incl. `pii_name_read` / `pii_name_write`, is ON for all 5 apps (name_read last changed 2026-11-05 IST). QA never changes them; flag-off cases need a Dev window. Still need: build confirmation from Dev (8.1)                                       |
| 8.4   | Design, build and run the vernacular cases                                                                                                | 🔄     | Approved by the QA lead 2026-11-11 (45 cases: 44 deep + sweep VSWP-001; answers to M2FNQ-34 / 35 / 51 / 52 / 53). Sub-tasks 8.4.1 … 8.4.6 below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 8.4.1 | Vernac design data, sweep and questions in the workbook                                                                                   | ✅     | `scripts/m2fn-vernac-cases.data.ts`, `scripts/m2fn-vernac-sweep.ts` (Vernac 40 rows: 5 now, 3 through existing relations, 32 cannot; Vernac CMS 34 rows: 3 through existing relations, 31 cannot), M2FNQ-32 … 57, coverage matrix rows V1 … VX10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 8.4.2 | Helpers: nine-number + host guard, vernac login (no new users), CMS session, read-only DB, Redis key guard, save-and-restore with journal | ✅     | `src/vn/*`, `config/db-queries.vernac.json`, `npm run m2fn:vn:restore`; writes only with `M2FN_VN_RUN=true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 8.4.3 | Specs and self-tests                                                                                                                      | ✅     | `tests/vernac/vn-app`, `vn-cms`, `vn-sweep` (Playwright project `m2fn-vn-api`, 57 tests); UT-M2FN-008 … 010                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 8.4.4 | First staging run (testapp, one worker, M2FN_VN_RUN=true)                                                                                 | ✅     | 2026-11-11: 57 tests, 35 passed, 4 failed, 18 skipped; every restore verified (journal empty). Two test bugs fixed and re-checked (VSET-001, sweep FN-VCM-009 now pass). Remaining failures are staging findings: member search 500 (VCMS-001, VSRC-001 → M2FNQ-56), blank CMS name 500 instead of 422 (VCMW-003 → M2FNQ-57)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8.4.5 | Cases waiting on Dev / decisions                                                                                                          | ⛔     | Sparks table not readable (VSPK-001, VLST-003 → M2FNQ-55); flag / outage windows (VFLG-001/002, VERR-001 → M2FNQ-47); Cashfree sandbox, QA inbox, logs (VEGR-001/002, VLOG-001 → M2FNQ-41/42/44); no new users (VWRT-002, M2FNQ-51); match push not observable (VHID-004: likes are allowed since 2026-11-12, but the name is only in the push)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 8.4.6 | Cases blocked by team-account state                                                                                                       | ✅     | 2026-11-12 (QA lead: "proceed with all remaining"): setup steps in `src/vn/setup.ts` (one like between team users of the same app, one chat message only when none exists; both recorded in `reports/m2fn-vn/irreversible-effects.json`). VLST-001/002/004 pass through ONE new like Arike …7 → …9; VHID-003 runs (the Neene …4 ↔ …5 conversation already had a message from …4 — nothing sent; hidden sender shown with the full name, M2FNQ-38 recorded); VAPP-001 passes for all four apps (every app already had a team user with a PII name, so none was created; Anbe test bug fixed: a hidden D is un-hidden for the case); FN-VRN-013 passes on the existing active Neene conversation (no message needed). Full vernac run: 57 tests, 45 passed, 3 failed (known findings M2FNQ-56/57), 9 skipped; journal empty |

---

## Logged for later

Out of the current scope; each is already in the inventory and will get its own tasks when picked up.

| Area                                                                 | What it needs before we can test it       |
| -------------------------------------------------------------------- | ----------------------------------------- |
| Mongo copies (mongo_profiles, onboarding log, notification logs)     | Read-only access or a GET API from Dev    |
| Notifications (push, SMS, WhatsApp)                                  | Test device or Dev view of sent payloads  |
| Email (Mandrill / Mailchimp)                                         | Test inbox                                |
| Events (Kafka, CleverTap, Meta, profile sync)                        | Kafka / CleverTap staging access          |
| Invoices (PDF + GST e-invoice)                                       | Test-mode payment that creates an invoice |
| Payment providers (Cashfree, PayU)                                   | Sandbox confirmation                      |
| Chat copies (PubNub, Firebase) and logs / error tracker              | Dev help to inspect                       |
| Django service (discover, concierge, share link)                     | Staging base URL and auth                 |
| Mobile apps (screens, client-side name rules, crashes on empty name) | Manual device runs (Android)              |
| Jilebi, web frontend, Graph service, analytics warehouse, backups    | Code access or a "skip"                   |
| RDK-009 changes (profile_info route, approved account)               | QA lead confirmation                      |

## Open questions for Dev

| #   | Question                                                                                                                       | Blocks         |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| 1   | A Redis key that holds a non-string value, safe to read, for the "422" test                                                    | 2.7 (one test) |
| 2   | A window where Redis is unavailable, for the "503" test                                                                        | 2.7 (one test) |
| 2a  | Staging profile approval is not running (new accounts stay `pending_not_verified`) — needed for the cache-rebuild test RDK-009 | 2.7 (one test) |
| 3   | Any admin with the Redis permission can read any key (including names) and delete any key — intended?                          | 2.7 (one test) |
| 4   | Vernacular staging build, logins and DB access                                                                                 | Phase 8        |

## Key facts (seen on staging, 2026-11-09)

- First-name **read and write flags are ON** on testa2.
- Redis keys: PII name `pii:v1:user:<user_id>:first_name` · profile `AISLE_staging_profile_<ref>` · flags
  `AISLE_staging_configuration_constant`.
- Reading a name refills its PII cache key after it is deleted.
- The associate CMS login cannot use the Redis key API; the admin can (after the authenticator code).

## Where things are

| What                   | Where                                                |
| ---------------------- | ---------------------------------------------------- |
| This plan              | `m2-pii-firstname/docs/AUTOMATION-PLAN.md`           |
| First-name inventory   | `m2-pii-firstname/docs/firstname-inventory.xlsx`     |
| Redis key API document | `m2-pii-firstname/docs/redis-key-apis.md`            |
| Test approach (paths)  | `m2-pii-firstname/docs/PATH-BASED-TESTING.md`        |
| Service flows (name)   | `m2-pii-firstname/docs/FIRST-NAME-FLOWS.md`          |
| Test cases workbook    | `m2-pii-firstname/docs/m2fn-test-cases.xlsx`         |
| Tests                  | `m2-pii-firstname/tests/` (run: `npm run m2fn:test`) |
| API documentation      | https://aisleapidocs.netlify.app                     |
