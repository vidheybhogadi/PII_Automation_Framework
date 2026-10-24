/**
 * Milestone 2 open questions for Dev (M2Q-xx). Each is tied to the test cases that cite it (computed from
 * m2-test-cases.data.ts) and to the evidence that raised it. M1 BQ-xx questions stay in m1/docs/backend-open-questions.md.
 */
export interface M2Question {
  id: string;
  topic: string;
  question: string;
  why: string;
  evidence: string;
  decision: string;
  /**
   * Blocks execution (BLOCKED) vs only the expected result (NEED DEV CLARIFICATION). "Waiting for Dev" = nothing to
   * answer, QA waits for an environment change Dev controls (open → WAITING, not BLOCKED).
   */
  kind:
    | 'Access / environment'
    | 'Contract / expected behaviour'
    | 'Possible defect — confirm'
    | 'Waiting for Dev (environment change)';
  apis: string[];
  /** Answer received (no longer blocks; kept for traceability). */
  answer?: { text: string; by: string; on: string };
  /** Parked by the QA lead for a later phase: still open, shown as deferred. */
  deferred?: string;
}

export const QUESTIONS: M2Question[] = [
  {
    id: 'M2Q-01',
    topic: 'Build under test',
    question:
      'Which commit of saurabh/pii-changes is deployed on testa2? The inventory is from ae838f4, but on staging POST /V1/pii_integration/profile_first_name_source is implemented (400 "Missing required parameter: user_id or ref", 404 "Profile not found"), while the doc says the action is missing. Please confirm the deployed commit and what that route returns on success.',
    why: 'Expected results are tied to a source snapshot. If staging runs a newer build, the inventory may be incomplete.',
    evidence: 'Dev doc API-208 "Broken declaration" vs staging probe 2026-10-19.',
    decision: 'Deployed commit + whether the inventory needs a refresh; success contract of API-208.',
    kind: 'Contract / expected behaviour',
    apis: ['API-208'],
    answer: {
      text: 'From code — confirm with Dev: POST /V1/pii_integration/profile_first_name_source exists on develop_new (not on ae838f4) and on success returns 200 {status:true, user_id, ref, pii_only_write_performed, db_first_name_before, db_first_name_after, pii_first_name, profile_response_first_name, profile_response_uses_pii, hide_first_name}; an optional first_name param writes the PII value only (test aid). Staging behaviour (400 / 404 texts) matches this code, so testa2 most likely runs develop_new or later — the exact deployed commit is still for Dev to confirm.',
      by: 'Aisle codebase (develop_new 944f76a, app/controllers/v1/pii_integration_controller.rb:87-120)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-02',
    topic: 'Read gates',
    question:
      'What are ALLOW_PII_FIRST_NAME_READ, ALLOW_PII_EMAIL_READ and ALLOW_PII_PHONE_NUMBER_READ set to on testa2 today, and can they be switched (on/off) for a QA window? Is there a read-only way for QA to see the current values?',
    why: 'Every read expectation depends on the gate: off = local attribute, on = PII service with no fallback.',
    evidence:
      'Dev doc "Field behavior that affects test results"; ClickUp 2026-10 comment: "reads are currently turned off in the test environment". Code (develop_new 944f76a): the gates are Configuration::Constant values ALLOW_PII_FIRST_NAME_READ / _EMAIL_READ / _PHONE_NUMBER_READ (app/models/configuration/constant.rb:482-490), default false when unset — the staging values are configuration, not code.',
    decision: 'Current values, a schedule for gate-on runs, and who toggles them.',
    kind: 'Access / environment',
    apis: [],
    answer: {
      text: 'On testa2 today ALL PII read gates are OFF: writes go to the PII service, reads come from the local app DB (aisleweb). Gate flipping is not available to QA now. Gate-OFF expectations are tested now; gate-ON expectations wait until Dev enables reads (M2Q-43).',
      by: 'QA lead (2026-10-24)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-03',
    topic: 'Test accounts',
    question:
      'Please provide approved synthetic app accounts: (a) the non-production +91 test-number range and conditions for the OTP 1234 shortcut, with the phone_code_id for +91; (b) at least 4 accounts we may onboard, edit and delete; (c) one account in the migrated cohort and one confirmed NOT migrated; (d) one profile with a verified selfie (hide-name eligible); (e) two accounts that can be connected (like/accept/chat). Which app_version / device_type values should we send?',
    why: 'All USER_TOKEN / WEB_TOKEN cases need real, eligible, synthetic accounts. QA must not invent phone numbers.',
    evidence:
      'Dev doc "Request setup" (OTP 1234 shortcut, account state requirements); CLAUDE.md: synthetic data only, approved phones only.',
    decision: 'Account list in the team vault (never in the repo) + the allowed test-number range.',
    kind: 'Access / environment',
    apis: ['API-060', 'API-062'],
    answer: {
      text: 'Use any +91 mobile number starting with 10 (10xxxxxxxx), except the 106 series (1060000000–1069999999), which is reserved; its OTP is 1234 on staging. QA creates its own synthetic accounts this way. Special account states (verified selfie, pre-integration / unmigrated, discoverable profile) moved to M2Q-32.',
      by: 'QA lead',
      on: '2026-10-23',
    },
  },
  {
    id: 'M2Q-04',
    topic: 'CMS access',
    question:
      'Please provide CMS test admins: one non-associate admin (allowed to edit first names) and one associate admin (not allowed), with the webcms OTP process, plus a browser session for the legacy /users/* routes and /bangalore745/irl. Which permissions do the admin read/export routes (e.g. download_profile_details) require?',
    why: 'All G10 cases and the admin authorisation tests need two permission levels.',
    evidence:
      'Dev doc: "Non-associate admin access is required for first-name edits"; CMS examples use webcms + OTP. Code (develop_new 944f76a): admin routes authenticate with the CMS admin JWT (verify_admin_token, authenticatable.rb:330-335); accounts and permissions are an access grant.',
    decision: 'Admin accounts + permission matrix for the PII-bearing admin routes.',
    kind: 'Access / environment',
    apis: ['API-136', 'API-138', 'API-139', 'API-140', 'API-179', 'API-192'],
  },
  {
    id: 'M2Q-05',
    topic: 'Unmigrated profiles',
    question:
      'With a read gate ON, the doc says the read wrappers do not fall back to the local value when the PII record is missing. What should the app return for a not-yet-migrated profile — empty/null name, email, phone? Is that acceptable to Product, and will migration complete before any gate is switched on in production?',
    why: 'Decides whether a blank name/email/phone for an unmigrated profile is PASS (expected) or FAIL (data loss in UI, payments, invoices).',
    evidence:
      'Dev doc: "These model read wrappers do not automatically fall back to local values"; ClickUp: ~1 lakh profiles migrated, null names expected for others. Code (develop_new 944f76a, app/models/profile.rb:776-790, 810-822; app/services/pii/client.rb get_field): with the first-name gate ON, single reads return the PII value or nil when the user has no PII record (no fallback to the local name; Profile.get_first_name_for_user → Pii::FieldStore.get_first_name, NotFound → nil). Batch hydration (lists) keeps the profile\'s existing cached / local name when the PII batch returns no value for a user (apply_first_name! returns early on nil). Email / phone reads behave like the single read. Product acceptance of blank values is not settled by code. Kept open: the expected result is a Dev / Product decision.',
    decision: 'Expected response for unmigrated profiles per field, gate on vs off.',
    kind: 'Contract / expected behaviour',
    apis: ['API-013', 'API-021'],
    answer: {
      text: 'ALL profiles on staging are migrated; no unmigrated profile exists, and new QA accounts write to PII at creation. Unmigrated-profile cases cannot occur on staging, so they are NOT APPLICABLE there. What production should show for an unmigrated profile with a gate on stays a Dev / Product decision (out of scope for staging QA).',
      by: 'QA lead (2026-10-24)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-06',
    topic: 'First-name rules',
    question:
      'What does assign_first_name normalise (trim, repeated spaces, case, Unicode form)? What are the min/max length and allowed scripts/characters on the app paths (onboarding, edit, admin)? What do onboarding/edit return for a missing, null, empty or whitespace-only first_name?',
    why: 'Needed for every first-name validation case. M1 observed the PII service rules (BQ-36), but the app layer may add its own.',
    evidence:
      'Dev doc: "assign_first_name normalizes the name"; FN-SAN-016 (admin update strips whitespace).',
    decision: 'Normalisation + validation rules and error responses (status, body) per path.',
    kind: 'Contract / expected behaviour',
    apis: ['API-057', 'API-058', 'API-139'],
    answer: {
      text: 'From code — confirm with Dev: assign_first_name ignores a blank value (nil / "" / whitespace → no write, name unchanged). Otherwise normalize_first_name strips the value and, if it contains any A–Z letter, REMOVES every character that is not A–Z / a–z ("Qa  Test" → "QaTest", "D\'Souza" → "DSouza", "Anne-Marie" → "AnneMarie", "José" → "Jos"); a value with no Latin letter is kept stripped ("देवा"). No maximum length; Profile validates presence only. The same rule applies on app onboarding/edit, admin edit and the test route (all use assign_first_name). Case is kept.',
      by: 'Aisle codebase (develop_new 944f76a, app/models/profile.rb:3137-3144, 6536-6540; app/models/profile.rb:35 validates presence)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-07',
    topic: 'Email rules',
    question:
      'Email: (a) how does a user change their email after onboarding? (edit ignores personal_email); (b) normalisation (case, trim) at Account::Email.add_email; (c) response for an invalid email at onboarding; (d) what happens when the email is already used by another user (search_user_ids)?',
    why: 'Defines the email write, validation and duplicate cases. Must not be guessed.',
    evidence:
      'Dev doc API-057/058 notes; "Onboarding passes user_id to Account::Email.add_email; ordinary profile edit does not update email". Code (develop_new 944f76a): add_email only strips (case kept) and writes PII; account_emails rows are shared — a second user with the same email reuses the existing row (account/email.rb:9-18, 83-99). Change-email path and invalid-email response are not settled by code.',
    decision: 'Email update path (if any), normalisation, validation response and duplicate rule.',
    kind: 'Contract / expected behaviour',
    apis: ['API-057', 'API-058', 'API-061', 'API-129'],
  },
  {
    id: 'M2Q-08',
    topic: 'Phone resync gaps',
    question:
      'The doc says (a) returning-user login does not write PHONE to PII, and (b) admin phone edits (approve_and_edit, update_profile) update only the local number, so "the old remote value may continue to be displayed" with the phone gate on. Are these known gaps with a fix/backfill planned, or intended? Until fixed, should QA report them as defects?',
    why: 'These cases will fail by design once the phone gate is on. QA needs to know whether to report or track them.',
    evidence:
      'Dev doc "Field behavior" (Phone) and migration gaps section. Code (develop_new 944f76a, app/models/user.rb:149, 444-466; app/models/admin_user.rb:109): confirmed as written in the Dev doc. PHONE is written to PII only when login creates a NEW user (user.rb:149 … if is_new_user); returning logins never write it. Admin phone edits (AdminUser → User#update_phone_number) change only the local phone_number_id and never call the PII write. With the phone gate ON the old PII phone keeps being shown — reported below as a possible defect. Kept open: the expected result is a Dev / Product decision.',
    decision: 'Defect vs accepted gap; fix version.',
    kind: 'Possible defect — confirm',
    apis: ['API-060', 'API-139', 'API-140'],
  },
  {
    id: 'M2Q-09',
    topic: 'reset_profile',
    question:
      'POST /V1/user/reset_profile copies compatibility fields to a new user but "does not explicitly seed the new user\'s NAME, EMAIL or PHONE service rows". With gates on, the reset account would show blank PII. Is this a known gap? What is the expected result?',
    why: 'Determines whether M2-FNAME-029 / M2-PHONE-011 are expected failures or blocking defects.',
    evidence:
      'Dev doc API-198 note + migration gaps section. Code (develop_new 944f76a, app/models/user.rb:537-585, 599-640): reset_profile creates a new user + profile by copying local attributes (create_new_user_and_profile) and copies images, blocks and reports, but never writes NAME / EMAIL / PHONE to the PII service for the new user id. With the gates ON the reset account shows blank PII — possible defect. Kept open: the expected result is a Dev / Product decision.',
    decision: 'Defect vs intended; fix plan.',
    kind: 'Possible defect — confirm',
    apis: ['API-198'],
  },
  {
    id: 'M2Q-10',
    topic: 'Best-effort writes',
    question:
      'Model writes catch Pii::Error, report it and continue with the local write, so an app success does not prove the PII write. How is a failed PII write reported (Sentry, log, metric) and reconciled later? Can QA force a PII write failure on staging (feature flag, bad key, service stub) to test it?',
    why: 'Without a way to observe or force failure, partial-failure cases cannot be executed and silent divergence goes unnoticed.',
    evidence:
      'Dev doc: "Direct model writes catch Pii::Error, report it and continue local writes". Code (develop_new 944f76a): failed PII writes are caught, reported to Airbrake and the Rails log, and the local write continues (profile.rb:792-798, account/email.rb:38-45, sms_notification/phone_number.rb:206-213); there is no reconciliation job. Forcing a failure on staging is an environment action.',
    decision: 'Failure signal QA can check + an approved fault-injection method + reconciliation design.',
    kind: 'Access / environment',
    apis: ['API-057', 'API-058', 'API-139'],
  },
  {
    id: 'M2Q-11',
    topic: 'PII read failures',
    question:
      'With a gate on, what should an app API return when the PII service is slow, down or errors on read: blank field, cached value, 5xx, or a timeout? What timeout and retry does the Rails client use?',
    why: 'Defines the resilience cases for reads on hot paths (profile, discover, lists).',
    evidence: 'Dev doc: no automatic fallback when an enabled remote read is missing or fails.',
    decision: 'Expected degraded behaviour per API family + timeout/retry values.',
    kind: 'Contract / expected behaviour',
    apis: ['API-013', 'API-014'],
    answer: {
      text: 'From code — confirm with Dev: the Rails PII client uses a 5 s request timeout and 2 s connect timeout; reads retry up to 3 attempts on 502/503/504, timeouts and connection failures; writes never retry. There is no fallback: with a gate ON, a PII read error propagates (Pii::Error is re-raised by FieldStore), so the app request fails with a server error instead of a blank field. Free-text reads are the exception (they fall back to the legacy plaintext column).',
      by: 'Aisle codebase (develop_new 944f76a, app/services/pii/config.rb:5-10; app/services/pii/client.rb:176-200; app/services/pii/field_store.rb:63-81)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-12',
    topic: 'Caching',
    question:
      "FieldStore / profile cache: what are the TTLs, and how quickly must a name change appear in other users' lists (matches, likes, invites, connections)? The doc says batch hydration keeps the existing cached name when the fetched name is nil, while single-profile reads return nil — is that difference intended? Also, facade (pii-test) writes bypass cache invalidation: is there a way for QA to clear caches for a synthetic user?",
    why: 'Defines propagation expectations and explains stale/inconsistent names between single and batch consumers.',
    evidence:
      'Dev doc: "First-name cache hydration leaves its existing cached name unchanged when the fetched name is nil"; "Proxy writes bypass model/cache updates".',
    decision: 'TTL / propagation SLA; intended behaviour for nil hydration; QA cache-reset method.',
    kind: 'Contract / expected behaviour',
    apis: ['API-014', 'API-020', 'API-199', 'API-001'],
    answer: {
      text: "From code — confirm with Dev: decrypted PII values are cached in Redis per user and field (key pii:v1:user:<user_id>:<field>) for 30 days (PII_DECRYPTED_CACHE_TTL default 2,592,000 s). App writes (assign_first_name, add_email, phone write) update that cache immediately; facade (pii-test) writes do not. List hydration keeps the existing cached name when the batch read returns nil, single reads return nil (intended asymmetry not stated in code). QA can refresh a user's app caches with POST /V1/pii_integration/first_name (writes PII + local name and calls clear_cache!). Profile-cache (fill_cache!) propagation to other users' lists has no TTL in this code path.",
      by: 'Aisle codebase (develop_new 944f76a, app/services/pii/config.rb:5; app/services/pii/field_cache.rb:29-55; app/controllers/v1/pii_integration_controller.rb:36-58)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-13',
    topic: 'Hide name',
    question:
      'For toggle_hide_name: what exactly does select_first_name return when hidden (initial, first letter + mask, empty)? Does the owner see their full name? Which consumers must show the hidden form (lists, chat, push, live audio, share link, CMS)? What does toggle_hide_name return for an ineligible profile (no verified selfie)?',
    why: 'Hide-name cases need an exact expected value per consumer.',
    evidence: 'FN-SAN-006..011 (UI smoke: passing); Dev doc API-032 access path → select_first_name.',
    decision: 'Masking rule, owner view, consumer list, ineligible response.',
    kind: 'Contract / expected behaviour',
    apis: ['API-032'],
    answer: {
      text: 'From code — confirm with Dev: when hide_first_name is ON, other users see only the first letter, capitalised (select_first_name / apply_first_name!: first_name[0].capitalize). The owner sees the full name (own_general_information uses get_first_name). toggle_hide_name only toggles when the selfie is verified; for an ineligible profile it changes nothing and still answers 200 {status:true, first_name:<select_first_name>}. Push / chat / room names use select_first_name (masked).',
      by: 'Aisle codebase (develop_new 944f76a, app/models/profile.rb:3125-3133, 4721-4729, 6173-6190; app/controllers/v1/users_controller.rb:255-258)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-14',
    topic: 'PII exposure rules',
    question:
      "Which app responses may contain email and phone? We expect: owner only (own_detailed_v1 / own_general_information); never in other users' profiles or lists. What does is_test_user? do with the phone in invite/connection lists? Which CMS roles may see full email/phone and download_profile_details?",
    why: 'Exposure checks need an approved allow-list to assert against.',
    evidence:
      'Dev doc API-063/068: "phone is not added to other members\' response fields"; own_general_information → fetch_email/fetch_only_number.',
    decision: 'Allow-list of response fields per API family and role.',
    kind: 'Contract / expected behaviour',
    apis: ['API-021', 'API-063', 'API-068', 'API-179'],
    answer: {
      text: "From code — confirm with Dev: email and phone appear only in the owner's own_general_information (personal_email, phone_code, mobile_number); other users' profile and list payloads use general_information without them. is_test_user? (phone in TEST_USERS_PHONE_NUMBERS) only changes which lists are served, it does not add phones to responses. CMS role rules stay with M2Q-04.",
      by: 'Aisle codebase (develop_new 944f76a, app/models/profile.rb:6173-6190, 5288-5290)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-15',
    topic: 'Account deletion (DPDP erasure)',
    question:
      'When an account is deleted (user/delete, delete_older_account, delete_current_account), are the NAME/EMAIL/PHONE records erased or tombstoned in the PII service (and the local compatibility columns)? When? What do PII reads return afterwards? Is a delete API in the PII service planned (M1 BQ-10)?',
    why: 'Right-to-erasure is a core DPDP requirement; QA needs the expected end state.',
    evidence:
      'Dev doc API-059/196/197: deletion reads PII names/emails for the cleanup payload; no erase step documented. Code (develop_new 944f76a, app/models/user.rb:649-680; app/services/pii/client.rb): account deletion (delete_all_account_info / delete_account!) archives images, marks requests and conversations deleted and sends the account-deleted email with the PII name and email, but never deletes or tombstones the NAME / EMAIL / PHONE records in the PII service (the Rails PII client has no delete call). PII reads still return the values afterwards — possible defect (DPDP erasure). Kept open: the expected result is a Dev / Product decision.',
    decision: 'Erasure behaviour + timing + how QA verifies it.',
    kind: 'Contract / expected behaviour',
    apis: ['API-059', 'API-131', 'API-196', 'API-197'],
  },
  {
    id: 'M2Q-16',
    topic: 'DB access & schema',
    question:
      'Same as M1 BQ-04/BQ-30, extended to M2: (a) PII DB tables/columns (tenant, user, field, ciphertext, key version) — QA currently has DB access but no tables; (b) aisleweb local compatibility columns that still hold first name / email / phone (e.g. the profile first-name attribute, email_id, local number + country code) — do they still hold plaintext after migration? (c) read-only access to both for QA.',
    why: 'All M2-DB cases are blocked. (b) is also a privacy question: plaintext copies defeat the PII service.',
    evidence:
      'Dev doc: "assign_first_name … assigns the local compatibility field"; ClickUp: "I have access to the database, but there are currently no tables".',
    decision: 'Schema, read-only credentials, and the storage contract to verify.',
    kind: 'Access / environment',
    apis: [],
    answer: {
      text: 'PII DB (PostgreSQL "pii", read-only via PgBouncer) is available: M1 DB tests ran against user_pii_field_value, pii_key_registry and free_text_encryption_key on 2026-10-22. Mongo (audit trail) is for the future (M2Q-34). Aisle app DB (aisleweb) columns moved to M2Q-33.',
      by: 'QA lead',
      on: '2026-10-23',
    },
  },
  {
    id: 'M2Q-17',
    topic: 'Payment sandboxes',
    question:
      'Which payment providers are in sandbox mode on testa2 (Cashfree, PayU, PhonePe, Razorpay, Paytm, Apple, Google Play)? How can QA inspect the outbound customer payload (name, email, phone) — sandbox dashboard, request log, or Dev-assisted? What happens when name/email/phone is blank (unmigrated + gate on)?',
    why: 'G7/G8 cases must never touch live providers; QA needs a way to see what was sent.',
    evidence:
      'Dev doc API-073: "First name, email and full phone are read from the profile for the provider customer payload"; FN-SAN-039..043.',
    decision: 'Sandbox list + inspection method + blank-PII behaviour.',
    kind: 'Access / environment',
    apis: ['API-073', 'API-074', 'API-076', 'API-079', 'API-083'],
  },
  {
    id: 'M2Q-18',
    topic: 'Notifications, email & SMS',
    question:
      'How can QA capture push payloads, emails (account-deleted, moderation warning, web-purchase) and SMS (send_web_purchase_link, speed-dating) on staging — test mailbox, provider sandbox, Kafka topic access, or logs?',
    why: 'Name/email/phone in downstream messages cannot be verified through the API responses.',
    evidence:
      'Dev doc consumer table (Mailchimp::Mailer, SmsNotifierWorker, push via select_first_name); FN-SAN-025..030 were manual.',
    decision: 'Capture method per channel, or agreement that these stay manual.',
    kind: 'Access / environment',
    apis: ['API-004', 'API-137', 'API-194'],
  },
  {
    id: 'M2Q-19',
    topic: 'Special auth routes',
    question:
      'API-186 GET /api/profile_data/:user_id uses INFOEDGE_PROFILE_API_TOKEN — can QA have a test value? API-012 profile_info_web works without Authorization for public profiles — what are the public-visibility rules and which fields may it return?',
    why: 'Both are external/unauthenticated read paths and need explicit exposure checks.',
    evidence:
      'Dev doc API-012 and API-186 notes. Code (develop_new 944f76a): /api/profile_data/:user_id → external#profile_data (routes.rb:731); the token value is an access grant.',
    decision: 'Token for QA (vault) + public-profile field allow-list.',
    kind: 'Access / environment',
    apis: ['API-012', 'API-186'],
  },
  {
    id: 'M2Q-20',
    topic: 'Test-token routes',
    question:
      'For /V1/pii_integration/first_name (POST) and the batch routes: may QA write with synthetic non-numeric user_ids (as for the M1 facade)? Does the POST write only to the PII service, or also the local profile and caches? Is there a size limit for first_names/batch and profile_first_names? Are these routes going to stay after testing?',
    why: 'Defines whether the G1 write cases can run now and what they prove.',
    evidence: 'Staging probe 2026-10-19 (reads with synthetic ids return null names; empty lists → 400).',
    decision: 'Allowed test ids, write side effects, batch limits, route lifetime.',
    kind: 'Contract / expected behaviour',
    apis: ['API-001', 'API-002', 'API-003', 'API-190'],
    answer: {
      text: 'Yes — QA may write synthetic non-numeric user_ids (qa-m2-<run>-…) through POST /V1/pii_integration/first_name. The remaining contract details (write response, missing-field errors, duplicates, batch limits, side effects, route lifetime) moved to M2Q-35.',
      by: 'QA lead',
      on: '2026-10-23',
    },
  },
  {
    id: 'M2Q-21',
    topic: 'Admin search',
    question:
      '/admin/member/search uses PII-service search for first name and email even when the read gates are off, while phone still uses local SQL; /admin/members/search_profiles filters first name locally but shows the PII name. Is that intended? Is search exact-match and case-sensitive?',
    why: 'If the local and PII values differ (failed write, admin phone edit), search and display can disagree.',
    evidence:
      'Dev doc API-160 note + migration gaps section; FN-SAN-031/032. Code (develop_new 944f76a, app/models/profile.rb:131, 885-900; app/controllers/admin/members_controller.rb:3-20): admin member search filters first name through the PII search (by_pii_first_name → Pii::FieldStore.search_first_name) and email through the PII search (scope by_email → Account::Email.search_user_ids) regardless of the read gates; phone uses the local SQL column. Matching rules are those of the PII service search (exact match on the normalised value; see M1). The PII name is shown via hydrate_profile_first_names!. Kept open: the expected result is a Dev / Product decision.',
    decision: 'Intended search source per field + matching rules.',
    kind: 'Contract / expected behaviour',
    apis: ['API-160', 'API-178'],
  },
  {
    id: 'M2Q-22',
    topic: 'Test-data cleanup',
    question:
      'What is the approved cleanup for M2 synthetic accounts (delete-account API on disposable accounts? Dev script?), and for test payments, connections and CMS edits?',
    why: 'Tests must be repeatable without leaving data behind or touching real users.',
    evidence: 'M1 BQ-10 (no delete API in the PII service).',
    decision: 'Cleanup method + owner.',
    kind: 'Access / environment',
    apis: ['API-059'],
  },
  {
    id: 'M2Q-23',
    topic: 'Performance',
    question:
      'Is there a latency budget for list APIs that now hydrate names from the PII service (matches_list_v2/v3, likes received, invites)? What page sizes are typical in production?',
    why: 'Batch hydration adds a remote call on the hottest paths; QA can measure against a budget, not guess one.',
    evidence:
      'Dev doc access paths: get_multiple_cache_data → hydrate_first_names! → get_first_names_for_users.',
    decision: 'p95 budget per API (or "not in scope").',
    kind: 'Contract / expected behaviour',
    apis: ['API-014', 'API-048'],
  },
  {
    id: 'M2Q-24',
    topic: 'Contracts',
    question:
      'The inventory mentions postman_collection.json in the app repo. Is it (or a Swagger file) the authoritative response contract for these APIs? Please share it, or confirm that the current master responses are the baseline QA should compare against.',
    why: 'Regression/contract cases need a baseline; QA will not invent schemas.',
    evidence: 'Dev doc final paragraph (checked against postman_collection.json).',
    decision: 'Authoritative contract source.',
    kind: 'Access / environment',
    apis: [],
    answer: {
      text: 'Approved staging recordings are the contract reference: QA records today’s staging responses only on explicit request (npm run m2:contracts:record), reviews them (m2/contracts/REVIEW.md) and asserts only against approved files (m2/contracts/approved/). Caveat: staging already runs the PII branch, so the baseline catches future changes, not differences from master.',
      by: 'QA lead',
      on: '2026-10-23',
    },
  },
  {
    id: 'M2Q-25',
    topic: 'Release scope',
    question:
      'Which groups are in scope for this release: app profile/discovery, chat & live audio, payments, provider callbacks, CMS, ActiveAdmin? Is email/phone read-gate enablement part of this release or later?',
    why: 'Lets QA prioritise and mark out-of-scope cases NOT APPLICABLE instead of leaving them blocked.',
    evidence: 'Dev inventory lists 209 entries across all areas.',
    decision: 'In-scope groups and gate rollout order.',
    kind: 'Contract / expected behaviour',
    apis: [],
  },
  {
    id: 'M2Q-26',
    topic: 'Logs',
    question:
      'Can QA get read access to Rails/PII-client logs (or Sentry) on staging to verify that first name, email and phone are not logged in plaintext, including on PII errors?',
    why: 'Log exposure cannot be verified through APIs.',
    evidence: 'Dev doc: Pii::Error is "reported" — destination not documented.',
    decision: 'Log access or Dev-run log check.',
    kind: 'Access / environment',
    apis: [],
  },
  {
    id: 'M2Q-27',
    topic: 'Free-text contract',
    question:
      'For the free-text APIs shared on 2026-10-23: (a) which request fields are encrypted — messages/send text and previous_message, web/users/about about — and any others (message_time_token / action_time_token?); (b) in which response fields is the decrypted text returned (chat_messages messages, list_connected_profiles last-message preview, profile_info bio) and to whom; (c) is the key one per user, per conversation or per message (M1 BQ-46); (d) which aisleweb tables/columns hold ciphertext + key_id, and is the old plaintext column cleared; (e) is there a switch (like the read gates) that turns free-text encryption on/off?',
    why: 'Defines what QA asserts in responses and at storage level for every free-text API.',
    evidence:
      'Dev free-text list 2026-10-23 (m2/docs/free-text-apis.md); M1 AISLE-FT-008 proves the key round-trip only; BQ-46 open.',
    decision:
      'Encrypted fields, response fields + audience, key granularity, storage columns, on/off switch.',
    kind: 'Contract / expected behaviour',
    apis: ['API-187', 'API-063', 'API-069', 'API-121', 'API-119'],
    deferred: 'Parked by QA lead on 2026-10-23 ("keep it for future").',
    answer: {
      text: 'From code — confirm with Dev: encrypted free-text fields are chat message content and previous_message (chat_messages.encrypted_free_text_content / encrypted_free_text_previous_message), the conversation last-message preview (encrypted_free_text_last_message), the profile story about (encrypted_free_text_about) and stored image URLs (Amazon::Url encrypted_free_text_image_url). Decrypted text is returned in chat message lists (content, previous_message), the conversation list message preview and the profile story / about. Keys: one active key per context (data_category free_text + resource type + field), cached per process — not per user, conversation or message. Switches: PII_FREE_TEXT_ENCRYPTION_ENABLED plus PII_FREE_TEXT_<FIELD>_ENABLED (Configuration::Constant or ENV, default OFF). The legacy plaintext column is NOT cleared on write (possible defect). Staging switch values are not in code.',
      by: 'Aisle codebase (develop_new 944f76a = jup/free_text_pii logic; app/models/chat/message.rb:351-393; app/models/chat/conversation.rb:1062-1080; app/models/account/story.rb:103-125; app/services/pii/key_manager.rb:15-38, 99-101; app/services/pii/config.rb:67-76)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-28',
    topic: 'Legacy free text',
    question:
      'Chats and bios written before encryption: are they migrated (encrypted in place) or read as legacy plaintext? Can one conversation mix legacy and encrypted messages, and how does the read path tell them apart? Is there a backfill plan and a cohort QA can test with?',
    why: 'Mixed conversations are the most likely place for unreadable or garbled messages after release.',
    evidence:
      'Dev doc: "Chat content, story text and image URL encryption belong to the free-text migration".',
    decision: 'Legacy handling + test cohort.',
    kind: 'Contract / expected behaviour',
    apis: ['API-069', 'API-063', 'API-119'],
    deferred: 'Parked by QA lead on 2026-10-23 ("keep it for future").',
    answer: {
      text: 'From code — confirm with Dev: legacy rows are read as plaintext — FreeTextStore.read returns the legacy column when the switch is OFF or the encrypted column is blank, so one conversation can mix legacy and encrypted messages. No backfill / migration code exists in the app; a backfill plan is not settled by code.',
      by: 'Aisle codebase (develop_new 944f76a, app/services/pii/free_text_store.rb:34-41)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-29',
    topic: 'Free-text failures & revoked keys',
    question:
      'If the PII service (key create/read) is down or slow when a message is sent or a bio saved: is the request refused, queued, or stored unencrypted? When reading, what is returned if the key cannot be fetched? After a key is revoked (crypto-shredding, M1 BQ-47), what do chat_messages / profile_info return for that text?',
    why: 'A silent plaintext fallback would defeat the encryption; a revoked key must not break the whole conversation.',
    evidence: 'M1: revoked key read → 404 (observed 2026-10-01); BQ-47 open.',
    decision: 'Failure + revoked-key behaviour for write and read.',
    kind: 'Contract / expected behaviour',
    apis: ['API-187', 'API-121', 'API-069', 'API-119'],
    deferred: 'Parked by QA lead on 2026-10-23 ("keep it for future").',
    answer: {
      text: 'From code — confirm with Dev: on WRITE, an encryption / key-service error raises inside before_validation, so the message or bio save fails (no unencrypted store of the encrypted column). On READ, any Pii::Error (key unavailable, revoked, tampered) falls back to the legacy plaintext column — and because the plaintext column is still written, revoking a key does not hide the text (crypto-shredding ineffective, possible defect).',
      by: 'Aisle codebase (develop_new 944f76a, app/services/pii/free_text_store.rb:42-62; app/services/pii/free_text_encryption.rb:16-62)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-30',
    topic: 'Free-text limits',
    question:
      'Limits and validation for text, previous_message and about: max length (characters or bytes after encryption), empty / whitespace-only, emoji and non-Latin scripts, HTML. Are message_time_token / action_time_token used to de-duplicate a repeated send? Is send asynchronous (ChatMessageWorker) — how long until the message is readable?',
    why: 'Encryption adds overhead (nonce + tag, base64), so length limits and timing may change from master.',
    evidence:
      'Dev doc API-187: "Message persistence runs on ChatMessageWorker". Code (develop_new 944f76a): no length / content validation for chat text or about was found in the encryption path; limits are not settled by code.',
    decision: 'Limits, de-dup rule, expected read-after-send delay.',
    kind: 'Contract / expected behaviour',
    apis: ['API-187', 'API-121'],
    deferred: 'Parked by QA lead on 2026-10-23 ("keep it for future").',
  },
  {
    id: 'M2Q-31',
    topic: 'More free-text flows',
    question:
      'Which further APIs use free text (Dev said more are coming)? E.g. web/messages/send, CMS chat review (/admin/connections/fetch_messages), push / email previews of messages, stories, image URLs, other bio readers (app profile). Please share them with request examples when ready.',
    why: 'Coverage is complete only for the 5 free-text APIs listed so far.',
    evidence: 'Dev message 2026-10-23: "There are more to this, i will share them later".',
    decision: 'Full free-text API list.',
    kind: 'Access / environment',
    apis: ['API-188', 'API-181'],
  },
  {
    id: 'M2Q-32',
    topic: 'Special account states',
    question:
      'QA can now create accounts (10-prefixed numbers, OTP 1234). Some cases need states QA cannot create alone: (a) a verified selfie (hide-name eligibility) — may QA use /admin/images/mark_selfie_verified on its own accounts, or is there a test liveness response? (b) a pre-integration account with no PII records (unmigrated) — answered by the QA lead 2026-10-24: no unmigrated profile exists on staging (see M2Q-05), so (b) is not needed; (c) an approved / curated profile that appears in discovery. How should QA get (a) and (c) on staging?',
    why: 'Hide-name, unmigrated-data and discovery cases need these states.',
    evidence:
      'Dev doc API-031 (genuine liveness response needed), API-155 (admin selfie verification); M2Q-03 answer. Staging 2026-10-24: onboarded MALE synthetic accounts went pending_not_verified → approved within ~1–2 min in two runs (daily_requests_left 0 → 5–6); female approval not observed. Since 2026-10-24 the suite waits up to 3 min for this auto-approval (approved-state routes) and deactivates throwaway accounts itself (deactivated-state routes, users_controller.rb:3); it blocks with this question only when approval does not happen. Still open: (a) verified selfie; (c) a guaranteed way to get an approved / discoverable profile.',
    decision: 'How QA obtains each account state.',
    kind: 'Access / environment',
    apis: ['API-031', 'API-155', 'API-032'],
  },
  {
    id: 'M2Q-33',
    topic: 'App DB (aisleweb) read access',
    question:
      "Some checks need the Aisle app database: the local compatibility columns (profiles.first_name, account_emails.name, sms_notification_phone_numbers.number) and the free-text ciphertext + key_id columns. May QA read these with a read-only user, restricted to its own synthetic accounts? Today's rule: QA never queries aisleweb because it holds real users' data.",
    why: 'Without it QA can verify the PII DB, but not that plaintext copies are gone or that free text is encrypted at rest.',
    evidence: 'm1/docs/pii-db-storage-guide.md §8 (where PII lives today); CLAUDE.md DB rule.',
    decision: 'Approve read-only, synthetic-only aisleweb access (or a Dev-run check).',
    kind: 'Access / environment',
    apis: ['API-058', 'API-187', 'API-121'],
    answer: {
      text: 'The aisleweb DB uses the same server and credentials as the configured PII DB (.env DB_*), with a different database name. QA may read it read-only, restricted to its own synthetic accounts. All DB cases stay ON HOLD for now (user decision, M2Q-44).',
      by: 'QA lead (2026-10-24)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-34',
    topic: 'Mongo (audit trail)',
    question:
      'Read-only access to MongoDB audit_trails (and any Mongo collections the app uses for PII) so QA can check one audit entry per PII read / write / search without personal values (M1 BQ-30).',
    why: 'Accountability under DPDP; M1 audit tests are blocked on the same access.',
    evidence: 'M1 AISLE-DB-014/015 blocked on BQ-30.',
    decision: 'Mongo read-only access + document format.',
    kind: 'Access / environment',
    apis: [],
    deferred: 'Parked by QA lead on 2026-10-23 ("for mongo keep it for future").',
  },
  {
    id: 'M2Q-35',
    topic: 'Test-token route contracts',
    question:
      'For the /V1/pii_integration/* routes: (a) what does a successful POST first_name return (status + body)? (b) what do POST first_name without user_id / without first_name return? (c) how are duplicate ids in first_names/batch handled (counts, map)? (d) what is the size limit of first_names/batch and profile_first_names, and what happens above it? (e) does the POST write only to the PII service, or also the local profile and caches? (f) will these routes stay after testing?',
    why: 'Split from M2Q-20 (write permission answered 2026-10-23): these details are still unknown, so the tests record them instead of asserting them.',
    evidence: 'Staging probe 2026-10-19 (read shapes, empty lists → 400); Dev doc API-001/002/003/190.',
    decision:
      'Write response contract, validation errors, duplicate handling, batch limits, side effects, route lifetime.',
    kind: 'Contract / expected behaviour',
    apis: ['API-001', 'API-002', 'API-003', 'API-190'],
    answer: {
      text: 'From code — confirm with Dev: (a) POST first_name → 200 {status:true, user_id, ref, first_name:<normalised>} for an EXISTING app user id (it loads the profile; an unknown numeric id → 404 "Profile not found"); (b) missing / blank user_id or first_name → 400 "Missing required parameter: <name>"; (c) batch ids are trimmed, blanks dropped and de-duplicated (requested_user_count = unique ids); a comma-separated string is accepted as a list; (d) no size limit in the route — PII reads are chunked by PII_BATCH_SIZE (50); (e) the POST writes PII AND the local profile name and clears the app caches; (f) route lifetime is not in code.',
      by: 'Aisle codebase (develop_new 944f76a, app/controllers/v1/pii_integration_controller.rb:5-85, 141-147)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-36',
    topic: 'Onboarding prerequisites',
    question:
      'QA can create accounts (OTP login) but cannot finish onboarding: POST /V1/user/submit_profile with {} or {data:{}} → 406 "Please submit valid details…", and the Dev doc refers to "field-list APIs" and pre-uploaded photos that are not documented (guessed routes such as /V1/fields, /V1/faiths, /V1/languages, /V1/relationship_goals, /V1/images/presigned_url → 401). Please provide one of: (a) the field-list routes and contracts for faith, mother_tongue, relationship_goal and every other required submit_profile field; (b) the photo-upload / presigned-URL route, or an accepted photo URL source; (c) how a web JWT (WEB_TOKEN) is issued; or (d) pre-onboarded (and pre-connected) synthetic accounts QA may use and delete.',
    why: 'Every user / web-JWT case on a route that needs a finished profile depends on it, and /V1/user/delete only works after onboarding (new accounts cannot be cleaned up).',
    evidence:
      'Staging 2026-10-23: submit_profile {} → 406; guessed field-list routes → 401; GET /V1/user/verify_user (new user) → 200 with application_stage, application_stage_v2, selfie_compression_size; fetch_own_info and /V1/user/delete → 401 for a new user.',
    decision: 'Field-list + photo routes, web-token issuance, or pre-onboarded accounts.',
    kind: 'Access / environment',
    apis: ['API-057', 'API-061', 'API-059', 'API-013'],
    answer: {
      text: 'Login + onboarding flow from the Aisle UI automation team, verified by QA on staging (m2/docs/onboarding-flow.md): OTP request with phone_code_id 242, device fields and the app’s static signature_v1 in the body; verify with OTP 1234; POST /V1/user/submit_profile with hard-coded option ids and 4 Aisle-CDN photo URLs; POST /V1/account_journey/update_community_message_agreed; re-verify until application_stage "completed"; delete with POST /V1/user/delete {id: ref, reason_id: 1}. Photos must match the declared gender (hosted male / female sets; POST /V1/images uploads an image). From code 2026-10-24 (develop_new 944f76a — confirm with Dev): option lists come from GET /V1/fields/list_all (Bearer; Fields.fetch_app_constant_list), GET /V1/fields/settle_down_option_list, GET /fields/faiths and GET /fields/languages (config/routes.rb:44-50, 455-456; app/controllers/v1/fields_controller.rb:74-77); photos via GET /V1/images/fetch_presigned_url and POST /V1/images/upload (routes.rb:329-331); automatic photo moderation is the Hive curator, which rejects photos whose detected gender does not match the profile (app/models/hive/curator.rb:1674-1810) — no test-account allow-list exists in code. Still open (not blocking): an admin approval or a test allow-list for API-onboarded profiles; tests block at runtime when a profile is flagged. Web-token issuance moved to M2Q-41. Request placeholders (2026-10-24, from code and our own staging accounts — confirm with Dev): FAITH_ID 6, LANGUAGE_ID 1, RELATIONSHIP_GOAL_ID 2 (onboarding body), PHONE_CODE_ID 242, INTEREST_ID 1, INTEREST_V2_ID 31, TRAIT_ID 121, PREFERENCE_ID 14, SETTLE_ID 3, MBTI_ID 8, QUESTION_ID 156, AUDIO_QUESTION_ID 165, DELETE_REASON_ID 1 are defaults in m2/src/config/m2-config.ts, checked against GET /V1/fields/{interests,interests_v2,traits,settle_down_option_list,mbti_option_list,phonecodes} and GET /V1/introduction at run time; PUBLIC_USER_NAME and the chat time tokens are generated per run; PHOTO_URL / PHOTO_ID come from the caller’s own image_list (edit routes) or the hosted set of the caller’s gender (submit routes); OTHER_REF is a second suite account (female); CONVERSATION_ID comes from a mutual like between two suite accounts; AUDIO_URL from POST /V1/users/upload_audio_url with a generated silent MP3; REQUEST_ID from an invite between two suite accounts. Event, poll, room and restaurant ids: M2Q-45.',
      by: 'UI automation team via QA lead',
      on: '2026-10-23',
    },
  },
  {
    id: 'M2Q-42',
    topic: 'Login response without credential',
    question:
      'Observed 2026-10-23: POST /V1/sessions/fetch_login_response {user_id: <another synthetic account’s id>, is_new_user: false} with NO credential returns 200 with auth_token, first_name, gender, profile_state … for that account. Is this route meant to be callable without proof of the OTP login? As observed, anyone who knows a user id can obtain that user’s session token.',
    why: 'Possible account takeover: a session token for any account from its user id alone.',
    evidence:
      'M2 staging run 2026-10-23 (M2-API-062-AUTH, synthetic accounts only; the token was never recorded). Incident 2026-10-24 (record run qa-m2-20261024t111102-0f0a): the BODY wrong-type variant sent user_id 12345 — NOT a suite account — and is_new_user "qa-not-a-number"; the route answered 200 (a session token was minted for user 12345, never recorded) and, is_new_user being truthy, real "joined" attribution events may have been sent to Appsflyer / Adjust. The variant generator was fixed the same day (ids are never sent as other users’ values; is_new_user is never truthy) and the recording was discarded.',
    decision: 'Intended or defect; required proof (OTP session, device binding).',
    kind: 'Possible defect — confirm',
    apis: ['API-062'],
    answer: {
      text: 'From code — confirm with Dev: POST /V1/sessions/fetch_login_response (create_login_response_v1) has no authentication filter (authenticate_token is applied only to destroy_api, delete_account, update_profile, update_profile_web and reset_profile) and returns User.login_from_phone_number_v1 for the given user_id — including a fresh auth_token. Defect confirmed by code (account takeover from a user id).',
      by: 'Aisle codebase (develop_new 944f76a, app/controllers/v1/sessions_controller.rb:3, 111-114)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-41',
    topic: 'Web token issuance',
    question:
      'How is a web JWT (WEB_TOKEN, used by the /web/* routes that do not accept the app user JWT) issued for a synthetic account on staging? The UI automation team has no web app, so QA cannot obtain one.',
    why: 'All WEB_TOKEN cases need a web session.',
    evidence: 'Dev doc "Request setup" (WEB_TOKEN); UI automation team 2026-10-23 (no web app).',
    decision: 'Web login route / token issuance for test accounts.',
    kind: 'Access / environment',
    apis: ['API-012', 'API-119'],
    answer: {
      text: 'From code — confirm with Dev: the /web/* controllers authenticate with the normal APP user JWT (Web::ApiController#authenticate_token → User.verify_auth_token; a token with ptfrm "web" is rejected there). Their 401 for QA\'s accounts comes from the account-state filters (account_approved / account_approved_or_deactivated / account_deactivated → head :unauthorized), i.e. the profile is not approved. A true web token (ptfrm "web") is issued by generate_auth_token for device_type "web" and is used only by the payment routes with authenticate_web_token.',
      by: 'Aisle codebase (develop_new 944f76a, app/controllers/web/api_controller.rb:7-27; app/models/concerns/authenticatable.rb:4-18, 41-55, 321-328; app/controllers/v1/payment_controller.rb:4)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-37',
    topic: 'PII user_id for app users',
    question:
      'Which user_id does the app send to the PII service for an app user — the numeric "id" returned by verify_number_login_v1, the profile ref, or something else — and under which tenant? QA needs it to find a user’s rows in the PII DB (user_pii_field_value) read-only.',
    why: 'All DB checks for app users (login phone write, onboarding, edits, isolation) look up rows by tenant + user_id; guessing the mapping would make a pass or fail meaningless.',
    evidence:
      'Dev doc API-060 ("write_pii_phone_number_for_user"); M1 DB tests use the facade user_id directly.',
    decision: 'Mapping app user → PII user_id (+ tenant).',
    kind: 'Access / environment',
    apis: ['API-060', 'API-057', 'API-058'],
    answer: {
      text: 'From code — confirm with Dev: the PII user_id is the app User id (Profile.user_id) — the numeric "id" returned by verify_number_login_v1 — sent as a string; the tenant is PII_SERVICE_TENANT_ID from the app environment (the same configuration the M1 facade proxy uses).',
      by: 'Aisle codebase (develop_new 944f76a, app/models/profile.rb:776-795; app/models/concerns/authenticatable.rb:96-101; app/services/pii/config.rb:38-40)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-38',
    topic: 'Unauthenticated payment verification',
    question:
      'Observed 2026-10-23: POST /V1/payment/verify_razorpay_payment_v1 and POST /V1/payment/verify_paytm_payment_v1 with NO credential and an empty body {} return 200 {"status":true}. Is this intended (e.g. provider-signed payloads only), and can an unauthenticated call ever activate or change a subscription?',
    why: 'A payment-verification route that answers success without any credential is a possible security defect.',
    evidence:
      'M2 Step 1 staging run 2026-10-23 (M2-API-070-AUTH, M2-API-072-AUTH). Code (develop_new 944f76a): by design these two actions skip authentication (payment_controller.rb:3-6) and act as provider callbacks — without an Authorization header they call verify_by_payment_id / verify_by_order_id and ALWAYS answer {status:true} (payment_controller.rb:15-25, 82-94); with an invalid Bearer they fail with 500 (user is nil). Whether an unauthenticated success reply is acceptable is a security decision for Dev.',
    decision: 'Intended or defect; required credential.',
    kind: 'Possible defect — confirm',
    apis: ['API-070', 'API-072'],
  },
  {
    id: 'M2Q-39',
    topic: 'Invalid tokens cause server errors',
    question:
      'Observed 2026-10-23: on 179 app / web / CMS routes an invalid Bearer value ("Bearer invalid") or an expired, wrongly-signed JWT returns 500 {title, message:"Something went wrong…", is_backend_error} instead of 401; TEST_TOKEN sent to 131 user / web routes also returns 500. Should these be 401 {unauthorized_request:true} like the no-token case?',
    why: 'Server errors on bad credentials hide the real reason, fill error logs and may expose stack traces.',
    evidence: 'M2 Step 1 staging run 2026-10-23 (AUTH / TOKEN observations).',
    decision: 'Expected status for invalid / wrong-type tokens.',
    kind: 'Possible defect — confirm',
    apis: ['API-013', 'API-021', 'API-136'],
    answer: {
      text: 'From code — confirm with Dev: decode_token rescues only JWT::ExpiredSignature, so a malformed or wrongly-signed token raises JWT::DecodeError / VerificationError out of authenticate_token → 500 instead of the intended unauthorized_request (401). TEST_TOKEN on user routes is not a JWT and fails the same way. Defect confirmed by code (expected: 401 {unauthorized_request:true}). Also: the token is written to the logs (Rails.logger "Token: …", puts "token: …").',
      by: 'Aisle codebase (develop_new 944f76a, app/models/concerns/authenticatable.rb:272-284, 303-304; app/controllers/v1/api_controller.rb:11-25)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-40',
    topic: 'Test-route first-name write fails',
    question:
      'Observed 2026-10-23: POST /V1/pii_integration/first_name {user_id, first_name} with TEST_TOKEN returns 500 {title, message, is_backend_error} for synthetic non-numeric user_ids (allowed per M2Q-20); the name is then not readable (first_name:null). Is the write route broken on staging, or does it need another input?',
    why: 'Blocks the G1 write/read round-trip cases and every case that seeds a name through the test route.',
    evidence: 'M2 Step 1 staging run 2026-10-23 (M2-PIIR-001, -002, -007).',
    decision: 'Fix or correct input contract.',
    kind: 'Possible defect — confirm',
    apis: ['API-002'],
    answer: {
      text: 'From code — confirm with Dev: the write route loads Profile.by_user(user_id), a SQL comparison with the integer profiles.user_id — a non-numeric user_id raises a database error (unhandled → 500); an unknown numeric id → 404 "Profile not found". So the route only writes for EXISTING app users: tests must use a real (suite-created) account\'s user id. The unhandled 500 for non-numeric ids is a minor defect.',
      by: 'Aisle codebase (develop_new 944f76a, app/controllers/v1/pii_integration_controller.rb:36-58; app/models/profile.rb:124)',
      on: '2026-10-24',
    },
  },
  {
    id: 'M2Q-43',
    topic: 'Read gates ON',
    question:
      'Please tell QA when ALLOW_PII_FIRST_NAME_READ, ALLOW_PII_EMAIL_READ and ALLOW_PII_PHONE_NUMBER_READ are enabled on testa2, and for which fields, so the gate-ON expectations (reads return the PII value) can be run.',
    why: 'M2Q-02: all read gates are OFF on testa2 today and QA cannot switch them, so every gate-ON expectation waits for Dev.',
    evidence: 'QA lead answer to M2Q-02 (2026-10-24).',
    decision: 'Date / fields for which the read gates are enabled on testa2.',
    kind: 'Waiting for Dev (environment change)',
    apis: [],
    deferred: 'Waiting for the read gates to be enabled by Dev (QA lead, 2026-10-24).',
  },
  {
    id: 'M2Q-44',
    topic: 'DB verification on hold',
    question:
      'All M2 DB verification (PII DB rows, aisleweb local columns, free-text storage) is on hold by QA lead decision. When may QA run the read-only DB cases on its own synthetic accounts?',
    why: 'DB access exists (M2Q-16, M2Q-33 answered) but the QA lead put every DB case on hold for now.',
    evidence: 'User / QA lead decision 2026-10-24 ("keep db cases on hold").',
    decision: 'Lift the hold (date / scope).',
    kind: 'Access / environment',
    apis: [],
    deferred: 'On hold by QA lead 2026-10-24 — all DB cases wait until the hold is lifted.',
  },
  {
    id: 'M2Q-45',
    topic: 'Dev-only ids and actions',
    question:
      '(a) Some requests need ids QA cannot create with its own synthetic accounts: EVENT_ID (speed-dating event, API-101 / API-103), POLL_OPTION_ID (advertisement poll, API-105), ROOM_ID (live-audio room, API-109–112) and RESTAURANT_ID / MEAL_TYPE_ID (meetup, API-023). Which staging ids may QA use (or how can QA create them)? (b) May QA call selfie verification (API-031, sends an image to the face / liveness check) and file moderation reports (API-098 / API-135, a human moderation queue) against its own synthetic accounts?',
    why: 'Without a value the valid request cannot be built; (b) is kept Blocked by the QA lead until Dev agrees.',
    evidence:
      'Record run 2026-10-24: "no value for EVENT_ID / POLL_OPTION_ID / ROOM_ID / RESTAURANT_ID"; QA lead decision 2026-10-24 (keep API-031, API-098, API-135 Blocked).',
    decision:
      'Ids (or creation steps) for events, polls, rooms, restaurants; permission for selfie verification and reports.',
    kind: 'Access / environment',
    apis: [
      'API-023',
      'API-031',
      'API-098',
      'API-101',
      'API-103',
      'API-105',
      'API-109',
      'API-110',
      'API-111',
      'API-112',
      'API-135',
    ],
  },
  {
    id: 'M2Q-46',
    topic: 'Missing ref acts on an arbitrary member',
    question:
      'From code (origin/develop_new — confirm with Dev): Profile.by_ref is `where("profiles.ref = ?", ref.upcase) if ref.present?` (app/models/profile.rb:128), so a missing or blank ref matches EVERY profile and Profile.get_profile_by_ref(nil) returns Profile.not_deleted.first (profile.rb:855-856). Our contract recording of 2026-10-24 sent requests WITHOUT ref and staging answered 200 on: like / pass / like_back / like_sent / like_accept / like_passed / like_without_deduction (API-046, 050–053, 055, 056, 125, 127, 128), send_request_to_profile (API-004), connect_linked_users (API-064, API-132), generate_agora_token (API-065), messages/send (API-187, API-188), submit_profile_web without receiver_profile (API-061), and the profile reads API-011 / API-119 (which returned another member’s profile). Most serious: POST /V1/users/delete_older_account without ref (API-196, 200) runs delete_all_account_info on that first profile’s account (user.rb:696-705), and POST /V1/users/delete_current_account without ref (API-197, 200, reply with auth_token) deletes the caller and returns the login response of that first profile’s user (user.rb:708-723). Also: verify_number_login_v1 without phone_code_id (API-060) answered 200 with an auth_token. (a) Please check on testa2 which account(s) the API-196 / API-197 requests of the 2026-10-24 recording runs deleted or logged into, and restore them if needed. (b) Is the nil-ref fallback intended anywhere? It looks like a defect: every route should refuse a missing / blank ref (and phone_code_id) with 4xx. (c) May QA resume API-196 / API-197 (own ref only) once fixed?',
    why: 'A request without ref acts on an arbitrary — possibly real — member: likes, passes and messages are sent to them, their profile is returned, and API-196 may have deleted their account; API-197 returns their session token.',
    evidence:
      'M2 contract recording 2026-10-24 (m2/contracts/recorded/*-PARAM.json "without ref" = 200; the variants are now never sent and were removed from the recordings). Code: app/models/profile.rb:128, 855-856; app/models/user.rb:696-723; app/controllers/v1/users_controller.rb:298-306.',
    decision:
      'Defect or intended; which accounts were affected on testa2; when API-196 / API-197 may run again. Until then API-196 / API-197 are paused and no variant ever removes or blanks a target, phone or login-OTP key.',
    kind: 'Possible defect — confirm',
    apis: [
      'API-004',
      'API-011',
      'API-046',
      'API-050',
      'API-051',
      'API-052',
      'API-053',
      'API-055',
      'API-056',
      'API-060',
      'API-061',
      'API-064',
      'API-065',
      'API-119',
      'API-125',
      'API-127',
      'API-128',
      'API-132',
      'API-187',
      'API-188',
      'API-196',
      'API-197',
    ],
  },
  {
    id: 'M2Q-47',
    topic: 'Deleting accounts stuck before onboarding',
    question:
      'Some synthetic accounts the suite created stopped at the first onboarding step because POST /V1/user/submit_profile answered HTTP 500. POST /V1/user/delete answers 401 for such a new-user token (observed 2026-10-23); deletion works only after onboarding, so the clean-up onboards them first — which fails again while submit_profile returns 500. (a) Why does submit_profile return 500 for these synthetic accounts? (b) Is there a route (or a Dev-side clean-up) that deletes an account still at the first onboarding step? From code, delete_current_account needs another profile’s ref, so it is not usable. Until then the clean-up reports these accounts as "left behind (real)" with the reason.',
    why: 'Synthetic accounts the suite cannot delete stay on staging.',
    evidence:
      'Ledger reports/m2/accounts/*.json (2026-10-24): 10 entries "onboarding failed: submit_profile refused: HTTP 500"; Dev inventory note on API-059 (new-user token → 401).',
    decision:
      'Cause of the submit_profile 500; a deletion path for not-onboarded accounts (or Dev deletes them).',
    kind: 'Access / environment',
    apis: ['API-057', 'API-059'],
  },
];

/**
 * Known defects observed on staging, per case. These are NOT dependencies (the cases still run with their strict
 * assertions); the tests carry the marker so reports show them as known findings for Dev.
 */
export const KNOWN_FINDINGS: Record<string, { question: string; security: boolean; text: string }> = {
  'M2-API-070-AUTH': {
    question: 'M2Q-38',
    security: true,
    text: 'verify_razorpay_payment_v1 answers 200 {"status":true} without any credential',
  },
  'M2-API-072-AUTH': {
    question: 'M2Q-38',
    security: true,
    text: 'verify_paytm_payment_v1 answers 200 {"status":true} without any credential',
  },
  'M2-API-062-AUTH': {
    question: 'M2Q-42',
    security: true,
    text: 'fetch_login_response returns a valid auth_token and profile data for another account’s user_id without any credential',
  },
};

/** Marker for refusals that come back as a server error (5xx) instead of 401 — observed defect pattern. */
export const SERVER_ERROR_ON_BAD_CREDENTIAL = 'M2Q-39';

/** Questions that still block: no answer yet (deferred questions are still open). */
export const OPEN = new Set(QUESTIONS.filter((q) => !q.answer).map((q) => q.id));
const WAITING_KIND = 'Waiting for Dev (environment change)';
/** Open questions that only wait for an environment change Dev controls (→ WAITING, not BLOCKED). */
export const WAITING_QUESTIONS = new Set(QUESTIONS.filter((q) => q.kind === WAITING_KIND).map((q) => q.id));
const CONTRACT = new Set(
  QUESTIONS.filter((q) => q.kind !== 'Access / environment' && q.kind !== WAITING_KIND).map((q) => q.id),
);

/** Read gates ON (M2Q-43): the gate-ON half of a case waits for Dev to enable the read gates on testa2. */
export const READ_GATES_ON = 'M2Q-43';
/** All DB verification is on hold (QA lead decision 2026-10-24). */
export const DB_ON_HOLD = 'M2Q-44';

/**
 * One status rule for every case: open contract question → NEED DEV CLARIFICATION; open access question → BLOCKED;
 * only open "waiting for Dev" questions → WAITING; nothing open → NOT RUN.
 */
export function statusFromDeps(deps: string[]): 'NEED DEV CLARIFICATION' | 'BLOCKED' | 'WAITING' | 'NOT RUN' {
  const open = deps.filter((d) => OPEN.has(d));
  if (open.some((d) => CONTRACT.has(d))) return 'NEED DEV CLARIFICATION';
  if (open.some((d) => !WAITING_QUESTIONS.has(d))) return 'BLOCKED';
  return open.length ? 'WAITING' : 'NOT RUN';
}
