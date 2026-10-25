/**
 * Facts taken from the Aisle app source (read-only clone, branch develop_new @ 944f76a, which contains the inventory
 * snapshot ae838f4). Every entry cites file:line. "From code — confirm with Dev": staging observations win where
 * they differ. Nothing here is executed against the app code.
 */

/**
 * Routes whose controller filters require a profile STATE (approved, deactivated or image-inappropriate). The filter
 * answers 401 (web) or 403 (V1) for any other state. Derived from the before_action filters of each route's controller
 * action. How the suite gets each state: suiteStateFor() below (only image_inappropriate still depends on M2Q-32).
 */
export const ROUTE_STATE: Record<string, { state: string; ref: string }> = {
  'API-030': { state: 'deactivated', ref: 'app/controllers/v1/users_controller.rb:7 (activate_user)' },
  'API-090': {
    state: 'image_inappropriate',
    ref: 'app/controllers/v1/images_controller.rb:5 (upload_images_v2)',
  },
  'API-116': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/invites_controller.rb:4 (list_all_requests)',
  },
  'API-117': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/invites_controller.rb:4 (accept_request_v1)',
  },
  'API-118': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/invites_controller.rb:4 (pass_request)',
  },
  'API-119': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/users_controller.rb:6 (profile_info)',
  },
  'API-120': { state: 'approved or deactivated', ref: 'app/controllers/web/users_controller.rb:6 (show)' },
  'API-121': { state: 'approved or deactivated', ref: 'app/controllers/web/users_controller.rb:6 (about)' },
  'API-122': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/users_controller.rb:6 (update_settings)',
  },
  'API-123': { state: 'approved', ref: 'app/controllers/web/users_controller.rb:5 (deactivate_user)' },
  'API-124': { state: 'deactivated', ref: 'app/controllers/web/users_controller.rb:7 (activate_user)' },
  'API-125': { state: 'approved', ref: 'app/controllers/web/like_controller.rb:4 (create)' },
  'API-126': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/like_controller.rb:5 (list_likes_received)',
  },
  'API-127': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/like_controller.rb:5 (pass_user)',
  },
  'API-128': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/like_controller.rb:5 (like_back)',
  },
  'API-130': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/users_controller.rb:6 (edit_profile)',
  },
  'API-132': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/messages_controller.rb:3 (connect_linked_users)',
  },
  'API-133': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/payment_controller.rb:3 (verify_razorpay_payment)',
  },
  'API-134': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/users_controller.rb:6 (update_location_coordinates)',
  },
  'API-188': {
    state: 'approved or deactivated',
    ref: 'app/controllers/web/messages_controller.rb:3 (create)',
  },
};

/**
 * How the suite obtains the state a ROUTE_STATE route needs (user decision 2026-10-24, from code — confirm with Dev):
 * - 'approved' (incl. "approved or deactivated"): a suite account that staging approved by itself — male synthetic
 *   accounts were auto-approved within ~1–2 min on 2026-10-24, 8–20 min in run qa-m2-20261024t134344; the suite
 *   waits up to 15 min from onboarding, otherwise Blocked M2Q-32.
 * - 'deactivated': a throwaway suite account deactivated with POST /V1/users/deactivate_user. The route is open to
 *   pending profiles (app/controllers/v1/users_controller.rb:3), but Profile#deactivate_profile only changes approved /
 *   pending / disapproved / vip_disapproved profiles (app/models/profile.rb:4583-4589) — so the account is approved
 *   first; re-activated before the clean-up delete.
 * - 'image_inappropriate': cannot be created safely → stays Blocked (M2Q-32).
 */
export type SuiteState = 'approved' | 'deactivated' | 'image_inappropriate';

export function suiteStateFor(apiId: string): SuiteState | undefined {
  const s = ROUTE_STATE[apiId]?.state;
  if (!s) return undefined;
  if (s.startsWith('approved')) return 'approved';
  if (s === 'deactivated') return 'deactivated';
  return 'image_inappropriate';
}

/**
 * Routes whose reply never contains ANOTHER member by design (user decision 2026-10-25, from code — confirm with Dev;
 * every one was Blocked "A not in reply" / "does not surface the writer" in run 2026-10-25). For them an EXPOSE case
 * ("A's email / phone not in B's reply") and an other-user CACHE case can never run in any environment, so they are
 * not generated (m2-baseline.ts). The case IDs are never reused (UT-M2-034). develop_new 944f76a.
 */
export const NO_OTHER_USER: Record<string, string> = {
  'API-004':
    'send_request_to_profile renders {status: true} only (app/controllers/v1/invites_controller.rb:168-171)',
  'API-009':
    'accept_request renders {status, conversation_id} only (app/controllers/v1/invites_controller.rb:150-153)',
  'API-010': 'pass_request renders {status: true} only (app/controllers/v1/invites_controller.rb:155-158)',
  'API-017':
    'meta_for_discover: the caller’s own meta; has_recommendation is always nil (app/models/profile.rb:5569-5573, 5619)',
  'API-018':
    'get_shareable_link renders {link, preview_text} — the preview names only the caller (app/models/profile_share_links.rb:29-46)',
  'API-021':
    'GET /V1/users/:ref ignores :ref and renders the caller’s own profile (app/controllers/v1/users_controller.rb:113-120 → profile.rb:2046)',
  'API-046': 'like#create renders {status: true} only (app/controllers/v1/like_controller.rb:8-15)',
  'API-050': 'pass_user renders {status: true} only (app/controllers/v1/like_controller.rb:28-35)',
  'API-051': 'like_back renders {status: true} only (app/controllers/v1/like_controller.rb:17-20)',
  'API-052':
    'like_without_deduction renders {status: true} only (app/controllers/v1/like_controller.rb:22-26)',
  'API-053': 'like_sent renders {status: true} only (app/controllers/v1/like_controller.rb:52-55)',
  'API-055': 'like_accept renders {status: true} only (app/controllers/v1/like_controller.rb:57-60)',
  'API-056': 'like_passed renders {status: true} only (app/controllers/v1/like_controller.rb:62-65)',
  'API-064': 'connect_linked_users renders {conversation_id} only (app/models/chat/conversation.rb:258-279)',
  'API-107':
    'live_audio#index: fetch_all_live_audios returns [] before any room is read, so the live lists are always empty (app/models/live_audio/room.rb:32-33, app/controllers/v1/live_audio_controller.rb:6-21)',
  'API-108': 'go_live renders the caller’s own room data only (app/models/live_audio/room.rb:64-75)',
  'API-117':
    'web accept_request_v1 renders {status: true} only (app/controllers/web/invites_controller.rb:11-14)',
  'API-118': 'web pass_request renders {status: true} only (app/controllers/web/invites_controller.rb:16-19)',
  'API-120':
    'GET /web/users/:ref ignores :ref and renders the caller’s own profile (app/controllers/web/users_controller.rb:14-17)',
  'API-125': 'web like#create renders {status: true} only (app/controllers/web/like_controller.rb:7-10)',
  'API-127': 'web pass_user renders {status: true} only (app/controllers/web/like_controller.rb:17-20)',
  'API-128': 'web like_back renders {status: true} only (app/controllers/web/like_controller.rb:12-15)',
  'API-132':
    'web connect_linked_users renders {conversation_id} only (app/models/chat/conversation.rb:258-279)',
  'API-187': 'messages#create renders {status: true} only (app/controllers/v1/messages_controller.rb:29-32)',
  'API-188':
    'web messages#create renders the result of send_message — nothing or a worker id (app/models/chat/conversation.rb:281-299)',
  'API-191':
    'test_profile_list renders a fixed sample (TestApi, app/models/test_api.rb:12-49) — never a suite account',
};

/**
 * Routes that only have an effect when the suite gives them an APPROVED account in the right state (item 4, user
 * decision 2026-10-25 — so contract recordings capture the real outcome, not a silent no-op). From code — confirm with
 * Dev (develop_new 944f76a):
 * - API-004: Chat::Request.send_request does nothing for a receiver that is not approved, of the same gender, already
 *   invited / connected, or when the sender has no daily requests left (app/models/chat/request.rb:182-194; the count
 *   is fetch_own_info daily_requests_left, app/models/account/timer.rb:146, 354-357, 375-378) → an approved caller with
 *   requests left and a fresh approved receiver of the opposite gender (no invite, like or connection between them).
 * - API-029: Profile#deactivate_profile acts only for approved / pending / disapproved / vip_disapproved profiles
 *   (app/models/profile.rb:4583-4589); a freshly onboarded account is pending_not_verified → an approved throwaway,
 *   re-activated afterwards with activate_user (profile.rb:4591-4603 restores "approved") so it can be re-used.
 * - API-123: web deactivate_user needs an approved profile (ROUTE_STATE) — same throwaway handling as API-029.
 */
export const APPROVED_FIRST: Record<string, string> = {
  'API-004':
    'approved caller with daily requests left and a fresh approved receiver (app/models/chat/request.rb:182-194)',
  'API-029':
    'approved throwaway — deactivate acts only on approved / pending profiles (app/models/profile.rb:4583-4589)',
  'API-123': 'approved throwaway (app/controllers/web/users_controller.rb:5)',
};

/** Deactivating routes: their throwaway is re-activated (activate_user) and re-used instead of a new one. */
export const DEACTIVATING = ['API-029', 'API-123'];

/** Pre-login routes whose request names a user: a brand-new account per case (is_new_user flow, never reset). */
export const FRESH_ACCOUNT = ['API-062'];

/**
 * Routes that answer the CALLER's own profile although their path carries a :ref (from code): their CACHE case is an
 * own-profile case — the writer reads them itself (user decision 2026-10-25).
 */
export const OWN_PROFILE_BY_REF = ['API-021', 'API-120'];

/**
 * First-name normalisation applied by Profile#assign_first_name (app/models/profile.rb:3137-3144, 6536-6540):
 * blank → no write; otherwise strip, and if the value contains any A–Z letter, drop every non A–Z character.
 * Returns undefined when the value would not be written.
 */
export function normalizeFirstName(value: string): string | undefined {
  const stripped = value.trim();
  if (!stripped) return undefined;
  const cleaned = stripped.replace(/[^A-Za-z]/g, '');
  return cleaned || stripped;
}

/** Display of a hidden first name to other users: its first letter, capitalised (profile.rb:3125-3133, 810-822). */
export const maskedFirstName = (fullName: string) => fullName.charAt(0).toUpperCase();
