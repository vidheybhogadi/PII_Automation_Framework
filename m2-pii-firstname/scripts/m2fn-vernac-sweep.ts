/**
 * The vernac sweep (M2FN-VSWP-001) over every Vernac / Vernac CMS row of the first-name inventory that no deep case
 * covers. QA lead approval 2026-11-11 (with the answers to M2FNQ-34 / 35 / 51 / 53).
 *
 * Every row is classified once:
 *  - now    — callable today by a team user about itself (own rows; edit rows with an empty body = no change,
 *             M2FNQ-35 answer);
 *  - later  — callable only through a relation that ALREADY exists between two team users (read-only DB lookup,
 *             M2FNQ-34 answer: no new relations) or a CMS list whose members are all team users (DB counts); the
 *             row blocks with its reason when no such relation exists;
 *  - cannot — not callable; `reason` says why.
 * The check: the member’s name in the reply equals its CMS view (PII getter, GET /admin/users/:ref).
 */
export type VnSweepClass = 'now' | 'later' | 'cannot';
export type VnSweepHow = 'own' | 'own-edit' | 'viewer' | 'cms-member';
export type VnRelation =
  'invite-received' | 'conversation' | 'conversation-cms' | 'all-partners-suite' | 'connected-partner';

export interface VnSweepRow {
  row: string;
  cls: VnSweepClass;
  how?: VnSweepHow;
  route?: [method: 'GET' | 'POST', path: string];
  relation?: VnRelation;
  /** For relation "conversation": the kind of conversation the list shows (active = full, linked = not yet full). */
  conversation?: 'full' | 'linked';
  query?: Record<string, string>;
  reason?: string;
}

const C = (row: string, reason: string): VnSweepRow => ({ row, cls: 'cannot', reason });

const DISCOVER =
  'Discover / select lists are chosen by the matching algorithm and carry members who are not team users — never called.';
const IRREVERSIBLE =
  'Changes the match state between two team users and cannot be undone (QA lead 2026-11-11, M2FNQ-34: no new relations).';
const PUSH =
  'Sends a push to a team member’s phone and creates a relation that cannot be undone (M2FNQ-34); the name is only in the push (out of scope).';
const DEAD = 'No caller / not routed in desiapp develop @ f89046944 (dead code).';
const JOB = 'Background job / rake task: Dev-only, no API to call (logged for later).';
const PROVIDER = 'Invoice / provider / marketing egress: logged for later (no real provider is ever called).';
const PAGE = 'CMS frontend page: no API of its own; covered through its backend route rows.';
const GLOBAL =
  'Global CMS queue / list: it cannot be filtered to the team users, so its reply would carry other members’ names into the report — never called.';
const ACTIVE_ADMIN = 'ActiveAdmin page: needs an ActiveAdmin cookie session (not a CMS API).';
const STATE =
  'Moves a profile through a CMS queue (state change) — not allowed on team users (QA lead 2026-11-11, M2FNQ-53).';

export const VN_SWEEP: VnSweepRow[] = [
  // ---- Vernac: callable now ----------------------------------------------------------------------------------
  { row: 'FN-VRN-001', cls: 'now', how: 'own', route: ['GET', '/v1/user/fetch_own_profile'] },
  { row: 'FN-VRN-024', cls: 'now', how: 'own', route: ['GET', '/v1/user/fetch_own_info'] },
  { row: 'FN-VRN-023', cls: 'now', how: 'own-edit', route: ['POST', '/v1/user/edit_profile'] },
  { row: 'FN-VRN-027', cls: 'now', how: 'own-edit', route: ['POST', '/v1/user/update_interests'] },
  { row: 'FN-VRN-049', cls: 'now', how: 'own-edit', route: ['POST', '/v1/user/story'] },
  // ---- Vernac: through an existing relation --------------------------------------------------------------------
  {
    row: 'FN-VRN-003',
    cls: 'later',
    how: 'viewer',
    route: ['GET', '/v1/invites/list_all_requests'],
    relation: 'invite-received',
  },
  {
    row: 'FN-VRN-013',
    cls: 'later',
    how: 'viewer',
    route: ['GET', '/v1/active_conversation_list'],
    relation: 'conversation',
    conversation: 'full',
  },
  {
    row: 'FN-VRN-016',
    cls: 'later',
    how: 'viewer',
    route: ['GET', '/v1/linked_conversation_list'],
    relation: 'conversation',
    conversation: 'linked',
  },
  // ---- Vernac CMS: through existing relations whose members are all team users ---------------------------------
  {
    row: 'FN-VCM-005',
    cls: 'later',
    how: 'cms-member',
    route: ['GET', '/admin/connections/fetch_messages'],
    relation: 'conversation-cms',
  },
  {
    row: 'FN-VCM-009',
    cls: 'later',
    how: 'cms-member',
    route: ['GET', '/admin/member/fetch_connected_profiles'],
    relation: 'connected-partner',
  },
  {
    row: 'FN-VCM-014',
    cls: 'later',
    how: 'cms-member',
    route: ['GET', '/admin/members/download_profile_details'],
    relation: 'all-partners-suite',
  },
  // ---- Vernac: cannot call ----------------------------------------------------------------------------------------
  ...['FN-VRN-008', 'FN-VRN-009', 'FN-VRN-010', 'FN-VRN-011', 'FN-VRN-012'].map((r) => C(r, DISCOVER)),
  ...['FN-VRN-015', 'FN-VRN-017', 'FN-VRN-036'].map((r) => C(r, IRREVERSIBLE)),
  C('FN-VRN-026', 'Reports / blocks a team member — cannot be undone (M2FNQ-34).'),
  ...['FN-VRN-028', 'FN-VRN-029', 'FN-VRN-030', 'FN-VRN-033', 'FN-VRN-044', 'FN-VRN-059'].map((r) =>
    C(r, DEAD),
  ),
  C(
    'FN-VRN-032',
    'Warning email is commented out in code; triggered by a CMS moderation write (logged for later).',
  ),
  ...['FN-VRN-034', 'FN-VRN-035', 'FN-VRN-037', 'FN-VRN-040', 'FN-VRN-041', 'FN-VRN-042'].map((r) =>
    C(r, PUSH),
  ),
  C(
    'FN-VRN-038',
    'Name egress to the notification event server, sent only with a new invite (M2FNQ-34, M2FNQ-43).',
  ),
  ...['FN-VRN-046'].map((r) => C(r, JOB)),
  C(
    'FN-VRN-048',
    'Deletes the team account (soft delete) — cannot be undone; PII is not removed either (M2FNQ-49).',
  ),
  C(
    'FN-VRN-052',
    'Needs a new spark send (M2FNQ-34); the name sits in delayed_jobs only until the push job runs.',
  ),
  C('FN-VRN-053', 'Offline-event form name (not the profile name; Arike events) — scope question M2FNQ-45.'),
  ...['FN-VRN-056', 'FN-VRN-057', 'FN-VRN-058', 'FN-VRN-060'].map((r) => C(r, PROVIDER)),
  C('FN-VRN-061', JOB),
  C(
    'FN-VRN-064',
    'Rails log line of every push: only Dev can check server logs (M2FNQ-44; logged for later).',
  ),
  // ---- Vernac CMS: cannot call --------------------------------------------------------------------------------------
  ...['FN-VCM-001', 'FN-VCM-002', 'FN-VCM-003', 'FN-VCM-004'].map((r) => C(r, PAGE)),
  ...[
    'FN-VCM-006',
    'FN-VCM-007',
    'FN-VCM-013',
    'FN-VCM-015',
    'FN-VCM-016',
    'FN-VCM-019',
    'FN-VCM-020',
    'FN-VCM-021',
    'FN-VCM-023',
    'FN-VCM-024',
    'FN-VCM-028',
    'FN-VCM-029',
    'FN-VCM-030',
  ].map((r) => C(r, GLOBAL)),
  C(
    'FN-VCM-011',
    'Needs a report between team users; none exists (read-only DB 2026-11-11) and none may be made (M2FNQ-34).',
  ),
  C(
    'FN-VCM-022',
    'Needs a review record of a team user; the reply returns review_data nil anyway (from code).',
  ),
  ...['FN-VCM-026', 'FN-VCM-027'].map((r) => C(r, ACTIVE_ADMIN)),
  ...[
    'FN-VCM-037',
    'FN-VCM-038',
    'FN-VCM-039',
    'FN-VCM-040',
    'FN-VCM-041',
    'FN-VCM-042',
    'FN-VCM-048',
    'FN-VCM-049',
  ].map((r) => C(r, STATE)),
  C('FN-VCM-044', JOB),
  C('FN-VCM-047', 'Deletes the team account — cannot be undone (M2FNQ-49).'),
];

export const vnSweepRow = (row: string) => VN_SWEEP.find((r) => r.row === row);
