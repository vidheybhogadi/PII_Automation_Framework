/**
 * Questions for Dev of the M2 PII First Name suite (M2FNQ-xx). Answered questions keep their answer for
 * traceability (and no longer block); open ones block or qualify the cases that cite them. Shown on the workbook's
 * "Dev Review - Questions" sheet (npm run m2fn:docs).
 */
export type QuestionKind =
  | 'Access / environment'
  | 'Contract / expected behaviour'
  | 'Possible defect — confirm'
  | 'Waiting for Dev (environment change)';

export interface M2fnQuestion {
  id: string;
  topic: string;
  question: string;
  why: string;
  evidence: string;
  decision: string;
  kind: QuestionKind;
  apis: string[];
  /** Answer received (no longer blocks; kept for traceability). */
  answer?: { text: string; by: string; on: string };
}

const STAGING = 'Seen on staging (testa2), QA';

export const QUESTIONS: M2fnQuestion[] = [
  {
    id: 'M2FNQ-01',
    topic: 'Redis key API access',
    question:
      'For GET/DELETE /admin/redis-keys on testa2: is the route deployed, does QA’s CMS admin have the Redis permission (and is the associate refused), how does a scripted client pass the CMS OTP, and which device headers are needed?',
    why: 'Every Redis key case needs a working admin token for this route.',
    evidence:
      'Quick reference: "Use an Admin token with registered Redis permissions and completed CMS OTP verification"; 401 covers token, permission, device and OTP checks. Code: Admin::ApiController before_action order — device, token, verify_access_level, standardize_params, set_header, OTP.',
    decision: 'Deployment, permission for QA’s admin, OTP + device setup for scripted calls.',
    kind: 'Access / environment',
    apis: ['API-213', 'API-214'],
    answer: {
      text: 'Deployed on testa2. CMS login: POST /admin/login {email, encrypted_password} with webcms: true → {auth_token, qr_code_url, access_level}. OTP: POST /admin/authenticate_rotp {otp} (Bearer + webcms) → {otp_verification_passed: true}; the OTP is a TOTP (SHA1, 30 s, 6 digits) on the admin’s secret, and the passed flag stays on the admin until POST /admin/logout (logout resets it for all of that admin’s sessions). With webcms no device header is needed. Admin with OTP: allowed. Associate: 401, empty body, refused at the permission check (Cache-Control no-cache). Admin without OTP: 401 with Cache-Control no-store (passed the permission check, failed the OTP check).',
      by: STAGING,
      on: '2026-11-09',
    },
  },
  {
    id: 'M2FNQ-02',
    topic: 'Redis key names for a test user',
    question:
      'Which exact Redis keys hold one user’s first name on testa2 (profile cache, PII field cache, config flags), and does a first-name read refill a deleted PII key?',
    why: 'The API reads / deletes exact keys only; without the names QA cannot target a test user’s caches.',
    evidence:
      'Code (aisle_new develop_new): PRODUCT_NAME = "AISLE" (config/initializers/constants.rb:6); key = PRODUCT_NAME + "_" + Rails.env + "_" + data (cache/key.rb); Pii::FieldCache NAMESPACE "pii:v1", FieldRegistry cache_name "first_name".',
    decision: 'Key names per cache on testa2.',
    kind: 'Contract / expected behaviour',
    apis: ['API-213', 'API-214'],
    answer: {
      text: 'PII field cache: pii:v1:user:<user_id>:first_name (a plain string = the first name). Profile cache: AISLE_staging_profile_<ref> (a JSON string that contains first_name). Config flags: AISLE_staging_configuration_constant (JSON list; ALLOW_PII_FIRST_NAME_READ and ALLOW_PII_FIRST_NAME_WRITE are "true" on staging today — the first-name read gate is ON). Deleting a synthetic user’s PII key → GET 404 → GET /V1/pii_integration/first_name?user_id=<id> (TEST_TOKEN) → the key is filled again with the same name. Unknown key: GET 404 {status:false, message:"Redis key not found"}, DELETE 200 {status:true, key, deleted:false}. No key / blank key: 400 {status:false, message:"A non-blank string key is required", details:[{field:"key", message:"Must be a non-blank string"}]}.',
      by: `${STAGING}; key names also from code (constants.rb:6, cache/key.rb, pii/field_cache.rb)`,
      on: '2026-11-09',
    },
  },
  {
    id: 'M2FNQ-03',
    topic: 'Non-string key for the 422 case',
    question:
      'Please name one non-string Redis key (hash / list / set) on testa2 that QA may safely GET for the 422 case — ideally one that belongs to a synthetic test user or holds no personal data.',
    why: 'The 422 case needs a key of another type; QA never reads keys of real users or unknown keys.',
    evidence:
      'The hash keys found in code (AISLE_staging_rating_upgrade, the phone-code-blocked hash) do not exist on staging (seen 2026-11-09).',
    decision: 'One safe non-string key (set as M2FN_REDIS_NON_STRING_KEY).',
    kind: 'Access / environment',
    apis: ['API-213'],
  },
  {
    id: 'M2FNQ-04',
    topic: 'Redis outage window',
    question:
      'Can Dev make Redis unavailable for the Aisle service on a test environment for a short, agreed window, so QA can check the 503 reply of the Redis key APIs? What exact body does the 503 carry?',
    why: 'The failure reply must be clear and leak nothing; QA cannot (and must not) break the shared Redis itself.',
    evidence:
      'Quick reference error table: 503 "Redis operation unavailable" (condition text only, no body).',
    decision: 'An outage window (QA sets M2FN_REDIS_OUTAGE_WINDOW=true during it) and the 503 body.',
    kind: 'Access / environment',
    apis: ['API-213', 'API-214'],
  },
  {
    id: 'M2FNQ-05',
    topic: 'Redis key API scope',
    question:
      'GET /admin/redis-keys returns any Redis value to a permitted admin — including other users’ decrypted first names in the PII field cache — and DELETE removes any key (also config, sessions, other users’ caches) on the shared Redis; the audit log keeps only the key’s SHA-256. The vernac backend (testapp.koode.co, desiapp develop @ f89046944, admin/redis_keys_controller.rb) has the same routes and the same behaviour. Is that intended, or should the routes be limited (key prefix allow-list, test users, staging only)?',
    why: 'Scope decides whether the PII-exposure case is expected behaviour or a defect.',
    evidence:
      'Code (develop_new bd85044, admin/redis_keys_controller.rb): show = REDIS.get(params[:key]); destroy = REDIS.del(params[:key]); audit_access logs key_sha256. Quick reference: "Supports any Redis data type".',
    decision: 'Intended scope of the Redis key routes (Aisle and vernac).',
    kind: 'Possible defect — confirm',
    apis: ['API-213', 'API-214', 'FN-VCM-051', 'FN-VCM-050'],
  },
  // ---- First-name white-box cases (Aisle + Aisle CMS), proposal 2026-11-09, QA lead review 2026-11-11 --------
  {
    id: 'M2FNQ-06',
    topic: 'Verified selfie (hide-name)',
    question:
      'Hide-name cases need a profile with a verified selfie (toggle_hide_name only acts then). May QA mark its own synthetic suite accounts selfie-verified through the CMS (POST /admin/images/mark_selfie_verified {ref})?',
    why: 'Without a verified selfie toggle_hide_name changes nothing, so no hidden-name case can run.',
    evidence:
      'Code (develop_new bd85044): Profile#toggle_hide_name! acts only when selfie_verification.verified? (profile.rb:4743); Selfie::Verification.verify_selfie_admin updates an EXISTING selfie record (verification.rb:141-146, fetch_entry = by_profile(profile_id).first) — a profile without any selfie record cannot be verified this way (from code — confirm with Dev). Same as M2Q-32(a).',
    decision: 'Whether QA may verify its own accounts’ selfies in the CMS.',
    kind: 'Access / environment',
    apis: ['FN-AIS-067'],
    answer: {
      text: 'Yes: QA may mark its OWN synthetic suite accounts selfie-verified through /admin/images/mark_selfie_verified (CMS writes only on suite-created accounts). If an account has no selfie record the verification has no effect (from code) — the case then blocks with that reason.',
      by: 'QA lead (user), 2026-11-11',
      on: '2026-11-11',
    },
  },
  {
    id: 'M2FNQ-07',
    topic: 'Approved profile',
    question:
      'Staging auto-approval is not running (new accounts stay pending_not_verified). May QA approve its own synthetic suite accounts through /admin/approve_and_edit?',
    why: 'The profile cache, lists, chat list and connection cases need approved profiles.',
    evidence:
      'Staging 2026-11-09: new accounts stay pending_not_verified. Code: Profile#allowed_for_cache? caches only approved / pending / disapproved / vip_disapproved (profile.rb:6009); AdminUser#update_profile_data with is_approved → approved state, fill_cache! (admin_user.rb:100-127, profile.rb:3346-3361). The same call also sets gender / date_of_birth and runs update_phone_number with the posted phone (user.rb:463-478) — QA echoes the account’s own values.',
    decision: 'How QA gets approved profiles.',
    kind: 'Access / environment',
    apis: ['FN-CMS-047'],
    answer: {
      text: 'Yes: QA may approve its OWN synthetic suite accounts through /admin/approve_and_edit, because staging auto-approval is not running. The request echoes the account’s own name, gender, date of birth and phone number, so nothing else changes.',
      by: 'QA lead (user), 2026-11-11',
      on: '2026-11-11',
    },
  },
  {
    id: 'M2FNQ-08',
    topic: 'First-name gate OFF window',
    question:
      'Can Dev switch ALLOW_PII_FIRST_NAME_READ (and separately ALLOW_PII_FIRST_NAME_WRITE) to false on testa2 for an agreed window and refresh the cached AISLE_staging_configuration_constant? QA never changes flags or that key.',
    why: 'The gate-OFF cases (DB answers, PII untouched on write) can only run while a gate is off.',
    evidence:
      'Staging 2026-11-09: both gates "true". Code: Profile.can_read_first_name_from_pii? (profile.rb, Configuration::Constant cached); Pii::FieldStore.write invalidates the PII key and returns false when the write gate is off (field_store.rb:45-54).',
    decision: 'A gate-OFF window (QA sets M2FN_FLAG_WINDOW=read_off / write_off during it).',
    kind: 'Waiting for Dev (environment change)',
    apis: ['FN-AIS-002', 'FN-AIS-070'],
  },
  {
    id: 'M2FNQ-09',
    topic: 'PII service error window',
    question:
      'Can Dev make the PII service fail (unavailable / timeout) for Aisle on a test environment for an agreed window? Which reply bodies do the app routes give then?',
    why: 'PII error handling (500 / 503, divergence on write) can only be seen during such a window.',
    evidence:
      'Code: Pii::FieldStore.get_first_name re-raises Pii::Error (field_store.rb:89-91); write_pii_first_name_for_user rescues it and the DB is still saved (profile.rb:796-802); the PII read route maps Timeout / Unavailable to 503 (pii_integration_controller.rb#render_pii_error).',
    decision: 'An outage window (QA sets M2FN_PII_OUTAGE_WINDOW=true during it) and the expected bodies.',
    kind: 'Waiting for Dev (environment change)',
    apis: ['FN-AIS-002', 'FN-AIS-070'],
  },
  {
    id: 'M2FNQ-10',
    topic: 'Chat-list / live-audio cache keys',
    question:
      'What are the exact Redis key names of the chat-list cache (conversation_<id> or AISLE_staging_conversation_<id>?) and the live-audio room cache on testa2, and may the suite’s key guard allow GET / DELETE of the suite’s OWN conversation key?',
    why: 'Chat-list cache cases read and clear one conversation key of the suite’s own pair; the key guard sends nothing it does not know.',
    evidence:
      'Inventory A-R8 / A-R9 (conversation.rb:706-847, room.rb); cache/key.rb prefixes keys with PRODUCT_NAME + "_" + Rails.env (from code).',
    decision: 'Key names; permission to extend the key guard to the suite’s own conversation key.',
    kind: 'Access / environment',
    apis: ['FN-AIS-054'],
  },
  {
    id: 'M2FNQ-11',
    topic: 'Stale chat-list cache',
    question:
      'The conversation_<id> cache stores select_first_name for a month and is not cleared on a name edit, toggle_hide_name or a flag change. Is a stale chat-list name acceptable, or should edit / toggle clear the conversation caches?',
    why: 'Decides whether a stale chat-list name is a defect.',
    evidence:
      'Code: chat/conversation.rb:706-847; profile.rb:4743-4751 (toggle refills only the profile cache) @18d9eb5.',
    decision: 'Expected behaviour.',
    kind: 'Possible defect — confirm',
    apis: ['FN-AIS-054', 'FN-AIS-067'],
  },
  {
    id: 'M2FNQ-12',
    topic: 'reset_profile without PII',
    question:
      '/V1/user/reset_profile copies profiles.first_name to the new user id (copy_attributes) without a PII write; with the read gate ON the reset account has no name. Intended?',
    why: 'Decides whether the reset case’s null name is a defect.',
    evidence: 'Code: user.rb:618-635 (create_new_user_and_profile, copy_attributes) @bd85044.',
    decision: 'Expected behaviour after a reset.',
    kind: 'Possible defect — confirm',
    apis: ['FN-AIS-074'],
  },
  {
    id: 'M2FNQ-13',
    topic: 'User without a PII name',
    question:
      'Read gate ON + a user with no PII value: get_first_name returns nil (no fallback to profiles.first_name), so names are null and some callers fail (share link gsub with nil). Is a DB fallback planned, or must the backfill be complete?',
    why: 'Decides the expected result for users missing in PII.',
    evidence:
      'Code: Pii::Client#get_field rescues NotFound → nil (client.rb:29-30); Profile.get_first_name_for_user (profile.rb:780-784); ProfileShareLinks.get_link gsub("RECOMMENDER", get_first_name) (profile_share_links.rb:43).',
    decision: 'Expected behaviour for users without a PII name.',
    kind: 'Possible defect — confirm',
    apis: ['FN-AIS-002', 'FN-AIS-065'],
  },
  {
    id: 'M2FNQ-14',
    topic: 'Hydration keeps the cached value',
    question:
      'apply_first_name! keeps the cached value when PII returns nil, and shows an initial whenever the cached value has 1 character and the PII value is longer — also for a user who is not hidden. Which answer is expected in these cases?',
    why: 'Two different answers for the same user (instance read nil, hydrated read = cached value); a 1-letter cached name looks hidden.',
    evidence: 'Code: profile.rb:814-832 (apply_first_name!, hidden_first_name_value?) @bd85044.',
    decision: 'Expected display rule.',
    kind: 'Possible defect — confirm',
    apis: ['FN-AIS-015'],
  },
  {
    id: 'M2FNQ-15',
    topic: 'Full name where hide should apply',
    question:
      'Share-link preview text, the recommendation header, the matched popup and chat history sender_name use get_first_name (full) instead of select_first_name. Should hide_first_name apply there?',
    why: 'Decides whether a hidden user’s full name in these places is a defect.',
    evidence: 'Code: profile_share_links.rb:43; text.rb:383-410; chat/message.rb:95 @18d9eb5.',
    decision: 'Expected display rule.',
    kind: 'Possible defect — confirm',
    apis: ['FN-AIS-065', 'FN-AIS-063'],
  },
  {
    id: 'M2FNQ-16',
    topic: 'Own name when hidden',
    question:
      'For a hidden user’s OWN views: the login response returns select_first_name (initial), app launch / own info / meta_for_discover return get_first_name (full), and web /web/users/:ref returns the initial. Which is correct?',
    why: 'The own-name case records these forms until Dev decides.',
    evidence:
      'Code: concerns/authenticatable.rb:203 vs device_info/banned_version.rb:135; own_detailed_web @18d9eb5.',
    decision: 'Expected own-name form when hidden.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-AIS-031', 'FN-AIS-033', 'FN-AIS-050'],
  },
  {
    id: 'M2FNQ-17',
    topic: 'Name clean-up rules',
    question:
      'normalize_first_name strips everything except A-Z / a-z and keeps the original only when nothing is left: "Anne-Marie" → "AnneMarie", "José" → "Jos", "Ravi2" → "Ravi", while "123", emoji and non-Latin names are kept. Intended?',
    why: 'The clean-up case asserts PII = Aisle DB and records whether the value follows this rule.',
    evidence: 'Code: profile.rb:6560-6564 @bd85044.',
    decision: 'Expected clean-up rules.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-AIS-070'],
  },
  {
    id: 'M2FNQ-18',
    topic: 'CMS member-list search on Postgres',
    question:
      'GET /admin/members/search_profiles?first_name= still matches profiles.first_name in the Aisle DB (exact, case-sensitive); the PII search is never used. Should it use the PII search after the migration?',
    why: 'Decides whether the bypass case’s result is a defect.',
    evidence: 'Code: Profile.search_profiles_by_params → filter_by first_name = ? (inventory FN-CMS-065).',
    decision: 'Expected search source.',
    kind: 'Possible defect — confirm',
    apis: ['FN-CMS-065'],
  },
  {
    id: 'M2FNQ-19',
    topic: 'CMS likes filter',
    question:
      'GET /admin/member/user_activity_v1?filter=likes_sent|likes_received|likes_passed calls get_first_name on a UserLike row, which defines no such method (expected NoMethodError → 500). Known?',
    why: 'Decides whether the likes-filter result is a defect.',
    evidence: 'Code: user_like.rb:1513 @18d9eb5 (inventory correction note).',
    decision: 'Expected behaviour.',
    kind: 'Possible defect — confirm',
    apis: ['FN-CMS-014'],
  },
  {
    id: 'M2FNQ-20',
    topic: 'CMS sparks filter on Postgres',
    question:
      'The sparks filters of user_activity_v1 read from_name / to_name straight from profiles.first_name (read gate ignored). Should they use the PII name?',
    why: 'Decides whether the sparks bypass is a defect.',
    evidence: 'Code: Account::Spark.*_activity → create_spark_activity (inventory FN-CMS-045).',
    decision: 'Expected source.',
    kind: 'Possible defect — confirm',
    apis: ['FN-CMS-045'],
  },
  {
    id: 'M2FNQ-21',
    topic: 'Live audio retired?',
    question:
      'fetch_all_live_audios returns [] on its first line. Is live audio retired (so the room-cache cases can be dropped)?',
    why: 'The room-cache cases are N/A until this is known.',
    evidence: 'Code: live_audio/room.rb:32-33 @18d9eb5.',
    decision: 'Feature status.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-AIS-057'],
  },
  {
    id: 'M2FNQ-22',
    topic: 'CMS queue states and reports',
    question:
      'How can a synthetic account get into the CMS queues (image updates / auto updates, curation tab, VIP, HNI, autofeed), and may QA file a report between two of its own accounts?',
    why: 'The reports, image-list, curation and echo-write cases need an own account in that queue.',
    evidence:
      'Inventory FN-CMS-006, 027, 048, 052, 053, 061; M2Q-45 (moderation reports kept blocked by the QA lead).',
    decision: 'How QA puts its own accounts into each queue; permission for own-account reports.',
    kind: 'Access / environment',
    apis: ['FN-CMS-027', 'FN-CMS-006', 'FN-CMS-053', 'FN-CMS-061', 'FN-CMS-048'],
  },
  {
    id: 'M2FNQ-23',
    topic: 'Associate role',
    question:
      'Which CMS routes may the associate use (Admin::ApiPermission)? Is it intended that an associate’s name edit on /admin/update_profile is ignored silently while the reply still says status true?',
    why: 'The role cases record what the associate gets until Dev confirms.',
    evidence:
      'Code: Profile#update_application_by_admin! skips first_name for associate access (profile.rb:3346-3351); AdminUser#update_profile_data returns true (admin_user.rb:100-127). Staging 2026-11-09: the associate is refused by the Redis key API.',
    decision: 'Associate permissions and the silent-ignore behaviour.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-CMS-049', 'FN-CMS-001'],
  },
  {
    id: 'M2FNQ-24',
    topic: 'PII change outside Aisle',
    question:
      'May QA write a suite account’s NAME through the M1 facade (POST /api/v1/pii-test) to simulate a PII change that skips Aisle’s caches? Is a field-cache hit within the 30-day TTL after such a change acceptable?',
    why: 'Stale-cache cases need a PII value that changed without Aisle clearing its caches.',
    evidence:
      'Code: Pii::FieldStore.get_first_name serves the field cache first (field_store.rb:74-92), TTL PII_DECRYPTED_CACHE_TTL (default 30 days); the facade proxies straight to the PII service (pii_test_controller.rb), PII field name NAME (field_registry.rb).',
    decision: 'Permission; whether a cache hit is judged.',
    kind: 'Access / environment',
    apis: ['FN-AIS-105'],
    answer: {
      text: 'Yes: QA may write its own suite accounts’ NAME through the M1 facade to simulate a PII change outside Aisle. A field-cache hit within the 30-day TTL is recorded, not judged.',
      by: 'QA lead (user), 2026-11-11',
      on: '2026-11-11',
    },
  },
  {
    id: 'M2FNQ-25',
    topic: 'Write gate OFF keeps the old PII name',
    question:
      'With the write gate OFF a name edit saves the Aisle DB only and clears the PII cache key, so with the read gate ON the user keeps seeing the OLD PII name. Intended?',
    why: 'Decides whether the write-gate-OFF result is a defect.',
    evidence: 'Code: field_store.rb:45-54; profile.rb:3157-3163 @bd85044.',
    decision: 'Expected behaviour.',
    kind: 'Possible defect — confirm',
    apis: ['FN-AIS-070'],
  },
  {
    id: 'M2FNQ-26',
    topic: 'Account-data export',
    question:
      'GET /admin/members/download_account_data starts an export job: how does the admin get the file (status route, download URL) and in which format is the “First Name” line?',
    why: 'The export case records the reply until the retrieval is known.',
    evidence:
      'Code: Admin::AccountDataExportWorker → Admin::AccountDataTextExport (inventory FN-CMS-018 / 035).',
    decision: 'Retrieval route and format.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-CMS-018'],
  },
  {
    id: 'M2FNQ-27',
    topic: 'ActiveAdmin session',
    question:
      'The bangalore745 ActiveAdmin pages and the top-level /users/:ref use a devise cookie session. Will QA get such a login on testa2, or are these rows skipped?',
    why: 'Five CMS rows cannot be called without it.',
    evidence: 'Inventory FN-CMS-031, 032, 033, 034, 046.',
    decision: 'Login or "skip".',
    kind: 'Access / environment',
    apis: ['FN-CMS-031', 'FN-CMS-033'],
  },
  {
    id: 'M2FNQ-28',
    topic: 'Partner token and payment params',
    question:
      'The partner API /api/profile_data/:user_id needs INFOEDGE_PROFILE_API_TOKEN, and the payment-param routes build provider requests with the name. Skip these rows, or provide a token / a sandbox confirmation?',
    why: 'Ten Aisle rows cannot be called safely without it.',
    evidence: 'Inventory FN-AIS-004, FN-AIS-093…101; M2Q-17 / M2Q-19.',
    decision: 'Skip or access.',
    kind: 'Access / environment',
    apis: ['FN-AIS-004', 'FN-AIS-100'],
  },
  {
    id: 'M2FNQ-29',
    topic: 'Unauthenticated public profile',
    question:
      'GET /V1/users/profile_info_web answers without a credential and returns the profile’s first name. Is this public page intended to show the name of any profile, or only of profiles shared publicly?',
    why: 'The sweep records the unauthenticated reply until Dev confirms.',
    evidence: 'Code: users_controller.rb:3 (skip auth for profile_info_web) — inventory FN-AIS-003.',
    decision: 'Expected exposure.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-AIS-003'],
  },
  {
    id: 'M2FNQ-30',
    topic: 'Batch over 50 users',
    question:
      'The batch-over-50 case needs 51 users whose PII names are not cached. Should QA create 51 synthetic accounts per run (opt-in), or will Dev lower PII_BATCH_SIZE on testa2?',
    why: 'PII is read in batches of 50 (Pii::Config DEFAULT_BATCH_SIZE); only more than 50 cache misses use two batches.',
    evidence: 'Code: pii/config.rb:10, 65-66; field_store.rb:238 (each_slice).',
    decision: 'How the case gets more than 50 uncached users.',
    kind: 'Access / environment',
    apis: ['FN-AIS-109'],
    answer: {
      text: 'An opt-in run flag M2FN_BATCH_ACCOUNTS=true lets the case create 51 synthetic accounts (deleted at the end of the run). It is off by default; without it the case is Blocked with that reason.',
      by: 'QA lead (user), 2026-11-11',
      on: '2026-11-11',
    },
  },
  {
    id: 'M2FNQ-31',
    topic: 'Onboarding re-submit renames',
    question:
      'A second POST /V1/user/submit_profile on an already onboarded account (application_stage completed) answered 200 and changed the PII first name to the newly posted name. The code assigns the name only when get_first_name is nil (profile.rb:3364-3367). Is the re-submit expected to rename, or is this a defect?',
    why: 'A repeated onboarding request (app retry, old client) would silently rename the member.',
    evidence:
      'Seen on staging 2026-11-11 (run of M2FN-WRT-004): PII read before = the onboarding name, submit_profile 200 with a new name, PII read after = the new name. Code: develop_new bd85044 profile.rb:3363-3376.',
    decision: 'Expected behaviour of a re-submit.',
    kind: 'Possible defect — confirm',
    apis: ['FN-AIS-071'],
  },
  // ---- Vernac + Vernac CMS first-name cases (proposal 2026-11-11, approved by the QA lead 2026-11-11) ---------
  {
    id: 'M2FNQ-32',
    topic: 'Vernac build on testapp',
    question:
      'Does https://testapp.koode.co run desiapp origin/develop @ f89046944 (or later)? The vernac expected results are taken from that code.',
    why: 'Every vernac expected result is labelled “from code — confirm with Dev”; a different build can change them.',
    evidence:
      'develop contains jup/pii @ b85773da4 and the /admin/redis-keys route (seen working on staging 2026-11-11); the staging branch does not.',
    decision: 'Build / ref deployed on testapp.koode.co.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-VRN-002'],
  },
  {
    id: 'M2FNQ-33',
    topic: 'Vernac Redis key names',
    question:
      'Which Rails.env and PII_SERVICE_CALLER_ID does testapp use, i.e. what are the exact profile-cache, conversation-cache and PII-field-cache key names of a vernac user?',
    why: 'The cache cases read and clear exact keys only.',
    evidence:
      'Code: cache/key.rb:287-289 (PRODUCT_NAME + "_" + Rails.env + "_" + data, PRODUCT_NAME = "DESIAPP"), services/pii/cache.rb:14-18 (pii:v1: + base64url segments), services/pii/config.rb:5-7 (caller id default desiapp-rails).',
    decision: 'Key names per cache on testapp.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-VRN-031', 'FN-VRN-051', 'FN-VCM-051'],
    answer: {
      text: 'Rails.env = staging and caller id = desiapp-rails: DESIAPP_staging_profile_<ref> returned 200 (a JSON string) while the production / development forms were 404; pii:v1:<b64 staging>:<b64 desiapp-rails>:<b64 desiapp-arike>:<b64 user>:<b64 user_id>:<b64 NAME> returned 200 with the plain first name (team user …9, Arike). PII tenants from app_lists: desiapp-arike, desiapp-anbe, desiapp-neetho, desiapp-neene (desiapp-heydil out of scope).',
      by: 'Seen on staging (testapp.koode.co), QA; key format from code',
      on: '2026-11-11',
    },
  },
  {
    id: 'M2FNQ-34',
    topic: 'Relations between team users',
    question:
      'May the suite create likes, passes, invites, sparks or connections between two of the nine team users? They cannot be undone and they push to team phones.',
    why: 'List, chat and CMS-activity cases need a relation between two team users.',
    evidence:
      'Like / invite / spark routes send pushes and change match state (like.rb:93-162, request.rb:147,230, sparks/send.rb).',
    decision: 'Create relations or use only existing ones.',
    kind: 'Access / environment',
    apis: ['FN-VRN-005', 'FN-VRN-014', 'FN-VCM-031'],
    answer: {
      text: 'NO new likes, passes, invites, sparks or connections. Use ONLY relations that already exist among the nine users, found by the read-only DB lookup; otherwise the case is Blocked with the reason. Update 2026-11-12: likes (and the match a like makes) between two team accounts IN THE SAME APP are allowed, and one chat message in a team-only conversation; passes, invites and sparks are still not created, and no new users. Every such change is listed as an irreversible effect of the run.',
      by: 'QA lead (user), 2026-11-11; updated 2026-11-12 ("proceed with all remaining")',
      on: '2026-11-12',
    },
  },
  {
    id: 'M2FNQ-35',
    topic: 'Non-name edits on team users',
    question:
      'May the suite call edit_profile, update_interests and story on team users (with save-and-restore)?',
    why: 'Three sweep rows return the own name only in the reply of these edit routes.',
    evidence:
      'user_controller.rb:73-86; profile.rb:1473-1494 (an empty body only refreshes the profile cache).',
    decision: 'Allowed or not.',
    kind: 'Access / environment',
    apis: ['FN-VRN-023', 'FN-VRN-027', 'FN-VRN-049'],
    answer: {
      text: 'YES to non-name edits (edit_profile, update_interests, story) on team users, with save-and-restore. The sweep sends an empty body (from code: only the profile cache is refreshed), so there is nothing else to restore.',
      by: 'QA lead (user), 2026-11-11',
      on: '2026-11-11',
    },
  },
  {
    id: 'M2FNQ-36',
    topic: 'CMS rename keeps extra inner spaces in Postgres',
    question:
      'A CMS rename stores first_name.strip in Postgres (inner spaces kept) while the PII service collapses inner whitespace, so "Ab  Cd" stays "Ab  Cd" in account_profiles and becomes "Ab Cd" in PII. The CMS name search (ILIKE on Postgres) then finds the double-space form only. Is this difference intended?',
    why: 'Postgres and PII disagree for the same member, and every Postgres-based path (search, sparks activity, raw caches) shows a different name.',
    evidence:
      'profile.rb:3053 (update_data_by_admin! strip only); services/pii/fields.rb:13 (strip + gsub(/\\s+/, " ")); profile.rb:260 (filter_by_first_name ILIKE).',
    decision: 'Expected stored values in Postgres and PII.',
    kind: 'Possible defect — confirm',
    apis: ['FN-VCM-043', 'FN-VCM-045'],
  },
  {
    id: 'M2FNQ-37',
    topic: 'Sparks admin activity from_name on Postgres',
    question:
      'In GET /admin/member/user_activity_v1 with a sparks_* filter, from_name comes from a raw SQL alias of account_profiles.first_name (Postgres) while to_name in the same row goes through the PII getter. Should from_name use the PII value?',
    why: 'One CMS row would show two sources; a name changed only in PII is shown stale for the counterpart.',
    evidence:
      'services/sparks/admin_activity.rb:45-55 (spark_activity_profiles.first_name AS spark_activity_name), :80-95 (serialize).',
    decision: 'Source of from_name.',
    kind: 'Possible defect — confirm',
    apis: ['FN-VCM-052', 'FN-VCM-012'],
  },
  {
    id: 'M2FNQ-38',
    topic: 'Chat messages ignore hide_first_name',
    question:
      'POST /v1/chat/chat_messages returns sender_name = the partner’s full first name even when the partner hid it (hide_first_name). Intended?',
    why: 'A hidden member’s full name would be shown in the chat screen.',
    evidence:
      'chat/message.rb:49-121 (obj[:sender_name] = profile_sender.first_name), same on master and develop.',
    decision: 'Masked or full name.',
    kind: 'Possible defect — confirm',
    apis: ['FN-VRN-018'],
  },
  {
    id: 'M2FNQ-39',
    topic: 'Likes-tab sparks not redacted',
    question:
      'The likes tab (list_likes_received / list_request_and_likes) redacts likes for viewers who cannot see profiles, but the new sparks section returns full profiles with first_name. Intended for sparks?',
    why: 'Names would be visible where likes are deliberately hidden.',
    evidence: 'services/likes_tab/query.rb:129-130, 298-310; likes_tab/spark_serializer.rb:3-25.',
    decision: 'Redact sparks too or not.',
    kind: 'Possible defect — confirm',
    apis: ['FN-VRN-004', 'FN-VRN-006'],
  },
  {
    id: 'M2FNQ-40',
    topic: 'fetch_login_response calls a missing method',
    question:
      'POST /v1/session/fetch_login_response calls Account::User.create_login_response_v1, which is not defined, so it answers 500. Which payload is intended?',
    why: 'An app calling it gets an error instead of the login payload (which carries the first name).',
    evidence:
      'session_controller.rb:23-26; user.rb defines only the instance method create_login_response (:530).',
    decision: 'Intended behaviour of the route.',
    kind: 'Possible defect — confirm',
    apis: ['FN-VRN-019'],
  },
  {
    id: 'M2FNQ-41',
    topic: 'Payment-link email',
    question:
      'POST /admin/members/send_payment_link puts the first name into the email HTML without escaping, sends to the address in params[new_user_ref] and has no render. Is that intended, and is there a QA inbox / sandbox to check it?',
    why: 'Markup in a name renders in the email; the recipient is chosen by the caller.',
    evidence: 'members_controller.rb:724-726; mailchimp/mailer.rb:122-173.',
    decision: 'Escaping, recipient rule, QA inbox.',
    kind: 'Possible defect — confirm',
    apis: ['FN-VCM-018'],
  },
  {
    id: 'M2FNQ-42',
    topic: 'Cashfree customer name',
    question:
      'Is Cashfree on testapp a sandbox QA may call? The subscription create route accepts a client customer_name that overrides the profile name — intended?',
    why: 'Payment cases never run against a real provider; a client-chosen name goes to the provider.',
    evidence: 'payment/cashfree/subscription.rb:129, 346-347; payment/cashfree/api.rb:26-47.',
    decision: 'Sandbox access and the override rule.',
    kind: 'Possible defect — confirm',
    apis: ['FN-VRN-054', 'FN-VRN-055'],
  },
  {
    id: 'M2FNQ-43',
    topic: 'invite_received event',
    question:
      'Sending an invite posts the sender’s (shown) first name synchronously to NOTIFICATION_EVENT_SERVER_URL inside the request transaction. Is that service in PII scope (does it store / log names) and what happens when it fails?',
    why: 'The name leaves the system in clear; a failure inside the transaction may break the invite.',
    evidence:
      'notifier/notification_message.rb:72-89; device_info/push_notification.rb:21-24; notifier/user_detail.rb:6-17.',
    decision: 'Scope and failure handling.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-VRN-037', 'FN-VRN-038'],
  },
  {
    id: 'M2FNQ-44',
    topic: 'Names in vernac server logs',
    question:
      'develop reverts config.filter_parameters (first_name no longer filtered), verify_number_login logs the whole login response and Admin::ApiController logs params.to_json on every admin call. Can Dev confirm whether names reach the logs on testapp and remove these logs before rollout?',
    why: 'Plain first names would be kept in the logs.',
    evidence:
      'filter_parameter_logging.rb:4-6 (vs :5-8 on jup/pii); session_controller.rb:19; admin/api_controller.rb:53; members_controller.rb:2-9.',
    decision: 'Dev log check and fix.',
    kind: 'Possible defect — confirm',
    apis: ['FN-VRN-062', 'FN-VRN-063', 'FN-VCM-053', 'FN-VCM-054'],
  },
  {
    id: 'M2FNQ-45',
    topic: 'Offline-event form name',
    question:
      'Offline-event orders store a user-typed name in offline_event_orders.personal_info (plain JSON) and use it in invoices and emails. In or out of the PII first-name scope?',
    why: 'It is a name outside the PII rollout.',
    evidence: 'offline_event/order.rb:63-74; deloitte_export_invoice_retry.rb:397-429.',
    decision: 'Scope.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-VRN-053', 'FN-VRN-056'],
  },
  {
    id: 'M2FNQ-46',
    topic: 'No PII name falls back to Postgres (vernac)',
    question:
      'For a member without a PII NAME row, vernac returns the Postgres name (DirectFields.read: FieldStore.fetch || legacy), while Aisle returns null. Is the fallback intended? (7 of the 9 Arike team users and every Anbe / Neetho / Neene team user have no PII NAME row, PII DB 2026-11-11.)',
    why: 'Decides the expected result for members not yet backfilled.',
    evidence:
      'services/pii/direct_fields.rb:7-14; profile_hydrator.rb:23 (names default to the legacy column).',
    decision: 'Fallback or null.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-VRN-022'],
  },
  {
    id: 'M2FNQ-47',
    topic: 'Vernac flag-off and PII-outage windows',
    question:
      'Can Dev switch pii_name_read or pii_name_write off for ONE vernac app (e.g. Neetho) for a short window, and make the PII service unavailable for testapp for a short window, so QA can run the gate-off and outage cases? QA never changes app_features.',
    why: 'Fallback and failure behaviour can only be seen in such a window.',
    evidence:
      'services/pii/config.rb (enabled? reads app_features per call); direct_fields.rb:11-13; application_controller.rb:11-14.',
    decision: 'Window dates (set M2FN_VN_FLAG_WINDOW / M2FN_VN_PII_OUTAGE_WINDOW then).',
    kind: 'Waiting for Dev (environment change)',
    apis: ['FN-VRN-002', 'FN-VCM-043'],
  },
  {
    id: 'M2FNQ-48',
    topic: 'Vernac associate and the CMS OTP',
    question:
      'The vernac associate login has no OTP secret, so every webcms call is refused 401 at the OTP filter, whatever its permissions. Is that the intended associate set-up, or should it have an OTP so role permissions can be tested?',
    why: 'Without it the associate cases cannot tell a permission refusal from an OTP refusal.',
    evidence:
      'admin/api_controller.rb:7, 27-30, 52-55 (verify_access_level before authenticate_otp_verification).',
    decision: 'Associate set-up.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-VCM-025', 'FN-VCM-043'],
  },
  {
    id: 'M2FNQ-49',
    topic: 'Vernac account deletion keeps the PII name',
    question:
      'session/delete_account and members/delete_account_by_admin soft-delete the user but leave the PII NAME row and the pii:v1 field cache (30 days). Is a PII delete planned?',
    why: 'Deleted members’ names stay readable; QA cannot test it on team accounts (irreversible).',
    evidence: 'account/user.rb:474-507.',
    decision: 'PII delete on account deletion.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-VRN-048', 'FN-VCM-047'],
  },
  {
    id: 'M2FNQ-50',
    topic: 'profile_view DB view',
    question:
      'The vernac DB view profile_view copies account_profiles.first_name; no app code reads it. Who reads it (reports, BI, exports)?',
    why: 'A downstream reader would keep showing the Postgres name.',
    evidence: 'Read-only DB, 2026-11-11; no reference in desiapp develop.',
    decision: 'Downstream readers of profile_view.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-VRN-051'],
  },
  {
    id: 'M2FNQ-51',
    topic: 'New users on team numbers',
    question:
      'May a team number onboard a NEW user in an app where it has none? A login does that automatically (user.rb:44-50).',
    why: 'The onboarding name clean-up case needs a new user.',
    evidence: 'account/user.rb:44-50 (create_by_phone_number when no user exists).',
    decision: 'Allowed or not.',
    kind: 'Access / environment',
    apis: ['FN-VRN-045'],
    answer: {
      text: 'NO onboarding of new users. Never log in with a number in an app where the DB shows no user for it (the vernac session guard enforces this). M2FN-VWRT-002 stays Blocked.',
      by: 'QA lead (user), 2026-11-11',
      on: '2026-11-11',
    },
  },
  {
    id: 'M2FNQ-52',
    topic: 'Verified selfie for the hide cases',
    question:
      'If none of the nine users has a verified selfie, may QA mark one verified through the vernac CMS (POST /admin/images/mark_selfie_verified)?',
    why: 'The hide toggle works only with a verified selfie (profile.rb:2547-2548).',
    evidence: 'admin/images_controller.rb:117-123; selfie/verification.rb:86-91.',
    decision: 'Allowed or not.',
    kind: 'Access / environment',
    apis: ['FN-VRN-043'],
    answer: {
      text: 'YES: QA may mark ONE of the nine users selfie-verified through the vernac CMS, but only if none is verified already. Record which user, and do not undo it. (Read-only DB 2026-11-11: Arike team users …2, …3 and …9 are already verified, so nothing is marked.)',
      by: 'QA lead (user), 2026-11-11',
      on: '2026-11-11',
    },
  },
  {
    id: 'M2FNQ-53',
    topic: 'CMS queue and state changes on team users',
    question:
      'May the suite move team users through curation / VIP / image queues, or use approve_and_edit on users who are not approved?',
    why: 'Those routes change the profile state, which cannot be restored.',
    evidence: 'admin/curation.rb:4-36; admin/pending_controller.rb:34-38; admin_user.rb:129-195.',
    decision: 'Allowed or not.',
    kind: 'Access / environment',
    apis: ['FN-VCM-036', 'FN-VCM-048', 'FN-VCM-049'],
    answer: {
      text: 'NO curation, VIP or image-queue state changes. NO approve_and_edit on users who are not approved; M2FN-VCMW-005 runs only on a user who is already approved.',
      by: 'QA lead (user), 2026-11-11',
      on: '2026-11-11',
    },
  },
  {
    id: 'M2FNQ-54',
    topic: 'chat_messages route definition',
    question:
      'config/routes.rb:102 maps POST /v1/chat/chat_messages to "chat/chat_messages" without an #action. Does the route reach V1::ChatController#chat_messages on testapp?',
    why: 'The hidden-sender chat case calls it.',
    evidence: 'config/routes.rb:102 @ f89046944 (every other chat route has controller#action).',
    decision: 'Working route or not.',
    kind: 'Contract / expected behaviour',
    apis: ['FN-VRN-018'],
  },
  {
    id: 'M2FNQ-55',
    topic: 'Sparks among team users',
    question:
      'action_sparks is one of the vernac tables QA’s read-only DB user cannot read (permission denied, 2026-11-11). Can Dev grant SELECT on it, or name an existing spark between two of the nine team users?',
    why: 'Only existing relations may be used (M2FNQ-34); without the table the sparks cases cannot find one.',
    evidence: 'Read-only DB 2026-11-11: SELECT on action_sparks → driver code 42501.',
    decision: 'Read access or a named spark.',
    kind: 'Access / environment',
    apis: ['FN-VCM-052', 'FN-VRN-004'],
  },
  {
    id: 'M2FNQ-56',
    topic: 'Vernac CMS member search answers 500',
    question:
      'GET /admin/member/search on testapp answers 500 {title, message:"Something went wrong…", is_backend_error:true} for every query QA sent (ref, ref + page, user_id, ref + first_name), with a verified admin and the app-name header. Is this a known defect?',
    why: 'The member search is the main CMS lookup; the name-search cases cannot run while it fails.',
    evidence:
      'Seen on staging 2026-11-11 (runs of M2FN-VCMS-001 and M2FN-VSRC-001, and a read-only re-check). Code: admin/members_controller.rb:2-24 (search_user_by_params, then fetch_email / fetch_only_number / Admin::Log.fetch_last_image_update per row).',
    decision: 'Fix or expected behaviour.',
    kind: 'Possible defect — confirm',
    apis: ['FN-VCM-045', 'FN-VCM-010'],
  },
  {
    id: 'M2FNQ-57',
    topic: 'Blank CMS name answers 500, not 422',
    question:
      'POST /admin/update_profile with first_name "" answered 500 (generic error) instead of the PII validation 422 {status:false, message:"Unable to save or retrieve this information. Please try again.", is_backend_error:true} the code suggests (fields.rb:16, application_controller.rb:9-14). Which answer is intended, and is the profile left unchanged?',
    why: 'A clear validation error tells the CMS user what went wrong; a 500 hides it.',
    evidence:
      'Seen on staging 2026-11-11 (run of M2FN-VCMW-003); the saved name was restored and verified afterwards.',
    decision: 'Expected status and body.',
    kind: 'Possible defect — confirm',
    apis: ['FN-VCM-043'],
  },
];

export const OPEN = new Set(QUESTIONS.filter((q) => !q.answer).map((q) => q.id));
const WAITING_KIND: QuestionKind = 'Waiting for Dev (environment change)';
const WAITING = new Set(QUESTIONS.filter((q) => q.kind === WAITING_KIND).map((q) => q.id));
const CONTRACT = new Set(
  QUESTIONS.filter((q) => q.kind !== 'Access / environment' && q.kind !== WAITING_KIND).map((q) => q.id),
);

/**
 * One status rule (same as Milestone 2): open contract question → NEED DEV CLARIFICATION; open access question →
 * BLOCKED; only open "waiting" questions → WAITING; nothing open → NOT RUN.
 */
export function statusFromDeps(deps: string[]): 'NEED DEV CLARIFICATION' | 'BLOCKED' | 'WAITING' | 'NOT RUN' {
  const open = deps.filter((d) => OPEN.has(d));
  if (open.some((d) => CONTRACT.has(d))) return 'NEED DEV CLARIFICATION';
  if (open.some((d) => !WAITING.has(d))) return 'BLOCKED';
  return open.length ? 'WAITING' : 'NOT RUN';
}

/** Possible findings a runnable case records (not asserted until Dev decides). */
export const KNOWN_FINDINGS: Record<string, { question: string; text: string }> = {
  'M2FN-VCMW-002': {
    question: 'M2FNQ-36',
    text: 'a CMS rename keeps the double inner space in Postgres while PII collapses it (Postgres and PII differ)',
  },
  'M2FN-VSRC-001': {
    question: 'M2FNQ-36',
    text: 'the CMS member search matches the Postgres form of the name, not the PII form',
  },
  'M2FN-VSRC-002': {
    question: 'M2FNQ-36',
    text: 'the CMS profile search matches the Postgres form of the name, not the PII form',
  },
  'M2FN-VOWN-002': {
    question: 'M2FNQ-40',
    text: 'fetch_login_response fails (undefined create_login_response_v1, from code)',
  },
  'M2FN-VHID-003': {
    question: 'M2FNQ-38',
    text: 'chat history shows a hidden sender’s full name (vernac)',
  },
  'M2FN-VOWN-004': {
    question: 'M2FNQ-46',
    text: 'a member without a PII name is shown with the Postgres name (fallback; Aisle shows null)',
  },
  'M2FN-VRDK-003': {
    question: 'M2FNQ-05',
    text: 'a permitted vernac CMS admin can read a member’s decrypted first name through the Redis key API',
  },
  'M2FN-PRF-005': {
    question: 'M2FNQ-13',
    text: 'a user without a PII name is shown with a null name although the Aisle DB has one',
  },
  'M2FN-OWN-003': {
    question: 'M2FNQ-13',
    text: 'a user without a PII name gets a null own name although the Aisle DB has one',
  },
  'M2FN-FUL-002': {
    question: 'M2FNQ-15',
    text: 'the share-link preview shows a hidden sharer’s full name',
  },
  'M2FN-FUL-003': {
    question: 'M2FNQ-13',
    text: 'the share link fails for a sharer without a PII name (gsub with nil, from code)',
  },
  'M2FN-FUL-004': {
    question: 'M2FNQ-15',
    text: 'chat history sender_name shows a hidden sender’s full name',
  },
  'M2FN-LST-005': {
    question: 'M2FNQ-14',
    text: 'a 1-letter cached name is shown as an initial for a user who is not hidden',
  },
  'M2FN-RST-001': {
    question: 'M2FNQ-12',
    text: 'reset_profile leaves the new account without a PII first name (name null everywhere)',
  },
  'M2FN-SRC-002': {
    question: 'M2FNQ-18',
    text: 'the CMS member-list search matches the Aisle-DB name, not the PII name',
  },
  'M2FN-CMS-007': {
    question: 'M2FNQ-19',
    text: 'the CMS likes activity filter fails (get_first_name on a UserLike row, from code)',
  },
  'M2FN-CMS-008': {
    question: 'M2FNQ-20',
    text: 'the CMS sparks activity filter shows the Aisle-DB name, not the PII name',
  },
  'M2FN-CHT-002': {
    question: 'M2FNQ-11',
    text: 'the chat list keeps the old name after a name edit',
  },
  'M2FN-CHT-004': {
    question: 'M2FNQ-11',
    text: 'the chat list keeps the old name form after a hide toggle',
  },
  'M2FN-HID-003': {
    question: 'M2FNQ-11',
    text: 'the chat list keeps the hidden form after unhide',
  },
  'M2FN-WRT-005': {
    question: 'M2FNQ-25',
    text: 'with the write gate off the user keeps seeing the old PII name',
  },
  'M2FN-RDK-011': {
    question: 'M2FNQ-05',
    text: 'a permitted CMS admin can read any Redis value (incl. other users’ decrypted first names) and delete any key',
  },
};
