/**
 * Milestone 2 API inventory — parsed from Dev's reference m2/docs/aisle-pii-affected-apis.md
 * (branch saurabh/pii-changes @ ae838f4, prepared 16-Oct-2026). Nothing here is invented: method, path, PII fields,
 * access path, auth and notes all come from that file. This module only adds QA's grouping (which test strategy
 * applies) and staging observations, each labelled as such.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type PiiField = 'NAME' | 'EMAIL' | 'PHONE';
export const FIELD_LABEL: Record<PiiField, string> = { NAME: 'First name', EMAIL: 'Email', PHONE: 'Phone' };

export const SOURCE_DOC = 'm2/docs/aisle-pii-affected-apis.md';
export const SOURCE_REF = 'Dev inventory (saurabh/pii-changes @ ae838f4, 16-Oct-2026)';

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
      'The /V1/api/v1/pii-test/* proxy routes. Already covered by the 109 Milestone 1 cases; not duplicated in M2.',
    ids: ids([199, 207]),
  },
];

export const groupOf = (apiId: string) => GROUPS.find((g) => g.ids.includes(apiId))!;

/** Behaviour observed by QA on staging (testa2) — evidence for the M2-PIIR expected results. */
export const OBSERVED: Record<string, string> = {
  'API-001':
    'Observed 2026-10-19: unknown synthetic user_id → 200 {status, user_id, first_name:null}; no user_id → 400 "Missing required parameter: user_id"; no token → 401 (empty HTML body).',
  'API-003':
    'Observed 2026-10-19: unknown ref → 200 {status, requested_ref_count, returned_ref_count, profiles:{<ref>:null}}; empty refs → 400.',
  'API-013': 'Observed 2026-10-19: no token → 401 {unauthorized_request:true}.',
  'API-190':
    'Observed 2026-10-19: unknown user_ids → 200 {status, requested_user_count, returned_user_count, first_names:{}}; empty user_ids → 400.',
  'API-208':
    'Observed 2026-10-19: route IS implemented on staging (contradicts the Dev doc) — {} → 400 "Missing required parameter: user_id or ref"; unknown ref → 404 "Profile not found".',
};

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
  return first.split(' → ')[0]!.trim();
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
