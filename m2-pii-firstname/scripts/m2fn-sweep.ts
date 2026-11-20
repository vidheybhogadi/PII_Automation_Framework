/**
 * The sweep (M2FN-SWP-001) over every Aisle / Aisle CMS row of the first-name inventory
 * (m2-pii-firstname/docs/firstname-inventory.json) that no deep case covers. QA lead approval 2026-11-11.
 *
 * Every row is classified once:
 *  - now      — callable today: the row’s API is called for (or by) a divergent synthetic user D (Aisle DB name X,
 *               PII name Y); the name it returns must be Y (never X), or the documented initial when hidden.
 *  - approved — callable once D and the viewer A are approved through the CMS (M2FNQ-07 answer) and related as the
 *               row needs (`relation`); a relation the suite cannot make blocks that row with its reason.
 *  - cannot   — not callable; `reason` says why (side channel, provider, missing id / session, UI page …).
 *
 * `api` is the Milestone 2 inventory id of the route (m2/docs/aisle-pii-affected-apis.md), so the Dev request shape
 * is used; `route` is used when the route is not in that inventory. `how` says who calls and where the name is read.
 */
export type SweepClass = 'now' | 'approved' | 'cannot';

export type SweepHow =
  /** D calls; D’s own first_name in the reply must be the full PII name Y. */
  | 'own'
  /** D calls with a web JWT; D’s own name. */
  | 'web-own'
  /** A calls with a user JWT about D (ref = D); D’s name in the reply. */
  | 'other'
  /** A calls with a web JWT about D. */
  | 'web-other'
  /** No credential, about D. */
  | 'unauth'
  /** TEST_TOKEN about D. */
  | 'test-token'
  /** The CMS admin, about D (ref = D). */
  | 'cms'
  /** D writes a new run-unique name; PII = Aisle DB = reply. */
  | 'write'
  /** Fixed sample data; the reply must not carry D’s names. */
  | 'static'
  /** Only the hide_first_name flag is returned (no name). */
  | 'flag';

export type Relation =
  'like' | 'connection' | 'invite' | 'comment' | 'spark' | 'discover' | 'link' | 'report';

export interface SweepRow {
  row: string;
  cls: SweepClass;
  how?: SweepHow;
  api?: string;
  /** Route for rows without a Milestone 2 inventory id: [method, path]. */
  route?: [string, string];
  relation?: Relation;
  /** Extra query of the call (e.g. the row’s own user_activity_v1 filter). */
  query?: Record<string, string>;
  reason?: string;
}

const C = (row: string, reason: string): SweepRow => ({ row, cls: 'cannot', reason });
const NOW = (row: string, how: SweepHow, api: string): SweepRow => ({ row, cls: 'now', how, api });
const APP = (row: string, how: SweepHow, api: string, relation: Relation): SweepRow => ({
  row,
  cls: 'approved',
  how,
  api,
  relation,
});

const PUSH =
  'Side channel: the name goes into a push / chat payload, not into this API’s reply (logged for later). Conversations it creates are covered by the chat-list cases (M2FN-CHT).';
const PAY = 'Payment provider call: never run against a real provider (M2FNQ-28).';
const LIVE = 'Live-audio room route: needs a ROOM_ID and the feature looks retired (M2FNQ-21).';
const M1 = 'Milestone 1 facade route (covered by the M1 suite); used here only as a test aid.';
const PAGE = 'CMS frontend page: it has no API of its own; covered through its backend route row.';
const GLOBAL =
  'Global CMS queue: it cannot be filtered to the suite’s accounts, so its reply would carry non-synthetic users’ names into the full-response report — never called.';
const QUEUE = 'Needs an own account in a CMS image / review queue (M2FNQ-22).';
const ACTIVE_ADMIN = 'Needs an ActiveAdmin cookie session (M2FNQ-27).';

export const SWEEP: SweepRow[] = [
  // ---- Aisle: callable now -------------------------------------------------------------------------------
  NOW('FN-AIS-003', 'unauth', 'API-012'),
  NOW('FN-AIS-005', 'web-other', 'API-119'),
  NOW('FN-AIS-006', 'own', 'API-106'),
  NOW('FN-AIS-014', 'own', 'API-047'),
  NOW('FN-AIS-025', 'own', 'API-091'),
  NOW('FN-AIS-026', 'own', 'API-100'),
  NOW('FN-AIS-033', 'own', 'API-088'),
  NOW('FN-AIS-034', 'own', 'API-086'),
  NOW('FN-AIS-036', 'own', 'API-022'),
  NOW('FN-AIS-037', 'own', 'API-013'),
  NOW('FN-AIS-038', 'own', 'API-027'),
  NOW('FN-AIS-039', 'own', 'API-017'),
  NOW('FN-AIS-041', 'own', 'API-028'),
  NOW('FN-AIS-042', 'own', 'API-040'),
  NOW('FN-AIS-043', 'own', 'API-024'),
  NOW('FN-AIS-044', 'own', 'API-025'),
  NOW('FN-AIS-045', 'own', 'API-038'),
  NOW('FN-AIS-046', 'own', 'API-037'),
  NOW('FN-AIS-047', 'own', 'API-036'),
  NOW('FN-AIS-048', 'own', 'API-026'),
  NOW('FN-AIS-049', 'web-own', 'API-130'),
  NOW('FN-AIS-050', 'web-own', 'API-120'),
  NOW('FN-AIS-051', 'web-own', 'API-121'),
  { row: 'FN-AIS-066', cls: 'now', how: 'flag', route: ['GET', '/V1/users/fetch_settings'] },
  NOW('FN-AIS-068', 'write', 'API-002'),
  NOW('FN-AIS-069', 'write', 'API-061'),
  NOW('FN-AIS-071', 'write', 'API-057'),
  NOW('FN-AIS-072', 'write', 'API-130'),
  NOW('FN-AIS-073', 'write', 'API-129'),
  NOW('FN-AIS-104', 'static', 'API-191'),
  NOW('FN-AIS-108', 'test-token', 'API-001'),
  // Login routes last for D (a new login can replace D’s session on its device).
  { row: 'FN-AIS-030', cls: 'now', how: 'own', route: ['POST', '/V1/sessions/fetch_login_response_web'] },
  NOW('FN-AIS-029', 'own', 'API-062'),
  NOW('FN-AIS-031', 'own', 'API-060'),
  // ---- Aisle CMS: callable now ---------------------------------------------------------------------------
  NOW('FN-CMS-003', 'cms', 'API-165'),
  NOW('FN-CMS-017', 'cms', 'API-177'),
  // ---- Callable after approval (M2FNQ-07) and the relation the row needs ---------------------------------
  APP('FN-AIS-007', 'other', 'API-005', 'invite'),
  APP('FN-AIS-008', 'other', 'API-007', 'like'),
  APP('FN-AIS-009', 'other', 'API-006', 'comment'),
  APP('FN-AIS-010', 'other', 'API-008', 'like'),
  APP('FN-AIS-011', 'other', 'API-054', 'like'),
  APP('FN-AIS-013', 'other', 'API-048', 'like'),
  APP('FN-AIS-016', 'other', 'API-045', 'discover'),
  {
    row: 'FN-AIS-017',
    cls: 'approved',
    how: 'other',
    route: ['GET', '/V1/sparks/list_received'],
    relation: 'spark',
  },
  APP('FN-AIS-018', 'other', 'API-016', 'discover'),
  APP('FN-AIS-019', 'other', 'API-019', 'discover'),
  APP('FN-AIS-020', 'other', 'API-020', 'discover'),
  APP('FN-AIS-021', 'other', 'API-014', 'discover'),
  APP('FN-AIS-022', 'other', 'API-015', 'discover'),
  APP('FN-AIS-023', 'web-other', 'API-116', 'invite'),
  APP('FN-AIS-024', 'web-other', 'API-126', 'like'),
  APP('FN-AIS-028', 'other', 'API-066', 'connection'),
  APP('FN-AIS-052', 'other', 'API-068', 'connection'),
  APP('FN-AIS-064', 'other', 'API-016', 'link'),
  { ...APP('FN-CMS-004', 'cms', 'API-166', 'connection'), query: { filter: 'likes_connection' } },
  APP('FN-CMS-010', 'cms', 'API-181', 'connection'),
  { ...APP('FN-CMS-015', 'cms', 'API-166', 'report'), query: { filter: 'reports' } },
  // ---- Aisle: cannot call -----------------------------------------------------------------------------------
  C('FN-AIS-001', 'Needs a speed-dating EVENT_ID (M2Q-45) — QA cannot create an event.'),
  C('FN-AIS-055', 'Needs a speed-dating EVENT_ID — QA cannot create an event.'),
  C(
    'FN-AIS-004',
    'Needs the external partner token INFOEDGE_PROFILE_API_TOKEN (M2FNQ-28); the reply has no name.',
  ),
  C('FN-AIS-053', 'Needs linked users (a state the suite cannot create).'),
  C('FN-AIS-056', 'Needs linked users (a state the suite cannot create).'),
  C('FN-AIS-058', LIVE),
  C('FN-AIS-059', LIVE),
  C('FN-AIS-060', LIVE),
  C('FN-AIS-061', LIVE),
  C('FN-AIS-062', LIVE),
  C('FN-AIS-075', M1),
  C('FN-AIS-105', M1),
  C('FN-AIS-106', M1),
  C('FN-AIS-107', M1),
  ...[
    'FN-AIS-076',
    'FN-AIS-077',
    'FN-AIS-078',
    'FN-AIS-079',
    'FN-AIS-080',
    'FN-AIS-081',
    'FN-AIS-082',
    'FN-AIS-083',
    'FN-AIS-084',
    'FN-AIS-085',
    'FN-AIS-086',
    'FN-AIS-087',
    'FN-AIS-088',
    'FN-AIS-089',
    'FN-AIS-090',
    'FN-AIS-091',
    'FN-AIS-092',
  ].map((r) => C(r, PUSH)),
  ...[
    'FN-AIS-093',
    'FN-AIS-094',
    'FN-AIS-095',
    'FN-AIS-096',
    'FN-AIS-097',
    'FN-AIS-098',
    'FN-AIS-099',
    'FN-AIS-100',
    'FN-AIS-101',
  ].map((r) => C(r, PAY)),
  C('FN-AIS-102', 'Server logs: only Dev can check them (logged for later).'),
  C('FN-AIS-103', 'Mongo / submission-cache copy: no read access (logged for later).'),
  C(
    'FN-AIS-111',
    'Paint & mixer booking name (web JWT route, request-supplied name, payment flow): needs the web credential and a test-mode payment (M2FNQ-28; logged for later).',
  ),
  // ---- Aisle CMS: cannot call -------------------------------------------------------------------------------
  ...[
    'FN-CMS-005',
    'FN-CMS-009',
    'FN-CMS-036',
    'FN-CMS-037',
    'FN-CMS-038',
    'FN-CMS-039',
    'FN-CMS-040',
    'FN-CMS-041',
    'FN-CMS-042',
    'FN-CMS-043',
    'FN-CMS-044',
    'FN-CMS-050',
    'FN-CMS-051',
    'FN-CMS-054',
    'FN-CMS-062',
    'FN-CMS-064',
    'FN-CMS-066',
  ].map((r) => C(r, PAGE)),
  ...[
    'FN-CMS-011',
    'FN-CMS-012',
    'FN-CMS-016',
    'FN-CMS-020',
    'FN-CMS-021',
    'FN-CMS-023',
    'FN-CMS-024',
    'FN-CMS-025',
    'FN-CMS-026',
    'FN-CMS-028',
    'FN-CMS-029',
  ].map((r) => C(r, GLOBAL)),
  ...['FN-CMS-007', 'FN-CMS-008', 'FN-CMS-056', 'FN-CMS-057', 'FN-CMS-058', 'FN-CMS-059', 'FN-CMS-060'].map(
    (r) => C(r, QUEUE),
  ),
  ...['FN-CMS-031', 'FN-CMS-032', 'FN-CMS-033', 'FN-CMS-034', 'FN-CMS-046'].map((r) => C(r, ACTIVE_ADMIN)),
  C('FN-CMS-067', 'Server logs: only Dev can check them (logged for later).'),
  C(
    'FN-CMS-068',
    'N/A: plaintext in the Aisle DB (admin_curations.data) is by design (user decision); the curation flow itself is M2FN-CMW-004.',
  ),
];

/** Why a relation cannot be made by the suite (the row then blocks with this reason). */
export const RELATION_BLOCK: Partial<Record<Relation, string>> = {
  invite:
    'Needs an invite from D to A (an approved sender with requests left); the suite’s invite flow is not wired into the sweep yet',
  comment: 'Needs a comment from D to A; the suite cannot create one in the sweep',
  spark: 'Needs a spark from D to A (spark balance / subscription); not available to the suite',
  discover: 'D appears in A’s discover lists only if the matching algorithm picks it; not controllable',
  link: 'Needs a share link opened by A (the deep link case is M2FN-FUL-001)',
  report: 'Needs a report between own accounts (M2FNQ-22, kept blocked)',
};

export const sweepRow = (row: string) => SWEEP.find((r) => r.row === row);
