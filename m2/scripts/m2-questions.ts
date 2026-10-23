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
  },
  {
    id: 'M2Q-30',
    topic: 'Free-text limits',
    question:
      'Limits and validation for text, previous_message and about: max length (characters or bytes after encryption), empty / whitespace-only, emoji and non-Latin scripts, HTML. Are message_time_token / action_time_token used to de-duplicate a repeated send? Is send asynchronous (ChatMessageWorker) — how long until the message is readable?',
    why: 'Encryption adds overhead (nonce + tag, base64), so length limits and timing may change from master.',
    evidence: 'Dev doc API-187: "Message persistence runs on ChatMessageWorker".',
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
      'QA can now create accounts (10-prefixed numbers, OTP 1234). Some cases need states QA cannot create alone: (a) a verified selfie (hide-name eligibility) — may QA use /admin/images/mark_selfie_verified on its own accounts, or is there a test liveness response? (b) a pre-integration account with no PII records (unmigrated); (c) an approved / curated profile that appears in discovery. How should QA get these on staging?',
    why: 'Hide-name, unmigrated-data and discovery cases need these states.',
    evidence:
      'Dev doc API-031 (genuine liveness response needed), API-155 (admin selfie verification); M2Q-03 answer.',
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
      text: 'Login + onboarding flow from the Aisle UI automation team, verified by QA on staging (m2/docs/onboarding-flow.md): OTP request with phone_code_id 242, device fields and the app’s static signature_v1 in the body; verify with OTP 1234; POST /V1/user/submit_profile with hard-coded option ids and 4 Aisle-CDN photo URLs; POST /V1/account_journey/update_community_message_agreed; re-verify until application_stage "completed"; delete with POST /V1/user/delete {id: ref, reason_id: 1}. Photos must match the declared gender (hosted male / female sets; POST /V1/images uploads an image). Still open (not blocking): the option-list routes (unknown even to the UI team); API-onboarded profiles may be disapproved by moderation (image_inappropriate → disapproved at ~26–35 s; with the gender-matched male set QA saw pending_not_verified >60 s) — need an admin approval or a test allow-list. Tests block at runtime when a profile is flagged. Web-token issuance moved to M2Q-41.',
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
      'M2 staging run 2026-10-23 (M2-API-062-AUTH, synthetic accounts only; the token was never recorded).',
    decision: 'Intended or defect; required proof (OTP session, device binding).',
    kind: 'Possible defect — confirm',
    apis: ['API-062'],
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
  },
  {
    id: 'M2Q-38',
    topic: 'Unauthenticated payment verification',
    question:
      'Observed 2026-10-23: POST /V1/payment/verify_razorpay_payment_v1 and POST /V1/payment/verify_paytm_payment_v1 with NO credential and an empty body {} return 200 {"status":true}. Is this intended (e.g. provider-signed payloads only), and can an unauthenticated call ever activate or change a subscription?',
    why: 'A payment-verification route that answers success without any credential is a possible security defect.',
    evidence: 'M2 Step 1 staging run 2026-10-23 (M2-API-070-AUTH, M2-API-072-AUTH).',
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
  'M2-PIIR-001': { question: 'M2Q-40', security: false, text: 'test-route first-name write returns 500' },
  'M2-PIIR-002': { question: 'M2Q-40', security: false, text: 'test-route first-name write returns 500' },
  'M2-PIIR-007': { question: 'M2Q-40', security: false, text: 'test-route first-name write returns 500' },
};

/** Marker for refusals that come back as a server error (5xx) instead of 401 — observed defect pattern. */
export const SERVER_ERROR_ON_BAD_CREDENTIAL = 'M2Q-39';

/** Questions that still block: no answer yet (deferred questions are still open). */
export const OPEN = new Set(QUESTIONS.filter((q) => !q.answer).map((q) => q.id));
const CONTRACT = new Set(QUESTIONS.filter((q) => q.kind !== 'Access / environment').map((q) => q.id));

/** One status rule for every case: open contract question → NEED DEV CLARIFICATION; open access question → BLOCKED. */
export function statusFromDeps(deps: string[]): 'NEED DEV CLARIFICATION' | 'BLOCKED' | 'NOT RUN' {
  const open = deps.filter((d) => OPEN.has(d));
  if (open.some((d) => CONTRACT.has(d))) return 'NEED DEV CLARIFICATION';
  return open.length ? 'BLOCKED' : 'NOT RUN';
}
