/**
 * Milestone 2 per-API baseline — the standard checks every inventory API gets, generated per API so each check has
 * its own traceable case ID (M2-API-021-AUTH). Applicability is decided per API from the Dev inventory (method,
 * auth, request keys, fields, access path, notes); a non-applicable check is recorded with its reason, and a check
 * already covered exactly by a scenario case (m2-test-cases.data.ts) points to that case instead of duplicating it.
 *
 * Expected results follow the same evidence rule as the scenario cases: Dev doc, staging observation, or
 * "same as master" for non-regression checks (needs the baseline, M2Q-24). Unknowns cite an M2Q question.
 */
import { authLabel, FIELD_LABEL, groupOf, OBSERVED, type InventoryApi, type PiiField } from './m2-inventory';
import {
  IDOR_OTHER_TARGET,
  NO_OTHER_USER,
  OWN_PROFILE_BY_REF,
  ROUTE_STATE,
  suiteStateFor,
} from './m2-code-evidence';
import { placeholdersIn } from '../src/checks/request-builder';
import { hasIdorTarget } from '../src/checks/verdicts';
import { DB_ON_HOLD, READ_GATES_ON, statusFromDeps } from './m2-questions';
import type { Category } from './m2-grouping';
import type { Automation, M2Case, Mode, Priority, Status } from './m2-test-cases.data';

export interface Check {
  code: string;
  title: string;
  category: Category;
}

export const CHECKS: Check[] = [
  { code: 'POS', title: 'Valid request succeeds with correct PII', category: 'Functional' },
  { code: 'CONTRACT', title: 'Response contract unchanged', category: 'Response contract' },
  { code: 'AUTH', title: 'Missing / invalid credential refused', category: 'Authentication' },
  { code: 'TOKEN', title: 'Wrong credential type refused', category: 'Authentication' },
  { code: 'PARAM', title: 'Missing / invalid parameters', category: 'Validation' },
  { code: 'BODY', title: 'Malformed body / wrong data types', category: 'Validation' },
  { code: 'IDOR', title: 'Cannot act on / read another user', category: 'Access control' },
  { code: 'EXPOSE', title: 'No unintended PII exposure', category: 'PII exposure' },
  { code: 'HIDDEN', title: 'Hidden first name respected', category: 'Hidden name' },
  {
    code: 'GATE',
    title: 'Read gate off: same value read back (gate on: waiting)',
    category: 'Integration & consistency',
  },
  { code: 'PIIDOWN', title: 'PII service down / slow', category: 'Resilience' },
  { code: 'CACHE', title: 'PII change reflected in later reads', category: 'Integration & consistency' },
  { code: 'STATE', title: 'Wrong account / record state', category: 'State & idempotency' },
  { code: 'REPEAT', title: 'Repeated / double request', category: 'State & idempotency' },
  { code: 'FIELD', title: 'PII input validation & normalisation', category: 'Validation' },
  { code: 'DB-SAVE', title: 'DB: persisted correctly, no duplicates', category: 'DB persistence' },
  { code: 'DB-REFUSE', title: 'DB: refused request writes nothing', category: 'DB persistence' },
  { code: 'DB-ISOL', title: 'DB: other fields and users untouched', category: 'DB persistence' },
];

export type Cell =
  { kind: 'case'; id: string } | { kind: 'covered'; by: string } | { kind: 'na'; reason: string };

// ---- API facts --------------------------------------------------------------------------------------------
/** APIs that accept PII as input, and which fields (Dev doc request bodies + access paths). */
export const PII_INPUT: Record<string, PiiField[]> = {
  'API-002': ['NAME'],
  'API-057': ['NAME', 'EMAIL'],
  'API-061': ['NAME', 'EMAIL'],
  'API-129': ['NAME', 'EMAIL'],
  'API-058': ['NAME'],
  'API-130': ['NAME'],
  'API-060': ['PHONE'],
  'API-139': ['NAME', 'PHONE'],
  'API-140': ['NAME', 'PHONE'],
  'API-149': ['NAME'],
  'API-151': ['NAME'],
  'API-153': ['NAME'],
  'API-154': ['NAME'],
  'API-180': ['NAME'],
  'API-209': ['NAME'],
  // Free text (Dev free-text list, 2026-10-23)
  'API-187': ['FREE_TEXT'],
  'API-121': ['FREE_TEXT'],
};
/** Pre-login phone/OTP routes: no credential by design; identity = approved number + OTP. */
const LOGIN = ['API-060', 'API-062'];
const DELETES = ['API-059', 'API-131', 'API-196', 'API-197'];
const RESET = 'API-198';
/** Responses that contain other members' data (profiles, lists, rooms, admin views). */
const OTHERS_EXTRA = [
  'API-012',
  'API-016',
  'API-017',
  'API-018',
  'API-019',
  'API-020',
  'API-021',
  'API-119',
  'API-120',
  'API-191',
];

/** Scenario cases that already cover exactly this API + check (avoid duplicates). */
const COVERED_BY: Record<string, Record<string, string>> = {
  POS: {
    'API-001': 'M2-PIIR-001',
    'API-002': 'M2-PIIR-001',
    'API-190': 'M2-PIIR-007',
    'API-003': 'M2-PIIR-009',
    'API-208': 'M2-PIIR-010',
  },
  PARAM: {
    'API-001': 'M2-PIIR-004',
    'API-002': 'M2-PIIR-004',
    'API-003': 'M2-PIIR-004',
    'API-190': 'M2-PIIR-004',
    'API-208': 'M2-PIIR-004',
  },
  BODY: { 'API-002': 'M2-PIIR-005', 'API-003': 'M2-PIIR-008', 'API-190': 'M2-PIIR-008' },
  REPEAT: { 'API-002': 'M2-PIIR-002' },
  FIELD: {
    'API-002': 'M2-PIIR-005, M2-PIIR-006',
    'API-057': 'M2-FNAME-007, M2-EMAIL-004',
    'API-058': 'M2-FNAME-007, M2-FNAME-008',
    'API-060': 'M2-PHONE-005',
    'API-187': 'M2-FT-005, M2-FT-006',
    'API-121': 'M2-FT-005, M2-FT-006',
  },
  'DB-SAVE': {
    'API-060': 'M2-DB-001',
    'API-057': 'M2-DB-002',
    'API-061': 'M2-DB-002',
    'API-129': 'M2-DB-002',
    'API-058': 'M2-DB-003',
    'API-130': 'M2-DB-003',
    'API-002': 'M2-DB-003',
    'API-139': 'M2-DB-008',
    'API-140': 'M2-DB-008',
    'API-198': 'M2-DB-009',
    'API-059': 'M2-DB-010',
    'API-131': 'M2-DB-010',
    'API-196': 'M2-DB-010',
    'API-197': 'M2-DB-010',
    'API-187': 'M2-DB-015',
    'API-121': 'M2-DB-016',
  },
  'DB-REFUSE': {
    'API-002': 'M2-DB-006',
    'API-057': 'M2-DB-006',
    'API-058': 'M2-DB-006',
    'API-139': 'M2-DB-006',
    'API-149': 'M2-DB-006',
  },
  'DB-ISOL': { 'API-057': 'M2-DB-007', 'API-058': 'M2-DB-007' },
  CACHE: { 'API-001': 'M2-PIIR-002' },
};

const g = (a: InventoryApi) => groupOf(a.id).key;
const isTestRoute = (a: InventoryApi) => g(a) === 'G1';
const usesTestToken = (a: InventoryApi) => a.auth.includes('TEST_TOKEN');
const isLogin = (a: InventoryApi) => LOGIN.includes(a.id);
const isWebhook = (a: InventoryApi) => g(a) === 'G9';
const isAdmin = (a: InventoryApi) => g(a) === 'G10';
const isPayment = (a: InventoryApi) => ['G7', 'G8'].includes(g(a));
const isRead = (a: InventoryApi) => ['G3', 'G4'].includes(g(a)) || (isAdmin(a) && a.method === 'GET');
export const returnsOthers = (a: InventoryApi) =>
  ['G4', 'G5', 'G10'].includes(g(a)) ||
  OTHERS_EXTRA.includes(a.id) ||
  a.id === 'API-113' ||
  a.id === 'API-114';
const hasParams = (a: InventoryApi) => a.requestKeys.length > 0 || /:ref|:user_id/.test(a.path);
const writesPii = (a: InventoryApi) => a.id in PII_INPUT || DELETES.includes(a.id) || a.id === RESET;
const fields = (f: PiiField[]) => f.map((x) => FIELD_LABEL[x]).join(', ');
const req = (a: InventoryApi) => `${a.method} ${a.path}`;
const keys = (a: InventoryApi) =>
  a.requestKeys.length
    ? a.requestKeys.slice(0, 14).join(', ') + (a.requestKeys.length > 14 ? ', …' : '')
    : 'none';

/** Paging keys every V1 / web controller defaults (standardize_params). */
const PAGED = ['page', 'items_per_page'];
/**
 * Documented defaulting of paging keys (from code, develop_new 944f76a — confirm with Dev): V1::ApiController and
 * Web::ApiController#standardize_params turn a missing or non-positive page (a non-numeric value → to_i 0) into
 * DEFAULT_PAGE and a missing items_per_page into DEFAULT_ITEMS_PER_PAGE (v1/api_controller.rb:103-113,
 * web/api_controller.rb:29-39). A non-numeric items_per_page becomes 0 — not a default, so not accepted.
 */
function pagedNote(a: InventoryApi, variant: 'without' | 'wrong type'): string {
  const keys = PAGED.filter((k) => a.requestKeys.includes(k) && (variant === 'without' || k === 'page'));
  if (!keys.length) return '';
  const what = variant === 'without' ? `Without ${keys.join(' / ')}` : 'With a non-numeric page';
  return ` ${what} the request is defaulted (from code: standardize_params sets the default page / items per page — confirm with Dev), so its 2xx is expected and recorded in the approved baseline as acceptedBecause.`;
}

/**
 * User-JWT routes that work for a NEW (onboarding-stage) account — observed on staging 2026-10-23 (login,
 * GET verify_user, GET verify_user_v1, app_launch; fetch_login_response is a pre-login route). Every other user / web route needs a finished profile (M2Q-36).
 */
export const NEW_USER_OK = ['API-060', 'API-062', 'API-086', 'API-088', 'API-089'];

/** Routes that need a true web JWT (ptfrm "web", payment routes only — M2Q-41 answered from code). */
export const isWebRoute = (a: Pick<InventoryApi, 'path' | 'auth'>) => a.auth.includes('WEB_TOKEN');

/** True when calling this API needs a finished (onboarded) profile — M2Q-36. */
export function needsProfile(a: Pick<InventoryApi, 'id' | 'auth'>): boolean {
  if (NEW_USER_OK.includes(a.id)) return false;
  if (a.auth.includes('WEB_TOKEN')) return true; // web routes act on a finished profile (token: M2Q-41)
  if (a.auth.includes('USER_TOKEN')) return true;
  // Admin routes act on a synthetic member profile; TEST_TOKEN routes outside G1 need profiles with likes/invites.
  if (groupOf(a.id).key === 'G10') return true;
  return a.auth.includes('TEST_TOKEN') && groupOf(a.id).key !== 'G1';
}

/**
 * APIs whose valid request needs something only Dev can provide or decide (M2Q-45): EVENT_ID (101, 103),
 * POLL_OPTION_ID (105), ROOM_ID (109–112), RESTAURANT_ID / MEAL_TYPE_ID (023); and actions kept Blocked by the QA lead
 * on 2026-10-24: selfie verification (031, external face check) and moderation reports (098, 135).
 */
export const DEV_ONLY = [
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
];

/** Questions that gate access for an API (credentials / environment). */
function accessDeps(a: InventoryApi): string[] {
  const d = new Set<string>();
  for (const t of a.auth) {
    if (t === 'USER_TOKEN' || t === 'WEB_TOKEN') d.add('M2Q-03');
    if (t === 'ADMIN_TOKEN' || t === 'ADMIN_SESSION_COOKIE' || t === 'webcms') d.add('M2Q-04');
    if (t === 'INFOEDGE_PROFILE_API_TOKEN') d.add('M2Q-19');
  }
  // Callbacks need genuine signed provider / Pusher payloads (M2Q-17); Pusher events also need accounts.
  if (isWebhook(a)) d.add('M2Q-17');
  if (a.id === 'API-113' || a.id === 'API-114') d.add('M2Q-03');
  if (needsProfile(a)) d.add('M2Q-36');
  // Routes whose controller requires an approved / deactivated / image-inappropriate profile (from code,
  // m2-code-evidence.ts ROUTE_STATE). The suite makes approved (auto-approval, waited for at run time) and deactivated
  // (throwaway account) profiles itself; only image_inappropriate still needs M2Q-32. /web/* routes take the normal
  // app user JWT (M2Q-41, answered from code).
  if (ROUTE_STATE[a.id] && suiteStateFor(a.id) === 'image_inappropriate') d.add('M2Q-32');
  // Ids only Dev can provide (event, poll, room, restaurant) and actions QA does not take on its own (selfie
  // verification, moderation reports) — M2Q-45.
  if (DEV_ONLY.includes(a.id)) d.add('M2Q-45');
  if (isPayment(a)) d.add('M2Q-17');
  if (a.id === 'API-012') d.add('M2Q-19');
  if (isLogin(a)) d.add('M2Q-03'); // approved test number + OTP shortcut
  if (usesTestToken(a) && !isTestRoute(a)) d.add('M2Q-03'); // needs synthetic profiles with likes/invites
  if (a.id === 'API-208') d.add('M2Q-01');
  if (isAdmin(a)) d.add('M2Q-03'); // admin routes act on a synthetic member profile
  return [...d];
}

/**
 * DB checks also need the API's own access (CMS admin M2Q-04, finished profile M2Q-36) and, for app users, the
 * app user → PII user_id mapping (M2Q-37). G1 test routes write under QA's own synthetic user_ids.
 */
function dbAccessDeps(a: InventoryApi): string[] {
  return [...accessDeps(a), ...(isTestRoute(a) ? [] : ['M2Q-37'])];
}

function accountPre(a: InventoryApi): string {
  const parts: string[] = [];
  if (a.auth.includes('USER_TOKEN'))
    parts.push(
      'Synthetic app account (+91 number starting with 10 (not 106…), OTP 1234) with user JWT; headers device_type, app_version, unique_identifier as in the Dev cURL (M2Q-03 answered).',
    );
  if (a.auth.includes('WEB_TOKEN')) parts.push('Synthetic account with web JWT (M2Q-41).');
  if (a.auth.includes('ADMIN_TOKEN'))
    parts.push('CMS admin JWT, webcms: true, OTP verified, permission for the action (M2Q-04).');
  if (a.auth.includes('ADMIN_SESSION_COOKIE'))
    parts.push('Authenticated admin browser session cookie (M2Q-04).');
  if (a.auth.includes('TEST_TOKEN')) parts.push('TEST_TOKEN (existing AISLE_TEST_TOKEN, from .env only).');
  if (a.auth.includes('INFOEDGE_PROFILE_API_TOKEN'))
    parts.push('INFOEDGE_PROFILE_API_TOKEN for QA (M2Q-19).');
  if (isLogin(a))
    parts.push('Pre-login route: +91 test number starting with 10 (not 106…), OTP 1234 (M2Q-03 answered).');
  if (isWebhook(a)) parts.push('Provider/Pusher callback; no user auth.');
  if (isPayment(a)) parts.push('Provider sandbox only — never a live provider (M2Q-17).');
  if (a.notes) parts.push(`Dev note: ${a.notes}`);
  return parts.join(' ');
}

/** Read gates are OFF on staging (QA lead, M2Q-02); the gate-ON half waits for Dev (M2Q-43). */
const GATE_OFF_PRE =
  'Read gates are OFF on staging (M2Q-02 answered): writes go to the PII service, reads come from the app database. Gate-ON part waiting for Dev (M2Q-43).';

const ACCESS_PATH = (a: InventoryApi) => a.fields.map((f) => `${FIELD_LABEL[f]}: ${a.access[f]}`).join(' | ');

// ---- Applicability + content per check --------------------------------------------------------------------
type Built = Pick<
  M2Case,
  'pre' | 'data' | 'steps' | 'validate' | 'why' | 'expected' | 'evidence' | 'db' | 'priority'
> & {
  deps: string[];
  mode?: Mode;
  fields?: PiiField[];
  /** Parts waiting for a Dev environment change (not dependencies) — see M2Case.waiting. */
  waiting?: string[];
};
type Rule = (a: InventoryApi) => Built | { na: string };

const critical = (a: InventoryApi): Priority => (['G1', 'G2', 'G3'].includes(g(a)) ? 'Critical' : 'High');
const API_ONLY = 'API-level only.';
/** Matrix reasons of the cases removed 2026-10-25 (user decision; IDs never reused — UT-M2-034). */
export const NO_TARGET_NA =
  'Removed 2026-10-25: the request names no user / profile id (REF, USER_ID, OTHER_*), so B’s identifiers cannot be sent — an IDOR case could only ever be Blocked.';
export const NO_OTHER_USER_NA =
  'Removed 2026-10-25: the reply never contains another member by design (from code — confirm with Dev):';

const RULES: Record<string, Rule> = {
  POS: (a) => ({
    pre: accountPre(a),
    data: `Request from Dev cURL ${a.id} (keys: ${keys(a)}); synthetic values only.`,
    steps: [
      'Put the account/record in the state the Dev note requires.',
      `Send ${req(a)} (${authLabel(a)}).`,
      isPayment(a) || isWebhook(a)
        ? 'Inspect the outcome (subscription / provider payload / rebuilt profile) and the PII fields involved.'
        : `Compare every ${fields(a.fields)} value in the response (or in the follow-up own-profile read for actions) with the PII value of the profile it belongs to.`,
    ],
    validate: `Business outcome as on master; ${fields(a.fields)} values correct and attributed to the right profile: the caller’s own first name in the reply and every suite account’s entry equal that account’s PII first name (read through the PII first-name test route). A reply that carries only a status flag is reported as status-only, with any effect seen in the caller’s / target’s own profile.`,
    why: `This API reaches the changed PII code path (${ACCESS_PATH(a)}).`,
    expected:
      a.id === 'API-186'
        ? 'Succeeds; response omits first name (Dev doc API-186).'
        : `Succeeds as on master; PII values equal the PII service values for the right profile (PII user_id = app user id, M2Q-37 answer from code; read gates off, so app and PII values must match).${OBSERVED[a.id] ? ` ${OBSERVED[a.id]}` : ''}`,
    evidence: `Dev doc ${a.id} access path${OBSERVED[a.id] ? ' + staging observation' : ''}.`,
    db: API_ONLY,
    priority: ['G1', 'G2', 'G3'].includes(g(a))
      ? 'Critical'
      : ['G4', 'G7', 'G10'].includes(g(a))
        ? 'High'
        : 'Medium',
    deps: accessDeps(a),
    mode: isPayment(a) || isWebhook(a) ? 'Dev-assisted' : a.id === 'API-192' ? 'Manual' : 'API automation',
  }),

  CONTRACT: (a) => ({
    pre: `${accountPre(a)} Baseline contract or recorded master response (M2Q-24).`,
    data: `Same request as ${a.id}-POS.`,
    steps: [
      `Send ${req(a)}.`,
      a.id === 'API-192'
        ? 'Compare the rendered page columns with the baseline.'
        : 'Compare keys and value types with the baseline (recursively).',
    ],
    validate: 'Same keys and types; no new PII keys; no missing name/email/phone keys.',
    why: 'Mobile/web clients break on contract changes; new keys can leak PII.',
    expected: 'Matches the master baseline.',
    evidence: 'Non-regression rule; baseline per M2Q-24.',
    db: API_ONLY,
    priority: ['G3', 'G4'].includes(g(a)) ? 'High' : 'Medium',
    deps: [...accessDeps(a), 'M2Q-24'],
    mode: a.id === 'API-192' ? 'Manual' : 'API automation',
  }),

  AUTH: (a) => {
    if (a.id === 'API-012')
      return {
        pre: 'No credentials. One public and one non-public synthetic profile (M2Q-19).',
        data: 'ref of each profile.',
        steps: ['Send without Authorization for each profile.', 'Send with an invalid token.'],
        validate: 'Only public-profile data; no email/phone; non-public refused.',
        why: 'Authorization is optional on this route — it is the unauthenticated read path.',
        expected: 'Per public-visibility rules (M2Q-19); never email or phone.',
        evidence: 'Dev doc API-012 note.',
        db: API_ONLY,
        priority: 'Critical',
        deps: ['M2Q-19', 'M2Q-03'],
      };
    if (isLogin(a))
      return {
        pre: 'Approved test number (M2Q-03).',
        data: 'Wrong OTP; expired OTP; reused OTP; OTP for a different number; unapproved / malformed number.',
        steps: [
          `Request an OTP, then send ${req(a)} with each invalid variant.`,
          'Check that no session, user or PHONE record was created.',
        ],
        validate: 'Refused; no token issued; no user created; no PHONE PII written; no PII in the reply.',
        why: 'Phone + OTP is the credential here, and a successful call writes PHONE PII for new users.',
        expected: 'Refused as on master; no PII written.',
        evidence: 'Dev doc API-060 note (PHONE write only for a newly created user).',
        db: 'Check no PHONE record was created (see DB-REFUSE / M2-DB-006).',
        priority: 'Critical',
        deps: ['M2Q-03'],
      };
    if (isWebhook(a))
      return {
        pre: 'Dev agreement to send invalid callbacks to staging (M2Q-17).',
        data:
          a.id === 'API-113' || a.id === 'API-114'
            ? 'Presence event for a non-existent room; event with an app token (selects channel auth).'
            : 'Body with a wrong X-VERIFY / fake JWS / fake Pub/Sub message.',
        steps: [
          `Send ${req(a)} with the invalid signature / payload.`,
          'Check the reply and that no subscription or cache changed.',
        ],
        validate: 'Refused; reply has no profile data; no state change.',
        why: 'No user auth on this route, and a valid call rebuilds profile caches with PII.',
        expected: 'Refused with no PII (Dev doc: a genuine signed payload is required to reach activation).',
        evidence: `Dev doc ${a.id} note.`,
        db: API_ONLY,
        priority: 'High',
        deps: [a.id === 'API-113' || a.id === 'API-114' ? 'M2Q-03' : 'M2Q-17'],
      };
    return {
      pre: 'No account needed.',
      data: 'No Authorization header / cookie; "Bearer invalid"; an expired-format token.',
      steps: [`Send ${req(a)} without credentials.`, 'Send with an invalid credential.'],
      // M2Q-39 is cited in `validate` (not in pre / expected / db, which feed the dependency list): this case has no
      // dependency — it runs and FAILS on a 5xx.
      validate:
        'Refused with a 4xx (400–499): not 2xx, and a 5xx server error is NOT a refusal — it fails as the confirmed defect M2Q-39 (decode_token rescues only JWT::ExpiredSignature, authenticatable.rb:272-283; from code, confirm with Dev); body contains no PII.',
      why: 'Every route in this inventory returns or changes PII; it must require its credential.',
      expected: `Refused with a 4xx, no PII. Observed on staging 2026-10-19: app route without token → 401 {unauthorized_request:true}; TEST_TOKEN route → 401 (empty body). A server error (5xx) for an invalid or expired token is a FAILURE, never a pass (defect confirmed from code).${a.auth.includes('ADMIN_SESSION_COOKIE') ? ' The browser-only admin page refuses with a 302 to its login page (observed 2026-10-25) — only that redirect counts as a refusal.' : ''}`,
      evidence: 'Staging probe 2026-10-19; Dev doc "Request setup".',
      db: API_ONLY,
      priority: returnsOthers(a) || writesPii(a) || isRead(a) || isTestRoute(a) ? 'Critical' : 'High',
      deps: [],
    };
  },

  TOKEN: (a) => {
    if (isWebhook(a))
      return { na: 'Callback route without user credentials — covered by AUTH (invalid signature).' };
    if (a.id === 'API-012')
      return { na: 'Authorization optional by design — covered by AUTH (public-profile rules).' };
    if (isLogin(a)) return { na: 'Pre-login route — no credential type; OTP checks are in AUTH.' };
    // Audit fix 2026-10-25: a wrong credential the route can PARSE (wrongCredentialsFor in m2/src/auth/credentials.ts),
    // so a refusal proves "wrong type" — TEST_TOKEN on app routes only reached the token-decode error (5xx).
    const infoedge = a.auth.includes('INFOEDGE_PROFILE_API_TOKEN');
    const appRoute = !infoedge && a.auth.includes('USER_TOKEN');
    const wrong = infoedge
      ? 'TEST_TOKEN (another static token)'
      : appRoute
        ? 'a web JWT of a synthetic account (ptfrm "web": a real JWT the app routes reject — verify_auth_token, from code)'
        : 'a normal app user JWT of a synthetic account';
    return {
      pre: infoedge
        ? 'TEST_TOKEN from .env.'
        : appRoute
          ? 'An onboarded synthetic account (M2Q-03) and its web JWT (login with device_type "web", from code).'
          : 'A synthetic user JWT (M2Q-03).',
      data: `Valid credential of the wrong type: ${wrong}.`,
      steps: [`Send ${req(a)} with ${wrong}.`],
      validate:
        'Refused with a 4xx (400–499); a 5xx server error is NOT a refusal — it fails (defect M2Q-39, from code); no PII in the body.',
      why: 'Dev doc: "Tokens are different credentials and are not interchangeable" — a mix-up would open PII to the wrong caller.',
      expected: `Refused with a 4xx, no PII; a server error (5xx) is a failure, never a known-defect pass.${a.auth.includes('ADMIN_SESSION_COOKIE') ? ' The browser-only admin page refuses with a 302 to its login page (observed 2026-10-25).' : ''}`,
      evidence: `Dev doc "Request setup"; Aisle codebase (develop_new 944f76a, authenticatable.rb:303-308 verify_auth_token rejects ptfrm "web"; 321-324 verify_web_token rejects other platforms) — from code, confirm with Dev.`,
      db: API_ONLY,
      priority: isTestRoute(a) || isAdmin(a) ? 'Critical' : 'High',
      deps: infoedge ? [] : ['M2Q-03'],
    };
  },

  PARAM: (a) => {
    if (!hasParams(a)) return { na: 'No request parameters or path ids in the Dev contract.' };
    return {
      pre: accountPre(a),
      data: `Omit each key in turn (${keys(a)}); unknown / other-format ids${/:ref|:user_id/.test(a.path) ? '; unknown path id' : ''}.`,
      steps: [
        `Send the valid ${req(a)} once (reference state), then once per variant.`,
        'Re-read the caller’s own profile (all stable fields and the about text) and compare.',
      ],
      validate:
        '4xx (not 5xx) with a clear message; a 2xx for missing / invalid input fails ("invalid input accepted") unless the approved baseline names the code reference that makes it optional or defaulted (acceptedBecause); nothing changed in the caller’s own profile beyond the valid request (full own profile minus volatile counters / timers / texts, plus the about text); no PII echoed.',
      why: 'Bad input on a PII path must fail safely and never fall through to another user’s record.',
      expected: `Refused as on master (no 5xx); no change; no submitted or stored PII in the error.${pagedNote(a, 'without')}`,
      evidence: `Non-regression rule (baseline M2Q-24); M1 BQ-08 echo finding.${PAGED.some((k) => a.requestKeys.includes(k)) ? ' Aisle codebase (develop_new 944f76a, v1/api_controller.rb:103-113, web/api_controller.rb:29-39 standardize_params) — from code, confirm with Dev.' : ''}`,
      db: API_ONLY,
      priority: writesPii(a) ? 'High' : 'Medium',
      deps: [...accessDeps(a), 'M2Q-24'],
    };
  },

  BODY: (a) => {
    if (a.method !== 'POST' || !a.requestKeys.length)
      return { na: 'GET request or no JSON body in the Dev contract.' };
    return {
      pre: accountPre(a),
      data: 'Invalid JSON; arrays/objects/numbers/null for string keys; strings for numeric/boolean keys; extra unknown keys (e.g. user_id, tenant_id, first_name).',
      steps: [
        `Send the valid ${req(a)} once (reference state), then once per variant.`,
        'Re-read the caller’s own profile (all stable fields and the about text) and compare.',
      ],
      validate:
        '4xx (not 5xx); a 2xx for a malformed body fails ("invalid input accepted") unless the approved baseline names the code reference (acceptedBecause); unknown keys ignored (no PII written through them; caller’s own profile unchanged beyond the valid request); no echo.',
      why: 'Extra keys like user_id/first_name must not become a hidden write path.',
      expected: `Refused or ignored as on master; no PII written via unexpected keys.${pagedNote(a, 'wrong type')}`,
      evidence: `Non-regression rule (baseline M2Q-24).${a.requestKeys.includes('page') ? ' Aisle codebase (develop_new 944f76a, standardize_params) — from code, confirm with Dev.' : ''}`,
      db: API_ONLY,
      priority: writesPii(a) ? 'High' : 'Low',
      deps: [...accessDeps(a), 'M2Q-24'],
    };
  },

  IDOR: (a) => {
    if (isTestRoute(a)) return { na: 'Test-only route reads/writes any user by id by design (TEST_TOKEN).' };
    if (isAdmin(a))
      return { na: 'Admin route accesses any profile by design — role limits covered by EXPOSE.' };
    if (isWebhook(a)) return { na: 'No user identity on callback routes.' };
    if (isLogin(a)) return { na: 'Pre-login route — identity is number + OTP, covered by AUTH.' };
    // Removed 2026-10-25 (user decisions): a request that names no user / profile id cannot carry B's identifiers, so
    // the case could only ever end Blocked "no target in request" — not generated, whatever open question still holds
    // the route (an IDOR case without a target can never test cross-account access). Routes whose request names
    // another member through another key (IDOR_OTHER_TARGET, from code) keep their case. IDs never reused.
    if (!hasIdorTarget(placeholdersIn(a)) && !IDOR_OTHER_TARGET[a.id]) return { na: NO_TARGET_NA };
    return {
      pre: 'Two synthetic accounts A and B (M2Q-03).',
      data: 'B’s ref / user_id / conversation / record ids, added to A’s request (query, body or path).',
      steps: [`As A send ${req(a)} with B’s identifiers.`, 'Read B’s profile and PII before/after.'],
      validate:
        'Request acts only for A (or is refused); B’s phone (national / full) and known fake email never returned; B’s own profile (all stable fields and the about text) never changed. A request that names no user / profile id cannot carry B’s identifiers → Blocked ("no target in request"), never a pass (such cases are not generated — removed 2026-10-25; the few kept routes name the other member through another key, e.g. a public user name or a conversation id, and stay Blocked until the runner can send that key for B).',
      why: 'Classic IDOR on routes that now read and return PII.',
      expected: 'A can only read/change A’s own PII; B unchanged.',
      evidence: `Dev doc: email/phone only via own_general_information (owner).${IDOR_OTHER_TARGET[a.id] ? ` Target in request: ${IDOR_OTHER_TARGET[a.id]} — from code, confirm with Dev.` : ''}`,
      db: API_ONLY,
      priority: critical(a),
      deps: ['M2Q-03', ...accessDeps(a)],
    };
  },

  EXPOSE: (a) => {
    if (isTestRoute(a)) return { na: 'Test-only route returns the requested PII by design (TEST_TOKEN).' };
    if (isAdmin(a))
      return {
        pre: 'Permitted admin and an admin without this permission (M2Q-04).',
        data: 'Synthetic profile’s name/email/phone as search strings.',
        steps: [
          `Send ${req(a)} as each admin.`,
          'Deep-search each body for PII of profiles other than those requested.',
        ],
        validate: 'Unpermitted admin refused; permitted admin sees PII only for the requested profiles.',
        why: 'CMS views and exports hold full PII.',
        expected: 'Per the role allow-list (M2Q-14).',
        evidence: 'Dev doc admin access paths.',
        db: API_ONLY,
        priority: 'High',
        deps: ['M2Q-14', 'M2Q-04', 'M2Q-03'],
      };
    if (g(a) === 'G7')
      return {
        pre: accountPre(a),
        data: 'Synthetic user with known name/email/phone.',
        steps: [`Send ${req(a)}.`, 'Inspect the provider payload and the API response.'],
        validate:
          'Provider gets only the fields it needs; response does not return the full phone/email unnecessarily.',
        why: 'PII leaves Aisle here; over-sharing is a DPDP issue.',
        expected: 'Only required customer fields; values from the owner’s PII (Dev doc).',
        evidence: `Dev doc ${a.id} access path.`,
        db: API_ONLY,
        priority: 'High',
        deps: ['M2Q-17', 'M2Q-03'],
        mode: 'Dev-assisted',
      };
    if (!returnsOthers(a))
      return { na: 'Returns only the caller’s own data (own_detailed_v1 / own records) — covered by IDOR.' };
    // Removed 2026-10-25 (user decision): the reply never contains another member by design (from code) — "A’s
    // data not in B’s reply" can never be checked. IDs never reused.
    if (NO_OTHER_USER[a.id]) return { na: `${NO_OTHER_USER_NA} ${NO_OTHER_USER[a.id]}.` };
    return {
      pre: 'A visible to B in this response (like / invite / match / connection / room / event) (M2Q-03).',
      data: 'A’s known fake email and phone (national and full) as search strings.',
      steps: [
        'Make A visible to B for this route first (a pending invite or a like from A to B, B’s like / pass of A, a chat message, a share link for A — otherwise an account that already appears in B’s list).',
        `As B send ${req(a)}.`,
        'Deep-search the whole JSON body for A’s email and phone.',
        'Check that A is in the reply at all (A’s ref or user id, A’s ref inside a value such as a channel name, or A’s current first name).',
      ],
      validate:
        'No match in any field — and A must appear in the reply (ref / user id, ref inside a value, or A’s current first name); otherwise there is nothing to check and the case is Blocked ("A not in reply", needs A visible to B — M2Q-32), never a pass.',
      why: 'Email and phone are owner-only; a match is a leak.',
      expected:
        'No other member’s email or phone (Dev doc API-063/068: phone is not added to other members’ fields).',
      evidence: 'Dev doc API-063/068 notes.',
      db: API_ONLY,
      priority: 'Critical',
      deps: ['M2Q-03', ...accessDeps(a)],
    };
  },

  HIDDEN: (a) => {
    if (!a.fields.includes('NAME')) return { na: 'Does not involve first name.' };
    if (isTestRoute(a))
      return { na: 'Test route uses get_first_name, not the select_first_name display path (Dev doc).' };
    if (!returnsOthers(a))
      return { na: 'Shows only the caller’s own name — owner view covered by M2-FNAME-009.' };
    return {
      pre: `Profile A with hide-name ON (verified selfie, M2Q-32) appears in this response. ${accountPre(a)}`,
      data: 'A’s full first name as search string.',
      steps: [
        `As another user/admin send ${req(a)}.`,
        'Deep-search the body (names, titles, header text, sender_name, room names).',
      ],
      validate: 'A’s full name absent; masked form as agreed.',
      why: 'Each consumer builds names separately; one missed path leaks a hidden name.',
      expected: isAdmin(a)
        ? 'Admin view of hidden names: not settled by code (the M2Q-13 answer covers app users); full name never shown to non-admins.'
        : 'Full name never shown to other users; from code (M2Q-13) the hidden name shows as its first letter, capitalised (UI smoke FN-SAN-006 passed).',
      evidence: 'FN-SAN-006/028; Dev doc select_first_name access paths.',
      db: API_ONLY,
      priority: isAdmin(a) ? 'Medium' : 'Critical',
      deps: ['M2Q-13', 'M2Q-32', 'M2Q-03', ...accessDeps(a)],
    };
  },

  GATE: (a) => {
    const input = PII_INPUT[a.id]?.filter((f) => f !== 'FREE_TEXT') ?? [];
    const writes = input.length > 0 || a.id === 'API-060';
    return {
      pre: `${GATE_OFF_PRE} ${accountPre(a)}`,
      data: writes
        ? `A new fake ${fields(a.id === 'API-060' ? ['PHONE'] : input)} written through this API; otherwise the fake values the account was onboarded with.`
        : 'The fake first name, email and phone the suite’s own account was onboarded with (letters-only name, lower-case email on the test domain, +91 10xxxxxxxx number).',
      steps: [
        'Log in as a fake test account the suite created (+91 10xxxxxxxx, never 106…; OTP 1234).',
        writes
          ? `Send ${req(a)} with a new fake value (this is the write).`
          : `Send ${req(a)} with fake data.`,
        returnsOthers(a) && a.id !== 'API-021'
          ? 'Read the account’s own profile straight after; compare any suite account found in the reply with its known values.'
          : 'Read the value back (in this reply when it carries the account’s own profile, otherwise in the own profile read straight after).',
        'Check the reply for server errors, other people’s data and personal-data fields this API should not carry.',
      ],
      validate:
        'Gate off (today): the value read back equals the value written / onboarded; no 5xx; no other test account’s data; no unlisted personal-data field. A reply that carries no own first name is noted "value part not checkable" (not value-verified — only the anchor and the own-profile read-back decide). Gate on → PII value: waiting (M2Q-43).',
      why: 'Read gates (switches that make the app read personal data from the PII service instead of its own database) are OFF on staging today. Writes must still land correctly and nothing else may leak, otherwise users would see wrong or other people’s data.',
      expected: `Gate OFF (staging today, M2Q-02): no server error (5xx); the value read back is exactly the fake value written or onboarded (first name exact — fake names are letters only; email exact — plain lower-case fake email; phone shown to the owner = the login number in an accepted form); no other test account’s name, email or phone; no personal-data field with a real-looking value that the Dev inventory does not list for this API (${fields(a.fields)}). Gate ON → PII value: waiting for Dev to enable the read gates (M2Q-43).${a.fields.includes('EMAIL') ? ' Email reads also need a local email_id (Dev doc).' : ''}`,
      evidence: `QA lead answer M2Q-02 (2026-10-24); Dev doc "Field behavior"${isTestRoute(a) ? '; M2Q-35 answer (test-route write updates PII and the app profile — from code, confirm with Dev)' : ''}.`,
      db: 'API-level only. Storage checks are separate DB cases (currently on hold).',
      priority: ['G2', 'G3', 'G4'].includes(g(a)) ? 'High' : 'Medium',
      deps: ['M2Q-02', ...accessDeps(a)],
      waiting: [READ_GATES_ON],
    };
  },

  PIIDOWN: (a) => ({
    pre: `Approved way to make the PII service fail / time out (M2Q-10). ${accountPre(a)}`,
    data: 'PII errors, timeouts and slow responses (above the client timeout).',
    steps: [`Send ${req(a)} while the PII service misbehaves.`, 'Measure latency; inspect status and body.'],
    validate:
      'Agreed degraded behaviour; no stack traces / internals; no wrong-user data; writes per best-effort rule.',
    why: 'This API now depends on the PII service at runtime.',
    expected: writesPii(a)
      ? 'From code: the local write continues and the PII error is reported to Airbrake / the log, no reconciliation job (M2Q-10: forcing a failure needs Dev); reads fail without fallback (M2Q-11).'
      : 'From code (M2Q-11): no fallback — with a gate on, the request fails once the PII read errors (up to 3 attempts of 5 s); the reply shows no internals and no other user’s data.',
    evidence: 'Dev doc: no automatic fallback; "Direct model writes catch Pii::Error".',
    db: API_ONLY,
    priority: ['G2', 'G3', 'G4'].includes(g(a)) ? 'High' : 'Medium',
    deps: ['M2Q-11', 'M2Q-10', ...accessDeps(a)],
    mode: 'Dev-assisted',
  }),

  CACHE: (a) => {
    if (!isRead(a) && !(isTestRoute(a) && a.method === 'GET') && a.id !== 'API-190' && a.id !== 'API-003')
      return { na: 'Not a read API — write/action outcome covered by POS and the read APIs’ CACHE checks.' };
    // Removed 2026-10-25 (user decision): read routes that never show another member and do not carry the caller’s
    // own profile — no writer can ever be surfaced to the reader. IDs never reused.
    if (NO_OTHER_USER[a.id] && !OWN_PROFILE_BY_REF.includes(a.id))
      return { na: `${NO_OTHER_USER_NA} ${NO_OTHER_USER[a.id]}.` };
    return {
      pre: `Profile in this response; supported PII change path (app edit / admin edit). ${accountPre(a)}`,
      data: 'Name N1 → N2 (and email/phone where a supported change path exists).',
      steps: [
        `Send ${req(a)} (warm cache).`,
        'Change the PII value through the app path.',
        'Re-send until the new value appears or the window expires.',
      ],
      validate:
        'The warm read must show the writer (name or ref) — otherwise Blocked (M2Q-32), not polled. The writer is made visible to the reader first (pending invite, like, pass, chat message, share link, or an account already in the reader’s list). Own-profile routes (including GET /V1/users/:ref and /web/users/:ref, which answer the caller’s own profile) are read by the writer, TEST_TOKEN routes with the TEST_TOKEN. New value within 45 s; no reversion afterwards.',
      why: 'Profile and FieldStore caches can keep stale PII.',
      expected:
        'From code (M2Q-12): the writer’s own PII cache is updated at once, so the writer’s own reads and the test routes must show the new name within 45 s (else a failure); other users’ lists keep the cached profile name until the profile cache is rebuilt (no fixed window) — the time is recorded, and not seen within 45 s is Blocked with that reason; a reversion after the new value appeared is a failure.',
      evidence:
        'Dev doc cache notes (hydration keeps cached name when nil; proxy writes bypass invalidation).',
      db: API_ONLY,
      priority: 'Medium',
      deps: ['M2Q-12', ...accessDeps(a)],
    };
  },

  STATE: (a) => {
    if (!['G5', 'G6', 'G8'].includes(g(a)))
      return { na: 'No account/record-state precondition beyond authentication in the Dev contract.' };
    return {
      pre: accountPre(a),
      data: 'Account/record in a disallowed state (deactivated, pending, banned, action already done, wrong target).',
      steps: [
        'Read the caller’s and the target’s own profiles (counters included).',
        `Send the valid ${req(a)}, then the same request again, then with unknown ids; re-read both profiles after each.`,
      ],
      validate:
        'Verified by state, not only by status: the valid request’s effect is read from the caller’s and the target’s own profiles; “action already done” changes nothing more (a toggle sent twice is back at the start); “wrong target” changes nothing. A 2xx for these two variants needs a code reference in the approved baseline (acceptedBecause), otherwise it fails. When every variant gets the same status and nothing observable changes, the status proves nothing → Blocked (non-discriminating), never a pass. No PII in errors.',
      why: 'Error paths of these actions now also run the PII serializer.',
      expected:
        'Same outcome as master; no PII in errors; a repeated or wrong-target action changes nothing (checked in the own profiles).',
      evidence: 'Non-regression rule (baseline M2Q-24).',
      db: API_ONLY,
      priority: 'Low',
      deps: [...accessDeps(a), 'M2Q-24'],
    };
  },

  REPEAT: (a) => {
    if (a.method !== 'POST' || isRead(a) || (isTestRoute(a) && a.id !== 'API-002'))
      return { na: 'Read-only request — repeating it has no side effect.' };
    return {
      pre: accountPre(a),
      data: 'Same valid request sent twice in a row and twice concurrently.',
      steps: [
        `Send ${req(a)} twice sequentially, then twice in parallel.`,
        'Read the profile / records / PII.',
      ],
      validate: /toggle|toogle/.test(a.path)
        ? 'Same outcome as master; the toggle sent twice is back at the start (caller’s full own profile compared); the account is left as it was (sent once more if the parallel pair did not cancel out).'
        : 'Same outcome as master; no duplicate side effects (subscriptions, likes, messages, PII records); the caller’s full own profile (stable fields and the about text) unchanged after the first request.',
      why: 'Mobile clients retry; duplicates on a PII path create inconsistent records.',
      expected: isWebhook(a)
        ? 'Replayed callback does not activate twice (as on master).'
        : 'Same as master for a repeated request; no duplicate PII writes.',
      evidence: 'Non-regression rule (baseline M2Q-24).',
      db: writesPii(a) ? 'Check no duplicate PII rows (see DB-SAVE).' : API_ONLY,
      priority: writesPii(a) || isPayment(a) || isWebhook(a) ? 'High' : 'Low',
      deps: [...accessDeps(a), 'M2Q-24'],
    };
  },

  FIELD: (a) => {
    const input = PII_INPUT[a.id];
    if (!input) return { na: 'Does not accept first name, email or phone as input.' };
    const qs = [
      ...new Set(input.map((f) => (f === 'EMAIL' ? 'M2Q-07' : f === 'FREE_TEXT' ? 'M2Q-30' : 'M2Q-06'))),
    ];
    return {
      pre: accountPre(a),
      data: [
        input.includes('NAME')
          ? 'Name: missing, null, "", "   ", padded, repeated spaces, 256+ chars, digits, emoji, Indian script, NFD accents.'
          : '',
        input.includes('EMAIL')
          ? 'Email: missing, null, "", invalid formats, 255+ chars, mixed case, padded.'
          : '',
        input.includes('PHONE')
          ? 'Phone: approved number with spaces/dashes/+91/leading 0, too short, too long, letters.'
          : '',
        input.includes('FREE_TEXT')
          ? 'Free text: missing, null, "", "   ", 1 char, at / over the max length, emoji, Indian scripts, multi-line, HTML/script tags.'
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      steps: [`Send ${req(a)} once per value.`, 'Read back via app and PII.'],
      validate:
        'Accept/refuse per rule; stored value normalised identically in PII and local field; refused values change nothing.',
      why: 'This API writes PII — bad input would corrupt or wipe the stored value.',
      expected: input.every((f) => f === 'NAME')
        ? 'From code (M2Q-06): a blank value is ignored (name unchanged); otherwise the name is stripped and, when it contains any A–Z letter, reduced to its A–Z letters; no maximum length. Refused values leave PII unchanged.'
        : `${input.includes('NAME') ? 'Name: from code (M2Q-06) blank → ignored, otherwise stripped and reduced to A–Z letters. ' : ''}Other fields: to be confirmed (${qs.filter((q) => q !== 'M2Q-06').join(', ')}). Refused values leave PII unchanged.`,
      evidence: 'No documented rule; M1 PII-service rules in BQ-36/37.',
      db: 'See DB-REFUSE for this API.',
      priority: 'High',
      deps: [...qs, ...accessDeps(a)],
      fields: input,
    };
  },

  'DB-SAVE': (a) => {
    if (!writesPii(a)) return { na: 'No PII write path (Dev doc access path only reads PII).' };
    const what = DELETES.includes(a.id) ? 'erasure' : 'write';
    return {
      pre: 'Read-only access to the PII DB and aisleweb; schema + storage contract (M2Q-16).',
      data: 'Synthetic user ids from the POS run.',
      steps: [
        'Snapshot the user’s PII records (counts + ciphertext hashes).',
        `Run ${req(a)}.`,
        'Snapshot again.',
      ],
      validate:
        what === 'erasure'
          ? 'Records erased / tombstoned per contract.'
          : 'One record per field for the right user/tenant; ciphertext only; replaced not duplicated.',
      why: 'Proves the API’s PII effect at storage level, not just in responses.',
      expected:
        what === 'erasure'
          ? 'Per erasure contract (M2Q-15).'
          : 'One encrypted record per written field for the right user (Dev doc access path).',
      evidence: `Dev doc ${a.id} access path.`,
      db: 'PII DB rows by tenant + user + field; aisleweb compatibility columns. Read-only SELECT; compare hashes/counts, never print or decrypt values.',
      priority: 'High',
      deps: [...(DELETES.includes(a.id) ? ['M2Q-16', 'M2Q-15'] : ['M2Q-16']), DB_ON_HOLD, ...dbAccessDeps(a)],
      fields: PII_INPUT[a.id] ?? a.fields,
    };
  },

  'DB-REFUSE': (a) => {
    if (!PII_INPUT[a.id]) return { na: 'No PII input on this API.' };
    return {
      pre: 'Read-only DB access (M2Q-16); this API’s PARAM / BODY / FIELD / AUTH cases executed.',
      data: '—',
      steps: ['Snapshot.', 'Run the refused requests for this API.', 'Snapshot.'],
      validate: 'No new or changed PII records or local columns.',
      why: 'A refused request that still writes is a silent integrity bug.',
      expected: 'No changes.',
      evidence: 'Integrity requirement.',
      db: 'Counts + ciphertext hashes before/after; read-only.',
      priority: 'High',
      deps: ['M2Q-16', DB_ON_HOLD, ...dbAccessDeps(a)],
      fields: PII_INPUT[a.id],
    };
  },

  'DB-ISOL': (a) => {
    if (!writesPii(a)) return { na: 'No PII write path.' };
    return {
      pre: 'Read-only DB access (M2Q-16); users A and B.',
      data: '—',
      steps: ['Snapshot B’s records and A’s other fields.', `Run ${req(a)} for A.`, 'Snapshot again.'],
      validate: 'B unchanged; A’s non-target fields unchanged.',
      why: 'Storage-level proof of isolation and no unintended overwrite.',
      expected: 'Unchanged.',
      evidence: 'Isolation requirement.',
      db: 'PII DB rows by user + field; read-only.',
      priority: 'High',
      deps: ['M2Q-16', DB_ON_HOLD, ...dbAccessDeps(a)],
    };
  },
};

// ---- Free text (encrypted long text) ------------------------------------------------------------------
/**
 * Extra expectations for APIs that carry FREE_TEXT (Dev free-text list, 2026-10-23). Known from M1: the PII service
 * issues a free-text key and Aisle encrypts the text with it (AES-256-GCM); storage columns, key granularity and
 * legacy plaintext are still open (BQ-46/47 → M2Q-27/28), so those parts cite the question.
 */
function withFreeText(code: string, a: InventoryApi, b: Built): Built {
  const add = (deps: string[]) => [...new Set([...b.deps, ...deps])];
  const FT = 'free text (chat text / previous_message / bio)';
  switch (code) {
    case 'POS':
      return {
        ...b,
        validate: `${b.validate} The ${FT} comes back exactly as sent, to permitted users only.`,
        expected: `${b.expected} Free text round-trips exactly (same characters, order and line breaks).`,
        evidence: `${b.evidence} Dev free-text list 2026-10-23; M1 key round-trip AISLE-FT-008.`,
      };
    case 'EXPOSE':
      return {
        ...b,
        data: `${b.data} Also: a message from a conversation B is not part of.`,
        validate: `${b.validate} No ciphertext, key_id or key material, and no messages from other conversations.`,
        expected: `${b.expected} Only decrypted text of conversations/profiles B may see; field allow-list per M2Q-27.`,
        deps: add(['M2Q-27']),
      };
    case 'PIIDOWN':
      return {
        ...b,
        expected: `${b.expected} Free text is never stored or returned as plaintext fallback; behaviour per M2Q-29.`,
        deps: add(['M2Q-29']),
      };
    case 'GATE':
      return {
        ...b,
        expected: `${b.expected} Free-text encryption switches PII_FREE_TEXT_* default OFF (M2Q-27, from code); free text is recorded, not compared.`,
        deps: add(['M2Q-27']),
      };
    case 'DB-SAVE':
    case 'DB-ISOL':
    case 'DB-REFUSE':
      return {
        ...b,
        validate: `${b.validate} Free text: ciphertext + key_id only, no plaintext copy; new nonce per write.`,
        db: `${b.db} Free-text columns in aisleweb per M2Q-27 (BQ-46).`,
        deps: add(['M2Q-27']),
      };
    default:
      return b;
  }
}

// ---- Build ------------------------------------------------------------------------------------------------
const statusOf = (deps: string[]): Status => statusFromDeps(deps);

const MODULE_SHORT: Record<string, string> = {
  G1: 'PII test routes',
  G2: 'PII writes & lifecycle',
  G3: 'Profile reads',
  G4: 'Lists (batch names)',
  G5: 'Interactions & chat',
  G6: 'Profile updates',
  G7: 'Payment requests',
  G8: 'Payment verification',
  G9: 'Callbacks',
  G10: 'CMS / admin',
};

export interface Baseline {
  cases: (M2Case & { check: string })[];
  matrix: Map<string, Record<string, Cell>>;
}

export function buildBaseline(inventory: InventoryApi[]): Baseline {
  const cases: (M2Case & { check: string })[] = [];
  const matrix = new Map<string, Record<string, Cell>>();
  for (const a of inventory) {
    if (g(a) === 'M1') continue;
    const row: Record<string, Cell> = {};
    for (const check of CHECKS) {
      const covered = COVERED_BY[check.code]?.[a.id];
      if (covered) {
        row[check.code] = { kind: 'covered', by: covered };
        continue;
      }
      const built = RULES[check.code]!(a);
      if ('na' in built) {
        row[check.code] = { kind: 'na', reason: built.na };
        continue;
      }
      if (a.fields.includes('FREE_TEXT')) Object.assign(built, withFreeText(check.code, a, built));
      const text = `${built.pre} ${built.expected} ${built.db}`;
      const waiting = built.waiting ?? [];
      const deps = [...new Set([...built.deps, ...(text.match(/M2Q-\d+/g) ?? [])])]
        .filter((d) => !waiting.includes(d))
        .sort();
      const status: Status = statusOf(deps);
      const mode = built.mode ?? 'API automation';
      const automation: Automation =
        mode === 'Manual' ? 'NOT AUTOMATED' : status === 'BLOCKED' ? 'AUTOMATION BLOCKED' : 'NOT AUTOMATED';
      const id = `M2-${a.id}-${check.code}`;
      cases.push({
        id,
        check: check.code,
        module: `${g(a)} ${MODULE_SHORT[g(a)]}`,
        apis: [a.id],
        fields: built.fields ?? a.fields,
        name: `${a.id} ${a.method} ${a.path} — ${check.title}`,
        category: check.category,
        priority: built.priority,
        pre: built.pre,
        data: built.data,
        steps: built.steps,
        validate: built.validate,
        why: built.why,
        expected: built.expected,
        db: built.db,
        deps,
        status,
        automation,
        mode,
        evidence: built.evidence,
        ...(waiting.length ? { waiting } : {}),
      });
      row[check.code] = { kind: 'case', id };
    }
    matrix.set(a.id, row);
  }
  return { cases, matrix };
}
