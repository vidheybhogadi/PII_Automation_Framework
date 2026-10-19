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
  /** Blocks execution (BLOCKED) vs only the expected result (NEED DEV CLARIFICATION). */
  kind: 'Access / environment' | 'Contract / expected behaviour' | 'Possible defect — confirm';
  apis: string[];
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
  },
  {
    id: 'M2Q-02',
    topic: 'Read gates',
    question:
      'What are ALLOW_PII_FIRST_NAME_READ, ALLOW_PII_EMAIL_READ and ALLOW_PII_PHONE_NUMBER_READ set to on testa2 today, and can they be switched (on/off) for a QA window? Is there a read-only way for QA to see the current values?',
    why: 'Every read expectation depends on the gate: off = local attribute, on = PII service with no fallback.',
    evidence:
      'Dev doc "Field behavior that affects test results"; ClickUp 2026-10 comment: "reads are currently turned off in the test environment".',
    decision: 'Current values, a schedule for gate-on runs, and who toggles them.',
    kind: 'Access / environment',
    apis: [],
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
  },
  {
    id: 'M2Q-04',
    topic: 'CMS access',
    question:
      'Please provide CMS test admins: one non-associate admin (allowed to edit first names) and one associate admin (not allowed), with the webcms OTP process, plus a browser session for the legacy /users/* routes and /bangalore745/irl. Which permissions do the admin read/export routes (e.g. download_profile_details) require?',
    why: 'All G10 cases and the admin authorisation tests need two permission levels.',
    evidence:
      'Dev doc: "Non-associate admin access is required for first-name edits"; CMS examples use webcms + OTP.',
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
      'Dev doc: "These model read wrappers do not automatically fall back to local values"; ClickUp: ~1 lakh profiles migrated, null names expected for others.',
    decision: 'Expected response for unmigrated profiles per field, gate on vs off.',
    kind: 'Contract / expected behaviour',
    apis: ['API-013', 'API-021'],
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
  },
  {
    id: 'M2Q-07',
    topic: 'Email rules',
    question:
      'Email: (a) how does a user change their email after onboarding? (edit ignores personal_email); (b) normalisation (case, trim) at Account::Email.add_email; (c) response for an invalid email at onboarding; (d) what happens when the email is already used by another user (search_user_ids)?',
    why: 'Defines the email write, validation and duplicate cases. Must not be guessed.',
    evidence:
      'Dev doc API-057/058 notes; "Onboarding passes user_id to Account::Email.add_email; ordinary profile edit does not update email".',
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
    evidence: 'Dev doc "Field behavior" (Phone) and migration gaps section.',
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
    evidence: 'Dev doc API-198 note + migration gaps section.',
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
    evidence: 'Dev doc: "Direct model writes catch Pii::Error, report it and continue local writes".',
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
    apis: ['API-014', 'API-020', 'API-199'],
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
  },
  {
    id: 'M2Q-15',
    topic: 'Account deletion (DPDP erasure)',
    question:
      'When an account is deleted (user/delete, delete_older_account, delete_current_account), are the NAME/EMAIL/PHONE records erased or tombstoned in the PII service (and the local compatibility columns)? When? What do PII reads return afterwards? Is a delete API in the PII service planned (M1 BQ-10)?',
    why: 'Right-to-erasure is a core DPDP requirement; QA needs the expected end state.',
    evidence:
      'Dev doc API-059/196/197: deletion reads PII names/emails for the cleanup payload; no erase step documented.',
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
    evidence: 'Dev doc API-012 and API-186 notes.',
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
  },
  {
    id: 'M2Q-21',
    topic: 'Admin search',
    question:
      '/admin/member/search uses PII-service search for first name and email even when the read gates are off, while phone still uses local SQL; /admin/members/search_profiles filters first name locally but shows the PII name. Is that intended? Is search exact-match and case-sensitive?',
    why: 'If the local and PII values differ (failed write, admin phone edit), search and display can disagree.',
    evidence: 'Dev doc API-160 note + migration gaps section; FN-SAN-031/032.',
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
];
