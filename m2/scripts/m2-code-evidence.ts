/**
 * Facts taken from the Aisle app source (read-only clone, branch develop_new @ 944f76a, which contains the inventory
 * snapshot ae838f4). Every entry cites file:line. "From code — confirm with Dev": staging observations win where
 * they differ. Nothing here is executed against the app code.
 */

/**
 * Routes whose controller filters require a profile STATE that QA cannot create (an approved, deactivated or
 * image-inappropriate profile). The filter answers 401 (web) or 403 (V1) for any other state, so these cases depend
 * on M2Q-32 (special account states). Derived from the before_action filters of each route's controller action.
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
