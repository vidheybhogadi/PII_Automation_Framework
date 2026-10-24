/**
 * Builds the request of an inventory API from Dev's cURL example (m2/docs/aisle-pii-affected-apis.md):
 * JSON body (`--data-binary @- <<JSON … JSON` or `--data-binary '{}'`), GET query (`--data-urlencode "k=v"`) and
 * path ids. `$PLACEHOLDERS` are filled from the test's actors (USER_ID, REF, OTHER_REF, …: suite accounts only),
 * catalogue values (M2_VALUE_<NAME>, else config defaults checked live) and values the suite creates itself
 * (context.ts completeValues). Dev's sample personal data ("Asha", "asha@example.com",
 * sample phone numbers, sample chat text) is ALWAYS replaced by the run's synthetic values.
 *
 * A placeholder without a value makes the test Blocked with the question that would provide it — never guessed.
 */
import type { InventoryApi } from '../../scripts/m2-inventory';
import { blockPrereq } from '../prereq';

export type Values = Record<string, string | undefined>;

export interface BuiltRequest {
  body?: unknown;
  query?: Record<string, string>;
  pathParams: Record<string, string>;
}

/** Synthetic replacements for PII-bearing keys in Dev's examples. */
export interface Synthetic {
  firstName: string;
  email: string;
  freeText: string;
  /** The calling account's own number, if the request carries one. */
  mobileNumber?: string;
  /**
   * The calling account's own gender. Dev's sample "gender": "Female" (submit-profile bodies) is replaced by it, so
   * a profile never changes gender (photos must match the declared gender). Unknown → Dev's value is kept.
   */
  gender?: 'Male' | 'Female';
}

const ONBOARDING = [
  'FAITH_ID',
  'LANGUAGE_ID',
  'RELATIONSHIP_GOAL_ID',
  'PHOTO_URL_1',
  'PHOTO_URL_2',
  'PHOTO_ID_1',
  'PHOTO_ID_2',
  'SELFIE_URL',
  'INTEREST_ID',
  'INTEREST_V2_ID',
  'TRAIT_ID',
  'PREFERENCE_ID',
  'MBTI_ID',
  'AUDIO_QUESTION_ID',
  'AUDIO_URL',
  'QUESTION_ID',
  'POLL_OPTION_ID',
  'RESTAURANT_ID',
  'MEAL_TYPE_ID',
  'SETTLE_ID',
  'PUBLIC_USER_NAME',
  'DELETE_REASON_ID',
  'REPORT_OPTION_ID',
  'PHONE_CODE_ID',
  // ids that exist only between connected / matched accounts
  'REQUEST_ID',
  'CONVERSATION_ID',
  'EVENT_ID',
  'ROOM_ID',
  'MESSAGE_TIME_TOKEN',
  'ACTION_TIME_TOKEN',
  'REF',
  'OTHER_REF',
  'USER_ID',
  'OTHER_USER_ID',
];
const PROVIDER = [
  'PAYMENT_ID',
  'PRODUCT_ID',
  'APPLE_RECEIPT',
  'ORDER_ID',
  'PAYMENT_AMOUNT',
  'PAYTM_CHECKSUM',
  'PLAN_ID',
  'TRANSACTION_TOKEN',
  'PURCHASE_TOKEN',
  'PAYMENT_GATEWAY_ENUM',
  'SUBSCRIPTION_ID',
  'PHONEPE_RESPONSE_BASE64',
  'GOOGLE_RTDN_BASE64',
  'PUBSUB_MESSAGE_ID',
  'PUBSUB_SUBSCRIPTION',
  'APPLE_SIGNED_PAYLOAD',
];
const ADMIN = ['ADMIN_SESSION_COOKIE', 'REVIEW_ID', 'ADMIN_OTP'];
/** Ids only Dev can provide, and actions kept Blocked by the QA lead (selfie verification, moderation reports). */
const DEV_ONLY_VALUES = [
  'EVENT_ID',
  'POLL_OPTION_ID',
  'ROOM_ID',
  'RESTAURANT_ID',
  'MEAL_TYPE_ID',
  'SELFIE_URL',
  'REPORT_OPTION_ID',
];

/**
 * Keys added to a Dev request body because the controller reads them unconditionally (from code — confirm with Dev).
 * Added under `at` (a path of object keys) only when the key is not already there.
 */
export const BODY_ADDITIONS: Record<
  string,
  { at: string[]; add: Record<string, unknown>; evidence: string }
> = {
  'API-130': {
    at: ['data'],
    add: { user_interests: [] },
    evidence:
      'body adds "user_interests": [] — web/users_controller.rb:37 passes params["data"]["user_interests"] to Account::Interest.edit_interests (Aisle codebase, origin/develop_new; from code — confirm with Dev)',
  },
};

function addTo(body: unknown, at: string[], add: Record<string, unknown>): void {
  let node = body;
  for (const k of at) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    node = (node as Record<string, unknown>)[k];
  }
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  for (const [k, v] of Object.entries(add))
    if (!(k in (node as Record<string, unknown>))) (node as Record<string, unknown>)[k] = structuredClone(v);
}

/** Which open question provides a placeholder's value. */
export function questionFor(name: string): string {
  if (PROVIDER.includes(name)) return 'M2Q-17';
  if (ADMIN.includes(name)) return 'M2Q-04';
  if (DEV_ONLY_VALUES.includes(name)) return 'M2Q-45';
  if (ONBOARDING.includes(name)) return 'M2Q-36';
  return 'M2Q-36';
}

const PLACEHOLDER = /\$\{?([A-Z][A-Z0-9_]*)\}?/g;

/** Names of the $PLACEHOLDERS an API's Dev request (path, query, body) needs. */
export function placeholdersIn(api: Pick<InventoryApi, 'curl' | 'method' | 'path'>): string[] {
  const out = new Set<string>();
  for (const m of api.path.matchAll(/:([a-z_]+)/g)) out.add(m[1]!.toUpperCase());
  const { bodyText, query } = parseCurl(api);
  for (const [, v] of query) for (const m of v.matchAll(PLACEHOLDER)) out.add(m[1]!);
  if (bodyText !== undefined && api.method !== 'GET')
    for (const m of bodyText.matchAll(PLACEHOLDER)) out.add(m[1]!);
  return [...out];
}

/** The one cURL example of an API, split into body text, GET query pairs and whether it is a GET. */
export function parseCurl(api: Pick<InventoryApi, 'curl' | 'method'>): {
  bodyText?: string;
  query: [string, string][];
} {
  const curl = api.curl[0] ?? '';
  const heredoc = curl.match(/<<JSON\n([\s\S]*?)\nJSON/);
  const inline = curl.match(/--data-binary '([^']*)'/);
  const query = [...curl.matchAll(/--data-urlencode "([^=]+)=([^"]*)"/g)].map(
    (m) => [m[1]!, m[2]!] as [string, string],
  );
  return { bodyText: heredoc?.[1] ?? inline?.[1], query };
}

const SYNTH_KEYS: Record<string, keyof Synthetic> = {
  first_name: 'firstName',
  personal_email: 'email',
  email: 'email',
  email_id: 'email',
  text: 'freeText',
  previous_message: 'freeText',
  about: 'freeText',
  mobile_number: 'mobileNumber',
  phone_number: 'mobileNumber',
};

function synthesize(value: unknown, s: Synthetic, missing: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => synthesize(v, s, missing));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = SYNTH_KEYS[k];
    if (k === 'gender' && typeof v === 'string') out[k] = s.gender ?? v;
    else if (key && typeof v === 'string') {
      const replacement = s[key];
      if (replacement === undefined) missing.add(`synthetic ${k}`);
      out[k] = replacement ?? v;
    } else out[k] = synthesize(v, s, missing);
  }
  return out;
}

function fill(text: string, values: Values, missing: Set<string>): string {
  return text.replace(PLACEHOLDER, (m, name: string) => {
    const v = values[name];
    if (v === undefined) {
      missing.add(name);
      return m;
    }
    return v;
  });
}

/** Build the request; returns the names it could not fill (empty = complete). */
export function tryBuildRequest(
  api: Pick<InventoryApi, 'curl' | 'method' | 'path'> & { id?: string },
  values: Values,
  synthetic: Synthetic,
): { request: BuiltRequest; missing: string[] } {
  const missing = new Set<string>();
  const { bodyText, query } = parseCurl(api);
  const request: BuiltRequest = { pathParams: {} };
  for (const m of api.path.matchAll(/:([a-z_]+)/g)) {
    const name = m[1]!.toUpperCase();
    const v = values[name];
    if (v === undefined) missing.add(name);
    else request.pathParams[m[1]!] = v;
  }
  if (query.length) {
    request.query = {};
    for (const [k, v] of query) {
      const key = SYNTH_KEYS[k];
      request.query[k] = key && !v.startsWith('$') ? (synthetic[key] ?? v) : fill(v, values, missing);
    }
  }
  if (bodyText !== undefined && api.method !== 'GET') {
    // Quoted placeholders stay strings; bare ones (e.g. "height": $X) become JSON values.
    const filled = fill(bodyText, values, missing);
    if (missing.size === 0) {
      try {
        request.body = synthesize(JSON.parse(filled), synthetic, missing);
        const addition = api.id ? BODY_ADDITIONS[api.id] : undefined;
        if (addition) addTo(request.body, addition.at, addition.add);
      } catch {
        missing.add('Dev cURL body is not valid JSON after filling');
      }
    }
  }
  return { request, missing: [...missing] };
}

/** Build the request or block the test with the question that would provide the missing values. */
export function buildRequest(
  api: Pick<InventoryApi, 'id' | 'curl' | 'method' | 'path'>,
  values: Values,
  synthetic: Synthetic,
): BuiltRequest {
  const { request, missing } = tryBuildRequest(api, values, synthetic);
  if (missing.length) {
    const q = questionFor(missing.find((m) => /^[A-Z_]+$/.test(m)) ?? '');
    blockPrereq(
      q,
      `${api.id}: no value for ${missing.join(', ')} (Dev cURL placeholders — catalogue values: M2_VALUE_<NAME>; account ids only from the suite’s own accounts)`,
    );
  }
  return request;
}
