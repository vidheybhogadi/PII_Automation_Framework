/**
 * Exports the Aisle API documentation content from this repository's source documents. The API_Guide website covers
 * every Aisle Network app (Aisle, Arike, Neene, Neetho, Anbe, Jilebi, HeyDil — registry in its content/apps.json);
 * this repository's content is the Aisle app's, so it is written to the `aisle` folder only:
 *   - docs/API-Documentation.md                          the whole documentation as one Markdown file (kept here)
 *   - <guide repo>/content/apps/aisle/api-data.json      the same content as data, rendered by the website
 *   - <guide repo>/content/apps/aisle/API-Documentation.md  the same Markdown file, kept in the API_Guide repo too
 * Other apps' folders (written by other teams' agents) are never touched.
 *
 *   npm run docs:api                                   write docs/API-Documentation.md
 *   npm run docs:api -- --out <API_Guide clone>        also write the content into the API_Guide repo
 *   npm run docs:api:publish                           export into API_DOCS_REPO_DIR, build, commit and push
 *
 * The website itself (template, styles, browser script, build) lives in the API_Guide repo
 * (https://github.com/vidheybhogadi/API_Guide), which Netlify deploys on every push.
 *
 * Pure API documentation: what each endpoint is, how to call it, its end-to-end flow, the data it reads and writes and
 * what is good to know. No test cases, QA status or question IDs. Every fact comes from a source file in this
 * repository (Dev's API documents, the Milestone 1 facade collection, the PII DB schema) — nothing is typed per API.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ENDPOINTS } from '../../m1/src/clients/endpoints';
import { PII_INPUT } from '../../m2/scripts/m2-baseline';
import {
  actionOf,
  authLabel,
  FIELD_LABEL,
  groupOf,
  GROUPS,
  OBSERVED,
  operationOf,
  parseInventory,
  PII_FIELDS,
  scopeOf,
  type InventoryApi,
  type PiiField,
} from '../../m2/scripts/m2-inventory';

const ROOT = path.resolve(__dirname, '../..');
const MD_OUT = path.join(ROOT, 'docs/API-Documentation.md');
const BASE_URL = 'https://testa2.aisle.co';
/** The API_Guide folder this repository's content belongs to (an app id from API_Guide content/apps.json). */
const APP = 'aisle';
const TODAY = new Date().toISOString().slice(0, 10);

/** Remove internal QA references (question IDs) from source text before it reaches the docs. */
const clean = (s: string) =>
  s
    .replace(/\s*\((?:see )?(?:M2Q|BQ)-\d+(?:[,/ ]+(?:M2Q|BQ)?-?\d+)*\)/g, '')
    .replace(/\s*\b(?:M2Q|BQ)-\d+\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
const humanize = (s: string) =>
  s
    .replace(/[!?]/g, '')
    .replace(/[_/]+/g, ' ')
    .replace(/\btoogle\b/g, 'toggle')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

// ---- What the code-path steps mean (reading of Dev's method names) ------------------------------------------
const GLOSSARY: [RegExp, string, boolean][] = [
  [
    /^select_first_name$/,
    'Picks the first name to show to other people — respects the hide-name setting.',
    true,
  ],
  [
    /^get_first_name(_for_user)?$/,
    'Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.',
    true,
  ],
  [
    /^(get_first_names_for_users|hydrate_first_names!|Pii::FieldStore\.get_first_names)$/,
    'Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.',
    true,
  ],
  [/^hydrate_first_name!$/, 'Fills the first name into a cached profile response.', true],
  [/^get_multiple_cache_data$/, 'Loads many cached profile cards for a list.', false],
  [
    /^assign_first_name$/,
    'Normalises the name, writes it to the PII service (best effort) and sets the local field.',
    true,
  ],
  [
    /^(write_first_name|read_first_name)$/,
    'Writes / reads the first name directly in the PII service.',
    true,
  ],
  [
    /^(own_)?general_information$/,
    'Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).',
    false,
  ],
  [
    /^fetch_email$/,
    'Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.',
    true,
  ],
  [/^fetch_email_domain$/, 'Reads the email domain for the scammer check during moderation.', true],
  [
    /^(fetch_only_number|fetch_mobile_number|fetch_phone_number_for_user|fetch_full_phone_number_for_user|fetch_only_number_with_phone_code_name)$/,
    'Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.',
    true,
  ],
  [
    /^write_pii_phone_number_for_user$/,
    'Writes the national phone number to the PII service — only when a new user is created.',
    true,
  ],
  [
    /^Account::Email\.add_email\/search_user_ids$/,
    'Links the onboarding email to the user (only when the user has none yet).',
    true,
  ],
  [/^(own_detailed_v1|own_detailed_web|own_profile_web)$/, 'The owner’s full profile response.', false],
  [
    /^(detailed_for_admin|admin_complete_details|profile_response_cms|Profile\.get_specific_user_for_admin)$/,
    'Admin (CMS) view of a profile.',
    false,
  ],
  [
    /^(fill_cache!|create_profile_response|create_cache_response|profile_details)$/,
    'Rebuilds or reads the cached profile response.',
    false,
  ],
  [
    /^(fill_conversation_cache!|create_cached_response|fetch_cached_conversations)$/,
    'Rebuilds or reads the chat conversation cache.',
    false,
  ],
  [/^fill_room_cache!$/, 'Rebuilds the live-audio room cache.', false],
  [/^sync_profile_to_kafka$/, 'Publishes the updated profile to Kafka (only in some states).', false],
  [
    /^(send_for_aws_moderation|check_for_scammer_before_moderation!)$/,
    'Content moderation and scammer check (only in some states).',
    false,
  ],
  [
    /^activate_any_subscription(_with_expiry)?$/,
    'Activates a subscription after a successful payment.',
    false,
  ],
  [/Worker/, 'Background job: runs after the request has returned.', false],
  [/^PiiTestController$/, 'PII test-route controller (TEST_TOKEN).', false],
  [/^ProxyClient$/, 'Signs the request and forwards it to the PII service; skips the app’s caches.', true],
];
const explain = (fn: string) => {
  const hit = GLOSSARY.find(([re]) => re.test(fn));
  return { explain: hit?.[1] ?? '', pii: hit?.[2] ?? /pii|first_name|email|number|phone/i.test(fn) };
};

const GROUP_INFO: Record<string, { name: string; blurb: string }> = {
  G1: {
    name: 'First-name service routes',
    blurb: 'Read and write first names directly in the PII service (test token).',
  },
  G2: {
    name: 'Sign-up, login & account',
    blurb:
      'Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.',
  },
  G3: { name: 'Profiles', blurb: 'Return one profile — your own or another member’s.' },
  G4: {
    name: 'Lists & discovery',
    blurb: 'Return lists of profiles, requests, likes, chats or events, with a first name per row.',
  },
  G5: {
    name: 'Interactions, chat & live audio',
    blurb: 'Likes, invites, accept / pass, reports, messages, calls and live audio.',
  },
  G6: { name: 'Profile updates', blurb: 'Update part of your own profile and return or re-cache it.' },
  G7: {
    name: 'Payments — checkout',
    blurb:
      'Start a payment: the provider’s customer details (name, email, phone) are built from personal data.',
  },
  G8: {
    name: 'Payments — verification',
    blurb: 'Verify or restore a payment; on success the profile cache is rebuilt.',
  },
  G9: {
    name: 'Provider callbacks',
    blurb: 'Called by outside providers (PhonePe, Google Play, Apple, Pusher) — no user login.',
  },
  G10: {
    name: 'CMS / admin',
    blurb: 'Admin views, edits, search, curation, reviews, member activity and exports.',
  },
  M1: {
    name: 'PII service (direct)',
    blurb:
      'Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.',
  },
};

const GATES: Record<PiiField, [string, string]> = {
  NAME: [
    'ALLOW_PII_FIRST_NAME_READ',
    'On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both.',
  ],
  EMAIL: [
    'ALLOW_PII_EMAIL_READ',
    'Needs a local email_id first. On: read from the PII service. Onboarding is the only email write.',
  ],
  PHONE: [
    'ALLOW_PII_PHONE_NUMBER_READ',
    'On: national number from the PII service plus the local country code. Only a new user’s first login writes it.',
  ],
  FREE_TEXT: ['—', 'Encrypted by Aisle with a key from the PII service; there is no read switch.'],
};

const LIMITS: Record<string, string> = {
  'API-060':
    'The phone is written to the PII service only when a new user is created; returning logins do not re-sync it.',
  'API-062': 'Returning logins do not re-sync the phone to the PII service.',
  'API-139':
    'Admin phone edits change only the local number. The PII service keeps the old phone, which is shown when the phone switch is on.',
  'API-140':
    'Admin phone edits change only the local number. The PII service keeps the old phone, which is shown when the phone switch is on.',
  'API-198': 'Copies local fields to a new user but does not create PII-service records for it.',
  'API-160':
    'First-name and email filters use PII-service search even when the read switches are off; phone search still uses the local table.',
  'API-178':
    'Filters first names locally but shows the PII-service name in the results, so the two can differ.',
  'API-186': 'The response leaves out the first name, although it is loaded internally.',
  'API-208':
    'The Dev inventory lists this route without an action; staging does answer it (see the observed behaviour).',
  'API-187':
    'Messages are saved by a background job (ChatMessageWorker), so a message can take a moment to appear.',
};

// ---- Milestone 1 sources ------------------------------------------------------------------------------------
function m1Curls(): string[] {
  return readFileSync(path.join(ROOT, 'm1/docs/aisle-api.md'), 'utf8')
    .split('```')
    .filter((_, i) => i % 2 === 1)
    .map((b) => b.replace(/^[a-z]*\n/, '').trimEnd())
    .filter((b) => b.includes('curl'));
}
const pathRe = (p: string) =>
  new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{field\\}', '[A-Z_]+')}$`);
const gk = (a: InventoryApi) => (a.id.startsWith('M1-') ? 'M1' : groupOf(a.id).key);

// ---- Per-endpoint content ---------------------------------------------------------------------------------
const WRITE_RE = /assign_first_name|write_first_name|write_pii_phone|add_email|encrypts/;
function fieldOps(a: InventoryApi): [PiiField, 'reads' | 'writes'][] {
  return a.fields.map((f) => {
    const acc = a.access[f] ?? '';
    const writes =
      (PII_INPUT[a.id] ?? []).includes(f) ||
      WRITE_RE.test(acc) ||
      (a.id === 'API-199' && f !== 'FREE_TEXT') ||
      (f === 'FREE_TEXT' && /free-text\/keys(\/revoke)?$/.test(a.path));
    return [f, writes ? 'writes' : 'reads'];
  });
}
function callerOf(a: InventoryApi): string {
  const g = gk(a);
  if (a.id === 'API-060' || a.id === 'API-062') return 'Mobile app (before login)';
  if (g === 'G9') return 'Outside provider (callback)';
  if (a.auth.includes('ADMIN_SESSION_COOKIE')) return 'CMS (browser session)';
  if (a.auth.includes('ADMIN_TOKEN')) return 'CMS admin panel';
  if (a.auth.includes('INFOEDGE_PROFILE_API_TOKEN')) return 'Partner system (InfoEdge)';
  if (a.auth.includes('TEST_TOKEN')) return 'Internal / test tooling';
  if (a.auth.includes('WEB_TOKEN') || a.path.startsWith('/web/')) return 'Web app';
  return 'Mobile app';
}
function nameOf(a: InventoryApi): string {
  const action = actionOf(a);
  const generic =
    /^(create|index|show|update|search|save|vote|about)$/.test(action) ||
    /[.:]/.test(action) ||
    gk(a) === 'M1';
  const fromPath = a.path
    .split('/')
    .filter((p) => p && p !== 'V1' && p !== 'api' && p !== 'v1' && p !== 'pii-test')
    .slice(-2)
    .join(' ')
    .replace(/:ref\b/, 'by ref')
    .replace(/:user_id\b/, 'by user id');
  return humanize(generic ? fromPath || 'PII service' : action);
}
function summaryOf(a: InventoryApi): string[] {
  const g = gk(a);
  const ops = fieldOps(a);
  const parts = [`**${nameOf(a)}.** ${GROUP_INFO[g]!.blurb}`];
  if (ops.length)
    parts.push(
      `Personal data: ${ops.map(([f, op]) => `${FIELD_LABEL[f]} (${op})`).join(', ')}${
        g === 'M1' ? ', directly in the PII service.' : ', through the app’s PII integration.'
      }`,
    );
  else parts.push('It does not read or write personal data itself.');
  if (!a.id.startsWith('M1-') && scopeOf(a).includes('conditional'))
    parts.push(
      'The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.',
    );
  return parts;
}
const HEADER_WHY: Record<string, string> = {
  authorization: 'The credential this route needs.',
  accept: 'Ask for JSON.',
  'content-type': 'JSON body.',
  device_type: 'Mobile client details the app routes expect.',
  app_version: 'Mobile client details the app routes expect.',
  unique_identifier: 'Mobile client details the app routes expect.',
  webcms: 'Marks a CMS web request (admin token from an OTP-verified admin).',
  cookie: 'Admin browser session for legacy CMS pages.',
  'x-verify': 'Provider signature — must be the genuine value.',
  'x-csrf-token': 'Browser-session CSRF token, when required.',
};
function headersOf(curl: string[]): [string, string, string][] {
  const seen = new Map<string, [string, string, string]>();
  for (const c of curl)
    for (const m of c.matchAll(/--header "([^:"]+):\s*([^"]*)"/g)) {
      const k = m[1]!.trim().toLowerCase();
      if (!seen.has(k))
        seen.set(k, [m[1]!.trim(), m[2]!.trim(), HEADER_WHY[k] ?? 'As in the example request.']);
    }
  return [...seen.values()];
}
function flowsOf(a: InventoryApi) {
  const byPath = new Map<string, PiiField[]>();
  for (const f of a.fields) {
    const p = a.access[f] ?? '';
    byPath.set(p, [...(byPath.get(p) ?? []), f]);
  }
  if (!a.fields.length && a.access.FREE_TEXT) byPath.set(a.access.FREE_TEXT, []);
  return [...byPath.entries()].map(([p, fields]) => {
    const ft = p.startsWith('Free-text encryption');
    const steps = ft
      ? [
          {
            fn: 'Request with free text',
            explain: clean(p.replace(/^Free-text encryption \([^)]*\):\s*/, '')),
            pii: true,
          },
          {
            fn: 'PII service — free-text key',
            explain:
              'Aisle creates or fetches an AES-256-GCM key; the text itself never goes to the PII service.',
            pii: true,
          },
          {
            fn: 'Aisle encrypts / decrypts the text',
            explain: 'The encrypted text and its key_id are kept in the app database.',
            pii: true,
          },
        ]
      : p.split(' → ').map((fn) => ({ fn: fn.trim(), ...explain(fn.trim()) }));
    return { fields, label: ft ? 'Free-text encryption' : 'Code path', steps };
  });
}
interface StoreRow {
  store: string;
  object: string;
  access: string;
  what: string;
}
const LEGACY: Record<Exclude<PiiField, 'FREE_TEXT'>, [string, string]> = {
  NAME: [
    'profiles.first_name',
    'Local copy: read when the name switch is off; written alongside every name write.',
  ],
  EMAIL: [
    'account_emails.name (via profiles.email_id)',
    'Local copy; the email_id link must exist before the PII service is read.',
  ],
  PHONE: [
    'sms_notification_phone_numbers.number (via users.phone_number_id)',
    'Local copy; the country code always comes from here.',
  ],
};
function storesOf(a: InventoryApi): StoreRow[] {
  const g = gk(a);
  const rows: StoreRow[] = [];
  const all = Object.values(a.access).join(' ');
  for (const [f, op] of fieldOps(a)) {
    if (f === 'FREE_TEXT') {
      rows.push({
        store: 'PII database',
        object: 'free_text_encryption_key',
        access: op === 'writes' ? 'read / write' : 'read',
        what:
          op === 'writes'
            ? 'Creates or fetches the key that encrypts the text.'
            : 'Fetches the key to decrypt the text.',
      });
      if (g !== 'M1')
        rows.push({
          store: 'App database',
          object: 'encrypted text + key_id',
          access: op,
          what: op === 'writes' ? 'Stores the encrypted text.' : 'Loads the encrypted text.',
        });
      continue;
    }
    rows.push({
      store: 'PII database',
      object: `user_pii_field_value (field_name = ${f})`,
      access: op === 'writes' ? 'write (upsert)' : 'read',
      what:
        op === 'writes'
          ? 'One encrypted row per user and field; a new value replaces the old one.'
          : g === 'M1'
            ? 'Decrypted by the PII service and returned.'
            : `Read and decrypted when ${GATES[f][0]} is on.`,
    });
    if (g !== 'M1')
      rows.push({
        store: 'App database',
        object: LEGACY[f][0],
        access: op === 'writes' && f === 'NAME' ? 'read / write' : 'read',
        what: LEGACY[f][1],
      });
  }
  if (
    /fill_cache!|create_profile_response|create_cache_response|profile_details|hydrate_first|get_multiple_cache_data/.test(
      all,
    )
  )
    rows.push({
      store: 'Cache',
      object: 'Profile cache',
      access: 'read / rebuild',
      what: 'Cached profile cards carry the first name.',
    });
  if (/fill_conversation_cache!|create_cached_response|fetch_cached_conversations/.test(all))
    rows.push({
      store: 'Cache',
      object: 'Conversation cache',
      access: 'read / rebuild',
      what: 'Cached chat rows carry the other person’s name.',
    });
  if (/fill_room_cache!/.test(all))
    rows.push({
      store: 'Cache',
      object: 'Live-audio room cache',
      access: 'rebuild',
      what: 'Room and speaker names.',
    });
  if (/sync_profile_to_kafka/.test(all))
    rows.push({
      store: 'Kafka',
      object: 'Profile sync event',
      access: 'publish',
      what: 'Sent only in some states; the payload is built with personal data.',
    });
  const worker = all.match(/[A-Za-z:]+Worker/);
  if (worker)
    rows.push({
      store: 'Background job',
      object: worker[0],
      access: 'async',
      what: 'Runs after the request has returned.',
    });
  const providers = [
    [/cashfree/i, 'Cashfree'],
    [/payu/i, 'PayU'],
    [/phone_pay/i, 'PhonePe'],
    [/razorpay/i, 'Razorpay'],
    [/paytm/i, 'Paytm'],
    [/apple|ios_payment|restore_ios/i, 'Apple'],
    [/googleplay|android/i, 'Google Play'],
    [/pusher/i, 'Pusher'],
    [/Sms|send_web_purchase_link/, 'SMS provider'],
  ] as const;
  for (const [re, name] of providers)
    if (re.test(`${a.path} ${all}`))
      rows.push({
        store: 'Outside provider',
        object: name,
        access: g === 'G9' ? 'calls in' : 'called',
        what: 'The payload can carry name, email or phone.',
      });
  if (rows.some((r) => r.store === 'PII database'))
    rows.push({
      store: 'Audit log',
      object: 'audit_trails (MongoDB)',
      access: 'write',
      what: 'The PII service records one entry per call, without personal values.',
    });
  if (!rows.length)
    rows.push({
      store: '—',
      object: '—',
      access: '—',
      what: 'No data store with personal data is involved.',
    });
  return rows;
}
function notesOf(a: InventoryApi) {
  const notes: { title: string; text: string; warn?: boolean }[] = [];
  if (a.notes) notes.push({ title: 'From the developers', text: clean(a.notes) });
  if (OBSERVED[a.id]) notes.push({ title: 'Observed on staging', text: clean(OBSERVED[a.id]!) });
  if (LIMITS[a.id]) notes.push({ title: 'Known limitation', text: LIMITS[a.id]!, warn: true });
  if (a.id >= 'API-199' && a.id <= 'API-207')
    notes.push({
      title: 'Tip',
      text: 'Writes through these routes go straight to the PII service and skip the app’s caches — app screens can keep showing the old value until the cache expires.',
      warn: true,
    });
  return notes;
}

// ---- Build ------------------------------------------------------------------------------------------------
function build() {
  const inventory = parseInventory(ROOT);
  const curls = m1Curls();
  const extras: InventoryApi[] = Object.values(ENDPOINTS)
    .filter((e) => !inventory.some((a) => a.method === e.method && pathRe(`/V1${e.path}`).test(a.path)))
    .map((e) => ({
      id: `M1-${e.key}`,
      method: e.method,
      path: `/V1${e.path}`,
      fields: /free-text/.test(e.path) ? (['FREE_TEXT'] as PiiField[]) : [],
      access: { FREE_TEXT: `Free-text encryption (PII service): ${humanize(e.key)}` },
      auth: ['TEST_TOKEN'],
      notes: '',
      requestKeys: /revoke|read/.test(e.path) ? ['key_id'] : [],
      headers: [],
      curl: [],
      source: 'PII service route (Aisle facade)',
    }));
  const all = [...inventory, ...extras];
  const bySource = new Map<string, string[]>();
  for (const a of all) {
    const file = a.source.split(';')[0]!.trim();
    if (file) bySource.set(file, [...(bySource.get(file) ?? []), a.id.toLowerCase()]);
  }
  const apis = all.map((a) => {
    const g = gk(a);
    const facade = a.path.replace(/^\/V1/, '');
    const curl = (a.curl.length ? a.curl : curls.filter((c) => c.includes(`${facade}"`)).slice(0, 1)).map(
      (c) => c.replace(/\$\{AISLE_BASE_URL\}/g, `${BASE_URL}/V1`).replace(/\$\{BASE_URL\}/g, BASE_URL),
    );
    const file = a.source.split(';')[0]!.trim();
    const name = nameOf(a);
    return {
      slug: a.id.toLowerCase(),
      id: a.id,
      method: a.method,
      path: a.path,
      group: g,
      name,
      fields: a.fields,
      auth: a.id.startsWith('M1-')
        ? 'TEST_TOKEN (Bearer)'
        : authLabel(a).replace('None (provider/webhook)', 'None — provider signature'),
      caller: callerOf(a),
      operation: a.id.startsWith('M1-')
        ? 'PII service (direct)'
        : operationOf(a).replace(' (M1)', ' (direct)'),
      source: a.source,
      summary: summaryOf(a),
      headers: headersOf(curl),
      keys: a.requestKeys,
      curl,
      flows: flowsOf(a),
      gates: a.fields.map((f) => [f, GATES[f][0], GATES[f][1]]),
      stores: storesOf(a),
      notes: notesOf(a),
      related: (bySource.get(file) ?? []).filter((s) => s !== a.id.toLowerCase()).slice(0, 24),
      search:
        `${a.method} ${a.path} ${name} ${actionOf(a)} ${a.fields.map((f) => FIELD_LABEL[f]).join(' ')} ${callerOf(a)}`.toLowerCase(),
    };
  });
  const groups = GROUPS.map((g) => ({
    key: g.key,
    name: GROUP_INFO[g.key]!.name,
    title: GROUP_INFO[g.key]!.name,
    blurb: GROUP_INFO[g.key]!.blurb,
    slugs: apis.filter((a) => a.group === g.key).map((a) => a.slug),
  }));
  return { apis, groups };
}
type Built = ReturnType<typeof build>;

// ---- Guides (structured content: rendered to HTML by the website and to Markdown here) -----------------------
// Inline text may use `code`, **bold** and [text](#slug) links — both renderers support exactly these.
type Block =
  | { p: string }
  | { ol: string[] }
  | { ul: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { note: { title: string; text: string; warn?: boolean } }
  | { arch: { title: string; lines: string[]; key?: boolean }[] };
interface Section {
  label: string;
  title: string;
  blocks: Block[];
}
interface Guide {
  slug: string;
  title: string;
  lede: string;
  sections: Section[];
}

function guides(data: Built): Guide[] {
  const { apis } = data;
  const n = (pred: (a: Built['apis'][number]) => boolean) => apis.filter(pred).length;
  return [
    {
      slug: 'architecture',
      title: 'How a request travels',
      lede: 'Aisle is a Rails app with three front doors — the mobile app, the web app and the CMS — plus callbacks from outside providers. Personal data lives in a separate PII service that the app reaches through its PII integration.',
      sections: [
        {
          label: 'Big picture',
          title: 'The pieces',
          blocks: [
            {
              arch: [
                {
                  title: 'Callers',
                  lines: ['Mobile app `/V1/…`', 'Web `/web/…`', 'CMS `/admin/…`', 'Providers (callbacks)'],
                },
                {
                  title: 'Aisle Rails app',
                  lines: [
                    'Controllers → models → responses',
                    'Caches: profile, chat, rooms',
                    'Kafka sync, background jobs',
                  ],
                },
                {
                  title: 'PII integration',
                  lines: ['Read switch per field', '`Pii::FieldStore`, `ProxyClient`', 'Signs every call'],
                  key: true,
                },
                {
                  title: 'PII service',
                  lines: ['Encrypts and decrypts', 'PII database (PostgreSQL)', 'Audit log (MongoDB)'],
                },
              ],
            },
          ],
        },
        {
          label: 'Step by step',
          title: 'One request, end to end',
          blocks: [
            {
              ol: [
                'A caller sends a request with its credential: user token, web token, CMS admin token, test token or a provider signature.',
                'The Rails controller runs its normal logic. Its action is the first step of every flow on an endpoint page.',
                'When the response or action needs a name, email or phone, the model asks the PII integration. With the field’s read switch on, the value comes from the PII service; with it off, from the local column.',
                'Writes (sign-up, name edit, admin edit, a new user’s phone login) go to the PII service and to the local column. A failed PII write is logged and the request still succeeds.',
                'Free text (chat messages, bio) works differently: Aisle gets a key from the PII service, encrypts the text itself and stores it with the key_id in the app database.',
                'The PII service records an audit entry for every call.',
              ],
            },
          ],
        },
        {
          label: 'Direct routes',
          title: 'Two families of service routes',
          blocks: [
            {
              table: {
                head: ['Routes', 'Purpose', 'Good to know'],
                rows: [
                  [
                    '`/V1/api/v1/pii-test/*`',
                    'Save, read, search and bulk-read personal data directly in the PII service; temporary phones; free-text keys.',
                    'Skips the app’s caches.',
                  ],
                  [
                    '`/V1/pii_integration/*`',
                    'First names through the app’s own logic: single, batch and by profile ref.',
                    'Uses the same test token.',
                  ],
                ],
              },
            },
          ],
        },
      ],
    },
    {
      slug: 'authentication',
      title: 'Authentication',
      lede: `Every route needs a credential. All examples use staging (\`${BASE_URL}\`) and placeholders such as \`\${USER_TOKEN}\` — real tokens live in your local .env and are never pasted into documents, tickets or chats.`,
      sections: [
        {
          label: 'Credentials',
          title: 'Which credential a route needs',
          blocks: [
            {
              table: {
                head: ['Credential', 'Used by', 'How to get it'],
                rows: [
                  [
                    'User token (JWT)',
                    `${n((a) => a.auth.includes('User JWT'))} mobile-app endpoints`,
                    'Log in with a phone number (below); the login response carries the token.',
                  ],
                  ['Web token (JWT)', 'Web endpoints that need it', 'Web login with the same account.'],
                  [
                    'TEST_TOKEN',
                    'PII service routes (`/V1/api/v1/pii-test/*`, `/V1/pii_integration/*`)',
                    'Shared test token from the team’s secret store.',
                  ],
                  [
                    'CMS admin token + `webcms: true`',
                    `${n((a) => a.auth.includes('CMS admin'))} CMS endpoints`,
                    'An OTP-verified admin with permission for the action.',
                  ],
                  [
                    'Admin browser session',
                    'Legacy `/users/*` pages and the IRL admin page',
                    'Log in to the CMS in a browser.',
                  ],
                  [
                    'Provider signature',
                    'Payment and Pusher callbacks',
                    'Genuine sandbox payloads from the provider.',
                  ],
                ],
              },
            },
          ],
        },
        {
          label: 'Staging logins',
          title: 'Test phone numbers',
          blocks: [
            {
              note: {
                title: 'Staging only',
                text: 'Use a +91 number that starts with **10** (for example 1012345678); the OTP is **1234**. Do not use the **106** series (1060000000–1069999999) — it is reserved by the team. Numbers starting with 10 are not valid Indian mobile numbers, so they never belong to a real person.',
              },
            },
            {
              ol: [
                'Request an OTP: `POST /V1/sessions/login_with_phone_number` with the +91 phone code id and the number.',
                'Verify: `POST /V1/sessions/verify_number_login_v1` with `"otp": "1234"`. A new number creates a new user.',
                'Send the mobile headers on app calls: `device_type`, `app_version`, `unique_identifier`.',
              ],
            },
          ],
        },
        {
          label: 'Headers',
          title: 'Common headers',
          blocks: [
            {
              table: {
                head: ['Header', 'Purpose'],
                rows: Object.entries(HEADER_WHY).map(([k, v]) => [`\`${k}\``, v]),
              },
            },
          ],
        },
      ],
    },
    {
      slug: 'personal-data',
      title: 'Personal data',
      lede: 'Four kinds of personal data pass through these endpoints. Each has its own read switch, write paths and fallbacks.',
      sections: [
        {
          label: 'Fields',
          title: 'Fields and read switches',
          blocks: [
            {
              table: {
                head: ['Field', 'Endpoints', 'Read switch', 'Behaviour'],
                rows: PII_FIELDS.map((f) => [
                  FIELD_LABEL[f],
                  String(n((a) => a.fields.includes(f))),
                  `\`${GATES[f][0]}\``,
                  GATES[f][1],
                ]),
              },
            },
          ],
        },
        {
          label: 'Rules',
          title: 'Good to know',
          blocks: [
            {
              ul: [
                'A read switch is on only when its value is `true` or the string `"true"`.',
                'With a switch on, the app does not fall back to the local value when the PII service has none — profiles that were never migrated show an empty field.',
                'Lists keep an already-cached first name when the PII service returns nothing, so a list and a profile page can differ.',
                'A failed PII write is logged and the request still succeeds, so a success response does not prove the PII write worked.',
                'Writes through the direct PII routes skip the app’s caches.',
                'Admin phone edits, returning logins and profile resets do not update the PII-service copy.',
              ],
            },
          ],
        },
        {
          label: 'Writes',
          title: 'Where personal data is written',
          blocks: [
            {
              table: {
                head: ['Endpoint', 'Writes'],
                rows: Object.entries(PII_INPUT)
                  .map(([id, fs]) => {
                    const a = apis.find((x) => x.id === id);
                    return a
                      ? [`[\`${a.method} ${a.path}\`](#${a.slug})`, fs.map((f) => FIELD_LABEL[f]).join(', ')]
                      : null;
                  })
                  .filter((r): r is string[] => r !== null),
              },
            },
          ],
        },
      ],
    },
    {
      slug: 'data-stores',
      title: 'Where the data lives',
      lede: 'Personal data sits in the PII service’s own database. The app database still keeps local copies until migration finishes, and free text is stored there encrypted.',
      sections: [
        {
          label: 'PII database',
          title: 'PostgreSQL “pii”',
          blocks: [
            {
              table: {
                head: ['Table', 'What it holds', 'Key columns'],
                rows: [
                  [
                    '`user_pii_field_value`',
                    'One encrypted value per user and field (NAME, EMAIL, PHONE). A new value replaces the old row.',
                    '`tenant_id, user_id, field_name, ciphertext, nonce, auth_tag, key_version, lookup_token, aad_version, created_at, updated_at`',
                  ],
                  [
                    '`free_text_encryption_key`',
                    'Keys Aisle uses to encrypt free text. The text itself is not here.',
                    '`key_id, tenant_id, service_id, status, encrypted_key, created_at, revoked_at`',
                  ],
                  ['`pii_key_registry`', 'Master-key versions; one is active.', '`key_version, status`'],
                  ['`transient_phone`', 'Temporary phone numbers before they are promoted.', '—'],
                  [
                    '`pii_field_catalog` · `pii_service_field_access` · `pii_calling_service`',
                    'Which fields exist and which callers may read, write, bulk-read or search them.',
                    '—',
                  ],
                ],
              },
            },
            {
              p: 'Encrypted values use AES-256-GCM: a 12-byte nonce, a 16-byte tag and the key version needed to decrypt them. lookup_token is a fingerprint used by search (email and phone only).',
            },
          ],
        },
        {
          label: 'App database',
          title: 'Local copies in aisleweb',
          blocks: [
            {
              table: {
                head: ['Field', 'Table.column', 'Linked from'],
                rows: [
                  ['First name', '`profiles.first_name`', '—'],
                  ['Email', '`account_emails.name`', '`profiles.email_id`'],
                  ['Phone', '`sms_notification_phone_numbers.number`', '`users.phone_number_id`'],
                  ['Free text', 'Encrypted text + key_id', 'The message or profile it belongs to'],
                ],
              },
            },
          ],
        },
        {
          label: 'Elsewhere',
          title: 'Caches, events and logs',
          blocks: [
            {
              table: {
                head: ['Store', 'What'],
                rows: [
                  ['Audit log — MongoDB `audit_trails`', 'One entry per PII-service call, kept for 7 days.'],
                  ['Caches', 'Profile cards, chat conversations and live-audio rooms.'],
                  ['Kafka', 'Profile sync events sent by many profile updates.'],
                  ['Background jobs', 'Chat message saving, SMS and email sending.'],
                ],
              },
            },
          ],
        },
      ],
    },
    {
      slug: 'glossary',
      title: 'Glossary',
      lede: 'The step names you see in an endpoint’s “End-to-end flow”, in plain words.',
      sections: [
        {
          label: 'Steps',
          title: 'Code-path steps',
          blocks: [
            {
              table: {
                head: ['Step', 'What it does', 'Personal data'],
                rows: GLOSSARY.map(([re, text, pii]) => [
                  `\`${re.source.replace(/^\^|\$$/g, '').replace(/\\/g, '')}\``,
                  text,
                  pii ? 'Yes' : '—',
                ]),
              },
            },
          ],
        },
      ],
    },
  ];
}

// ---- Markdown --------------------------------------------------------------------------------------------
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const mdTable = (head: string[], rows: string[][]) =>
  [
    `| ${head.map(cell).join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');
function mdBlock(b: Block): string {
  if ('p' in b) return b.p;
  if ('ol' in b) return b.ol.map((x, i) => `${i + 1}. ${x}`).join('\n');
  if ('ul' in b) return b.ul.map((x) => `- ${x}`).join('\n');
  if ('table' in b) return mdTable(b.table.head, b.table.rows);
  if ('note' in b) return `> **${b.note.title}.** ${b.note.text}`;
  return b.arch.map((x, i) => `${i + 1}. **${x.title}** — ${x.lines.join('; ')}`).join('\n');
}
function markdown(data: Built, gs: Guide[]) {
  const { apis, groups } = data;
  const out: string[] = [
    '<!-- GENERATED FILE — do not edit by hand. Source: PII_Automation_Framework scripts/api-docs/export.ts · `npm run docs:api` -->',
    '',
    '# Aisle API Documentation',
    '',
    `Every Aisle API: what it does, how to call it, the path a request takes through the code, and which data it reads and writes. ${apis.length} endpoints · staging \`${BASE_URL}\` · generated ${TODAY}.`,
    '',
    'The same content is published as a website from the [API_Guide](https://github.com/vidheybhogadi/API_Guide) repository.',
    '',
    '## Contents',
    '',
    '- Guides: ' + gs.map((g) => `[${g.title}](#${g.slug})`).join(' · '),
    ...groups.map((g) => `- [${g.name}](#area-${g.key.toLowerCase()}) — ${g.slugs.length} endpoints`),
    '',
  ];
  for (const g of gs) {
    out.push(`<a id="${g.slug}"></a>`, '', `## ${g.title}`, '', g.lede, '');
    for (const s of g.sections) {
      out.push(`### ${s.title}`, '');
      for (const b of s.blocks) out.push(mdBlock(b), '');
    }
  }
  out.push('## Endpoints', '');
  for (const g of groups) {
    out.push(
      `<a id="area-${g.key.toLowerCase()}"></a>`,
      '',
      `### ${g.name}`,
      '',
      `${g.blurb} ${g.slugs.length} endpoints.`,
      '',
    );
    out.push(
      mdTable(
        ['Method', 'Path', 'What it is'],
        g.slugs.map((s) => {
          const a = apis.find((x) => x.slug === s)!;
          return [a.method, `[\`${a.path}\`](#${a.slug})`, a.name];
        }),
      ),
      '',
    );
    for (const s of g.slugs) {
      const a = apis.find((x) => x.slug === s)!;
      out.push(`<a id="${a.slug}"></a>`, '', `#### \`${a.method} ${a.path}\` — ${a.name}`, '');
      out.push(...a.summary.map((p) => `${p}\n`));
      out.push(
        `**Called by** ${a.caller} · **Auth** ${a.auth} · **Operation** ${a.operation}${
          a.source ? ` · **Code** \`${a.source}\`` : ''
        }`,
        '',
      );
      out.push('**Request**', '');
      out.push(`Request fields: ${a.keys.length ? a.keys.map((k) => `\`${k}\``).join(', ') : 'none'}`, '');
      for (const c of a.curl) out.push('```bash', c, '```', '');
      out.push('**End-to-end flow**', '');
      for (const l of a.flows) {
        if (l.fields.length) out.push(`_${l.label} — ${l.fields.map((f) => FIELD_LABEL[f]).join(', ')}_`, '');
        out.push(
          l.steps.map((st, i) => `${i + 1}. \`${st.fn}\`${st.explain ? ` — ${st.explain}` : ''}`).join('\n'),
          '',
        );
      }
      if (a.gates.length)
        out.push(
          '**Read switches**',
          '',
          mdTable(
            ['Field', 'Read switch', 'Behaviour'],
            a.gates.map(([f, s2, b]) => [FIELD_LABEL[f as PiiField], `\`${String(s2)}\``, String(b)]),
          ),
          '',
        );
      out.push(
        '**What it reads and writes**',
        '',
        mdTable(
          ['Store', 'Object', 'Access'],
          a.stores.map((r) => [r.store, `\`${r.object}\``, r.access]),
        ),
        '',
      );
      if (a.notes.length)
        out.push('**Good to know**', '', a.notes.map((x) => `- **${x.title}:** ${x.text}`).join('\n'), '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

// ---- Main -------------------------------------------------------------------------------------------------
function main() {
  const data = build();
  const gs = guides(data);
  const md = markdown(data, gs);
  writeFileSync(MD_OUT, md);
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : undefined;
  if (out) {
    const dir = path.join(out, 'content/apps', APP);
    mkdirSync(dir, { recursive: true });
    const content = {
      meta: { app: APP, generated: TODAY, baseUrl: BASE_URL, endpoints: data.apis.length },
      fieldLabels: FIELD_LABEL,
      fields: PII_FIELDS,
      groups: data.groups,
      guides: gs,
      apis: data.apis,
    };
    writeFileSync(path.join(dir, 'api-data.json'), `${JSON.stringify(content, null, 1)}\n`);
    writeFileSync(path.join(dir, 'API-Documentation.md'), md);
  }
  console.log(
    `API docs: ${path.relative(ROOT, MD_OUT)} — ${data.apis.length} endpoints${out ? ` · content written to ${out}` : ''}`,
  );
}

main();
