/**
 * Milestone 2 API inventory — parsed from Dev's reference m2/docs/aisle-pii-affected-apis.md
 * (branch saurabh/pii-changes @ ae838f4, prepared 16-Oct-2026). Nothing here is invented: method, path, PII fields,
 * access path, auth and notes all come from that file. This module only adds QA's grouping (which test strategy
 * applies) and staging observations, each labelled as such.
 *
 * Free text (encrypted long text: chat messages, bio) comes from the supplement m2/docs/free-text-apis.md
 * (Dev list, 2026-10-23): it adds the FREE_TEXT field to existing entries and adds the facade routes it lists.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type PiiField = 'NAME' | 'EMAIL' | 'PHONE' | 'FREE_TEXT';
export const FIELD_LABEL: Record<PiiField, string> = {
  NAME: 'First name',
  EMAIL: 'Email',
  PHONE: 'Phone',
  FREE_TEXT: 'Free text',
};
export const PII_FIELDS: PiiField[] = ['NAME', 'EMAIL', 'PHONE', 'FREE_TEXT'];

export const SOURCE_DOC = 'm2/docs/aisle-pii-affected-apis.md';
export const SOURCE_REF = 'Dev inventory (saurabh/pii-changes @ ae838f4, 16-Oct-2026)';
export const SOURCE_FT_DOC = 'm2/docs/free-text-apis.md';
export const SOURCE_FT_REF = 'Dev free-text API list (2026-10-23)';

export interface InventoryApi {
  id: string;
  method: string;
  path: string;
  fields: PiiField[];
  /** PII access path per field, verbatim from the Dev doc. */
  access: Partial<Record<PiiField, string>>;
  /** Credentials the Dev cURL example uses. */
  auth: string[];
  /** Prose notes beside the cURL example, verbatim. */
  notes: string;
  /** Request keys in the Dev cURL example (body JSON keys and query parameters). */
  requestKeys: string[];
  /** Header names the Dev cURL example sends (e.g. Authorization, Accept, device_type, webcms), verbatim. */
  headers: string[];
  /** Dev's example request(s), verbatim (cURL code blocks). */
  curl: string[];
  /** Where the route lives in the app code (the Dev doc's "Source:" line), verbatim. */
  source: string;
}

/** QA test-strategy groups. Every inventory entry belongs to exactly one (checked in assertComplete). */
export interface ApiGroup {
  key: string;
  name: string;
  strategy: string;
  ids: string[];
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `API-${String(from + i).padStart(3, '0')}`);
const ids = (...n: (number | [number, number])[]) =>
  n.flatMap((x) => (Array.isArray(x) ? range(x[0], x[1]) : range(x, x)));

export const GROUPS: ApiGroup[] = [
  {
    key: 'G1',
    name: 'PII integration routes (TEST_TOKEN)',
    strategy:
      'Direct first-name read/write/batch routes on the app. Full functional + validation coverage; runnable now with the existing test token.',
    ids: ids(1, 2, 3, 190, 208),
  },
  {
    key: 'G2',
    name: 'PII writes & account lifecycle',
    strategy:
      'Onboarding, profile edit, phone login, hide-name, delete and reset — the app paths that WRITE PII. Deepest coverage: functional, negative, DB, cross-field, failure handling.',
    ids: ids(32, 57, 58, 59, 60, 61, 62, 129, 130, 131, 196, 197, 198),
  },
  {
    key: 'G3',
    name: 'Single-profile reads',
    strategy:
      'Own and other-user profile responses. Migrated / unmigrated / hidden-name / read-gate states and owner-only exposure of email and phone.',
    ids: ids(11, 12, 13, 16, 17, 18, 21, 86, 87, 88, 119, 120, 186),
  },
  {
    key: 'G4',
    name: 'Multi-profile lists (batch name hydration)',
    strategy:
      'Lists that hydrate many names at once (hydrate_first_names!). Correct name per profile, mixed migration states, hidden names, cache behaviour, no email/phone leakage.',
    ids: ids(5, 6, 7, 8, 14, 15, 19, 20, 47, 48, 49, 54, 63, 68, 69, 101, 106, 107, 116, 126, 191),
  },
  {
    key: 'G5',
    name: 'Interactions, chat, notifications & live audio',
    strategy:
      'Like / invite / accept / pass / report / connect / message / call / live-audio actions that read a name for the response, push or room. Representative deep checks + regression smoke.',
    ids: ids(
      [50, 53],
      55,
      56,
      4,
      9,
      10,
      46,
      64,
      65,
      66,
      67,
      98,
      103,
      [108, 112],
      117,
      118,
      125,
      127,
      128,
      132,
      135,
      187,
      188,
    ),
  },
  {
    key: 'G6',
    name: 'Own-profile updates (serializer / cache side effects)',
    strategy:
      'Non-PII profile updates that rebuild the profile response or cache (own_detailed_v1, fill_cache!, sync_profile_to_kafka). One deep check, then a parametrised regression smoke.',
    ids: ids([22, 31], [33, 45], 85, 89, 90, 91, 97, 99, 100, 105, 121, 122, 123, 124, 134),
  },
  {
    key: 'G7',
    name: 'Payment requests (PII sent to gateways / SMS)',
    strategy:
      'Requests that build provider customer payloads from PII (Cashfree, PayU, PhonePe, payment link, QR, SMS). Sandbox-only; correct values, no over-sharing.',
    ids: ids(73, 74, 76, 77, 78, 79, 83, 84, 104, 189, 193, 194),
  },
  {
    key: 'G8',
    name: 'Payment verification & subscription (cache rebuild)',
    strategy:
      'Successful payment / restore / freebie flows that rebuild the profile cache. Regression only: activation still works and the rebuilt profile keeps the right name.',
    ids: ids(70, 71, 72, 75, 92, 93, 96, 102, 115, 133, 195),
  },
  {
    key: 'G9',
    name: 'Provider callbacks & webhooks (no user auth)',
    strategy:
      'PhonePe / Google Play / Apple / Pusher callbacks. Need genuine signed sandbox payloads — Dev-assisted. QA checks invalid signatures are refused without PII in the reply.',
    ids: ids(80, 81, 82, 94, 95, 113, 114),
  },
  {
    key: 'G10',
    name: 'CMS / admin',
    strategy:
      'Admin profile views, edits, search, curation, reviews, member activity, exports and the ActiveAdmin IRL page. Admin auth + permission checks; correct name/email/phone per profile.',
    ids: ids([136, 185], 192, 209),
  },
  {
    key: 'M1',
    name: 'PII facade proxy (covered by Milestone 1)',
    strategy:
      'The /V1/api/v1/pii-test/* proxy routes (incl. readiness and free-text keys). Already covered by the 109 Milestone 1 cases; not duplicated in M2.',
    ids: ids([199, 207], [210, 212]),
  },
];

export const groupOf = (apiId: string) => GROUPS.find((g) => g.ids.includes(apiId))!;

/** Behaviour observed by QA on staging (testa2) — evidence for the M2-PIIR expected results. */
export const OBSERVED: Record<string, string> = {
  'API-001':
    'Observed 2026-10-19: unknown synthetic user_id → 200 {status, user_id, first_name:null}; no user_id → 400 "Missing required parameter: user_id"; no token → 401 (empty HTML body).',
  'API-003':
    'Observed 2026-10-19: unknown ref → 200 {status, requested_ref_count, returned_ref_count, profiles:{<ref>:null}}; empty refs → 400.',
  'API-190':
    'Observed 2026-10-19: unknown user_ids → 200 {status, requested_user_count, returned_user_count, first_names:{}}; empty user_ids → 400.',
  'API-208':
    'Observed 2026-10-19: route IS implemented on staging (contradicts the Dev doc) — {} → 400 "Missing required parameter: user_id or ref"; unknown ref → 404 "Profile not found".',
  'API-187': 'Observed 2026-10-23: no token → 401 {unauthorized_request}.',
  'API-063':
    'Observed 2026-10-23: no token → 401 {unauthorized_request}; a freshly onboarded synthetic account (male set) → 200 before and >60 s after submit.',
  'API-069': 'Observed 2026-10-23: no token → 401 {unauthorized_request}.',
  'API-121': 'Observed 2026-10-23: no token → 401 (empty text/html body).',
  'API-119': 'Observed 2026-10-23: no token → 401 (empty text/html body).',
  'API-060':
    'Observed 2026-10-23 (3 throwaway 107… accounts): OTP request POST /V1/sessions/login_with_phone_number {mobile_number} with Accept, Content-Type, device_type, app_version, unique_identifier → 200 {status, message, phone_code:"+91", mobile_number, zendesk_url, your_story_form_url}; phone_code_id and signature_v1 are not required (defaults to +91); an empty body {} → 500 {title, message:"Something went wrong…", is_backend_error} (server error on bad input). verify_number_login_v1 {mobile_number, otp:"1234"} (no phone_code_id) → 200 with id, auth_token, first_name, profile_state:null, application_stage:"general_information_stage_1", show_update_app. auth_token is an RS256 JWT (~168 h; claims iss, sub, aud, iat, exp, uid, did, ptfrm, phone_id) bound to the device: send the same unique_identifier and device_type as at login, as Authorization: Bearer. app_version 10.0.0 and 99.99.99 both accepted (show_update_app:true does not block). Later 2026-10-23 (UI automation team flow): OTP request {mobile_number, phone_code_id:242, device_type, app_version, unique_identifier, signature_v1} and verify {phone_code_id:242, mobile_number, otp:"1234"} → auth_token, id, ref, application_stage, profile_state (top level or under data); errors "The entered OTP is invalid." / "No OTP has been generated for this user or number." — refused verifies (wrong OTP, too-short number, letters, empty number) answer HTTP 200 with the error and NO token.',
  'API-013':
    'Observed 2026-10-19: no token → 401 {unauthorized_request:true}. Observed 2026-10-23: a NEW (onboarding-stage) user’s valid token → 401 {unauthorized_request} — a 401 here is not proof of a credential problem; an ONBOARDED user’s token → 200 {user_id, first_name, profile_state, gender, hide_first_name, …} (no email), before and >60 s after submit with the male photo set.',
  'API-059':
    'Observed 2026-10-23: a NEW (onboarding-stage) user’s valid token → 401; account deletion works only after onboarding. For an onboarded account: {id:<ref>} alone → 500; {id:<ref>, reason_id:1, note} → 200, the old token is dead afterwards and a new login starts at application_stage general_information_stage_1 (no profile). A "disabled" profile cannot be recovered (activate_user 403, delete has no effect). Confirmed again for a male-set account: delete → 200 and the number is reset.',
  'API-062':
    'Observed 2026-10-23: POST /V1/sessions/fetch_login_response {user_id, is_new_user:false} with NO credential → 200 with auth_token, first_name, gender, profile_state … for that user (also for another synthetic account’s id — possible defect M2Q-42); unknown user_id → 500.',
  'API-086':
    'Observed 2026-10-23: GET /V1/user/verify_user_v1 with a NEW (onboarding-stage) user’s token → 200; also 200 for a freshly onboarded account (male set) before and >60 s after submit.',
  'API-088':
    'Observed 2026-10-23: GET /V1/user/verify_user with a NEW (onboarding-stage) user’s token → 200 incl. application_stage, application_stage_v2 (list of stages), selfie_compression_size.',
  'API-057':
    'Observed 2026-10-23: POST /V1/user/submit_profile with {} or {data:{}} (new user) → 406 {status, message:"Please submit valid details…", your_story_form_url, is_backend_error, is_spark_enabled}. With the UI automation team’s body (option ids, 4 Aisle-CDN photos) → 200, profile_state "pending_not_verified", the submitted first_name returned; after POST /V1/account_journey/update_community_message_agreed a new verify shows application_stage "completed". ~35 s later profile_state became "image_inappropriate" with gender-mixed photo sets; with the gender-matched MALE set the profile stayed "pending_not_verified" >60 s (photos must match the declared gender; submit_profile copies each photo URL and stores a 54-byte placeholder if it cannot fetch it, still answering 200).',
  'API-021':
    'Observed 2026-10-23: for a synthetic account onboarded with the gender-matched male photo set, GET /V1/users/:ref → 200 before and >60 s after submit (old and fresh token).',
  'API-014':
    'Observed 2026-10-23: GET /V1/users/matches_list_v2 → 200 for a freshly onboarded synthetic account (male set), before and >60 s after submit.',
  'API-005':
    'Observed 2026-10-23: GET /V1/invites/all_requests → 200 for a freshly onboarded synthetic account (male set), before and >60 s after submit.',
  'API-089':
    'Observed 2026-10-23: POST /V1/user/app_launch {} with a NEW (onboarding-stage) user’s token → 200.',
};

/**
 * The same no-credential observations as OBSERVED, in a form tests can assert exactly (M2 AUTH checks, the
 * "no credential" variant). Only APIs whose refusal was actually seen on staging are listed.
 */
export const OBSERVED_NO_CREDENTIAL: Record<
  string,
  { status: number; body: 'unauthorized_request' | 'empty'; on: string }
> = {
  'API-001': { status: 401, body: 'empty', on: '2026-10-19' },
  'API-013': { status: 401, body: 'unauthorized_request', on: '2026-10-19' },
  'API-063': { status: 401, body: 'unauthorized_request', on: '2026-10-23' },
  'API-069': { status: 401, body: 'unauthorized_request', on: '2026-10-23' },
  'API-187': { status: 401, body: 'unauthorized_request', on: '2026-10-23' },
  'API-119': { status: 401, body: 'empty', on: '2026-10-23' },
  'API-121': { status: 401, body: 'empty', on: '2026-10-23' },
};

/** Adds the free-text supplement: FREE_TEXT on mapped entries, new entries for unmapped rows. */
function addFreeText(root: string, apis: Map<string, InventoryApi>) {
  const lines = readFileSync(path.join(root, SOURCE_FT_DOC), 'utf8').split('\n');
  for (const line of lines) {
    const cells = line.split('|').map((c) => c.trim());
    const [, id, method, url, keysCell, mapsTo, notes] = cells;
    if (!id || !/^(API|FT)-\d+$/.test(id) || !method || !url) continue;
    const apiPath = new URL(url.replace(/`/g, '')).pathname;
    const keys = keysCell && !keysCell.startsWith('—') ? keysCell.split(',').map((k) => k.trim()) : [];
    const access = keys.length
      ? `Free-text encryption (${SOURCE_FT_REF}): encrypts ${keys.join(', ')} — ${notes}`
      : `Free-text encryption (${SOURCE_FT_REF}): ${notes}`;
    if (mapsTo && mapsTo !== '—') {
      const api = apis.get(mapsTo);
      if (!api || api.method !== method || api.path !== apiPath)
        throw new Error(`${SOURCE_FT_DOC}: ${id} maps to ${mapsTo}, but that is not ${method} ${apiPath}`);
      if (!api.fields.includes('FREE_TEXT')) api.fields.push('FREE_TEXT');
      api.access.FREE_TEXT = access;
      api.requestKeys = [...new Set([...api.requestKeys, ...keys])];
    } else {
      apis.set(id, {
        id,
        method,
        path: apiPath,
        fields: /free-text/.test(apiPath) ? ['FREE_TEXT'] : [],
        access: { FREE_TEXT: access },
        auth: ['TEST_TOKEN'],
        notes: notes ?? '',
        requestKeys: /keys\/read/.test(apiPath) ? ['key_id'] : [],
        headers: [],
        curl: [],
        source: 'Aisle PII facade (Milestone 1) — see m1/docs/aisle-api.md',
      });
    }
  }
}

export function parseInventory(root: string): InventoryApi[] {
  const lines = readFileSync(path.join(root, SOURCE_DOC), 'utf8').split('\n');
  const apis = new Map<string, InventoryApi>();
  let section: PiiField | null = null;
  for (const line of lines) {
    if (line.startsWith('### First name APIs')) section = 'NAME';
    else if (line.startsWith('### Email APIs')) section = 'EMAIL';
    else if (line.startsWith('### Phone number APIs')) section = 'PHONE';
    else if (line.startsWith('## ')) section = null;
    const m = section && line.match(/^\| \[(API-\d+)\]\(#api-\d+\) \| (\w+) \| `([^`]+)` \| (.*) \|$/);
    if (!m || !section) continue;
    const [, id, method, apiPath, access] = m as unknown as [string, string, string, string, string];
    const api = apis.get(id) ?? {
      id,
      method,
      path: apiPath,
      fields: [],
      access: {},
      auth: [],
      notes: '',
      requestKeys: [],
      headers: [],
      curl: [],
      source: '',
    };
    api.fields.push(section);
    api.access[section] = access;
    apis.set(id, api);
  }

  // cURL sections: "#### API-xxx" up to the next heading.
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    const api = current ? apis.get(current) : undefined;
    if (api && buf.length) {
      const text = buf.join('\n');
      const tokens = text.matchAll(
        /\$\{?(USER_TOKEN|WEB_TOKEN|TEST_TOKEN|ADMIN_TOKEN|INFOEDGE_PROFILE_API_TOKEN|ADMIN_SESSION_COOKIE)/g,
      );
      api.auth = [...new Set([...tokens].map((t) => t[1]!))];
      if (/webcms/.test(text)) api.auth.push('webcms');
      let inCode = false;
      const prose: string[] = [];
      for (const l of buf) {
        if (l.startsWith('```')) inCode = !inCode;
        else if (!inCode && l.trim() && !l.startsWith('`') && !l.startsWith('Source:') && !l.startsWith('#'))
          prose.push(l.trim());
      }
      // Only prose that belongs to this endpoint (the doc's trailing sections start with "Shared requests"/lists).
      const stop = prose.findIndex((p) =>
        /^(Shared requests|- |\| |\d+\. |These changed|This unchanged|For the)/.test(p),
      );
      api.notes = (stop < 0 ? prose : prose.slice(0, stop)).join(' ');
      const keys = [
        ...[...text.matchAll(/^\s*"([a-zA-Z_0-9]+)":/gm)].map((k) => k[1]!),
        ...[...text.matchAll(/data-urlencode "([a-zA-Z_0-9[\]]+)=/g)].map((k) => k[1]!),
      ];
      api.requestKeys = [...new Set(keys)];
      api.headers = [...new Set([...text.matchAll(/--header "([A-Za-z0-9_-]+):/g)].map((h) => h[1]!))];
      const blocks = text.split('```').filter((_, i) => i % 2 === 1);
      api.curl = blocks.map((b) => b.replace(/^[a-z]*\n/, '').trimEnd()).filter((b) => /curl/.test(b));
      api.source = (buf.find((l) => l.startsWith('Source:')) ?? '')
        .replace(/^Source:\s*/, '')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, href: string) =>
          text === 'route' ? href.replace(/^(\.\.\/)+/, '') : text,
        )
        .replace(/\.$/, '');
    }
    buf = [];
  };
  for (const line of lines) {
    const m = line.match(/^#### (API-\d+)/);
    if (m) {
      flush();
      current = m[1]!;
      continue;
    }
    if (/^##{0,2} /.test(line)) {
      flush();
      current = null;
    }
    if (current) buf.push(line);
  }
  flush();
  addFreeText(root, apis);
  const list = [...apis.values()].sort((a, b) => a.id.localeCompare(b.id));
  assertComplete(list);
  return list;
}

/** Every Dev inventory entry must sit in exactly one QA group — fails loudly if Dev adds an API. */
function assertComplete(list: InventoryApi[]) {
  const problems: string[] = [];
  for (const api of list) {
    const n = GROUPS.filter((g) => g.ids.includes(api.id)).length;
    if (n !== 1) problems.push(`${api.id} is in ${n} groups`);
  }
  for (const g of GROUPS)
    for (const id of g.ids) if (!list.some((a) => a.id === id)) problems.push(`${g.key} lists unknown ${id}`);
  if (problems.length) throw new Error(`M2 inventory grouping is out of date:\n  ${problems.join('\n  ')}`);
}

const AUTH_LABEL: Record<string, string> = {
  USER_TOKEN: 'User JWT (app)',
  WEB_TOKEN: 'Web JWT',
  TEST_TOKEN: 'TEST_TOKEN (Bearer)',
  ADMIN_TOKEN: 'CMS admin JWT',
  webcms: 'webcms + admin OTP',
  ADMIN_SESSION_COOKIE: 'Admin browser session cookie',
  INFOEDGE_PROFILE_API_TOKEN: 'INFOEDGE_PROFILE_API_TOKEN',
};
export const authLabel = (api: InventoryApi) =>
  api.auth.length ? api.auth.map((a) => AUTH_LABEL[a] ?? a).join(' + ') : 'None (provider/webhook)';

/** The controller action is the first step of every Dev access path. */
export const actionOf = (api: InventoryApi) => {
  const first = Object.values(api.access)[0] ?? '';
  return first.includes(' → ') ? first.split(' → ')[0]!.trim() : api.path.split('/').pop()!;
};

export function operationOf(api: InventoryApi): string {
  const g = groupOf(api.id).key;
  const access = Object.values(api.access).join(' ');
  if (g === 'M1') return 'PII proxy (M1)';
  if (g === 'G9') return 'Callback / webhook';
  if (g === 'G7') return 'Outbound payload (reads PII)';
  if (g === 'G8') return 'Payment verify → cache rebuild';
  if (/delete/.test(api.path)) return 'Delete account (reads PII for cleanup)';
  if (/toggle_hide_name/.test(api.path)) return 'Update (hide/unhide name)';
  if (/search/.test(api.path)) return 'Search';
  if (
    /write_first_name|assign_first_name|add_email|write_pii_phone|submit_profile|edit_profile|reset_profile/.test(
      access,
    )
  )
    return 'Write / update PII';
  if (/batch|first_names|hydrate_first_names|get_first_names_for_users/.test(access)) return 'Batch read';
  if (g === 'G10') return api.method === 'GET' ? 'Read (admin)' : 'Admin action';
  if (api.method === 'GET') return 'Read';
  if (g === 'G6') return 'Update (non-PII) → profile response';
  if (g === 'G5') return 'Action → reads name';
  if (/sessions\/(verify_number_login|fetch_login_response)/.test(api.path))
    return 'Login (reads/writes PII)';
  if (api.id === 'API-208') return 'Read (name source diagnostic)';
  return ['G3', 'G4'].includes(g) ? 'Read (POST)' : 'Other';
}

export function scopeOf(api: InventoryApi): string {
  if (api.id === 'API-208') return 'Candidate — doc says broken, staging implements it (M2Q-01)';
  if (api.id === 'API-192') return 'Confirmed — ActiveAdmin HTML page (manual)';
  if (groupOf(api.id).key === 'M1') return 'Confirmed — covered by Milestone 1';
  const conditional = Object.values(api.access).some((a) =>
    /sync_profile_to_kafka|fill_cache!|send_for_aws_moderation|activate_any_subscription|Worker|callbacks/.test(
      a,
    ),
  );
  return conditional ? 'Confirmed — conditional reachability' : 'Confirmed';
}
