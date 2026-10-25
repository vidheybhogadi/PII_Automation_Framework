/**
 * Making the writer A visible to the reader B for the EXPOSE / CACHE cases of list routes (item 2, user decision
 * 2026-10-25). Root cause of "A not in reply": A and B were the suite's CONNECTED pair (mutual like), and a connection
 * removes A from B's likes / invite / discover lists. So each list route gets its own A, and the relationship that
 * puts A in that list is created right before the read — from the Aisle code (develop_new 944f76a, from code —
 * confirm with Dev):
 *   - invite lists (005, 116 all_requests; 006 list_comments_with_pagination; 007 / 008 list_comments_and_likes /
 *     list_request_and_likes): a pending invite A → B from an approved opposite-gender account that never invited,
 *     liked or connected with B, with a non-empty reply_message (chat/request.rb:182-192, 782-816, 885-888);
 *   - likes received (048 list_likes_received_v1, 126 web list_likes_received, 054 like_received): A likes B
 *     (non-mutual, like_without_deduction — no daily like limit), B never likes back (user_like.rb:557-641,
 *     1052-1066, 1294-1330);
 *   - 047 list_request_sent: B likes an approved account it has no history with (user_like.rb:486-509);
 *   - 049 list_all_passed: B passes (tab "discover") an approved account that never liked / invited B
 *     (user_pass.rb:42-48, 156-158);
 *   - 069 chat_messages: in the connected pair, A sends a chat message and B reads with a cursor in the future
 *     (messages are saved asynchronously by ChatMessageWorker — polled, chat/conversation.rb:281-299);
 *   - 016 discover_profile_list_v2: a share link for A (get_shareable_link) and B opens it with ?ps=
 *     (users_controller.rb:47-80, profile_share_links.rb:49-145; B may re-open its own link);
 *   - 014 / 015 / 019 / 020 (matches v2 / v3, concierge, top matches): no relationship decides them, so A is a suite
 *     account that already appears in B's reply (medium confidence) — none → Blocked with that reason.
 * Every other route keeps the connected pair. The suite's own synthetic accounts only (+91 10…, never 106…).
 */
import type { ApiResponse } from '../../../core/http/api-response';
import type { InventoryApi } from '../../scripts/m2-inventory';
import { extendTestTimeout, type Accounts, type Profile } from '../accounts/accounts';
import { AUTH } from '../auth/credentials';
import { blockPrereq, PREREQ } from '../prereq';
import { apiById } from '../design';
import { completeValues, send, syntheticFor, valuesFor, type Caller, type CheckFixtures } from './context';
import { buildRequest } from './request-builder';
import { mentionsAccount } from './verdicts';

/** The writer A as the checks need it: a full session when A must write (CACHE), otherwise its known values. */
export type Writer =
  Profile | (Pick<Profile, 'mobileNumber' | 'ref' | 'userId' | 'known'> & { token?: never });

export interface Visible {
  a: Writer;
  b: Profile;
  /** B's read of the route (with whatever the relationship needs, e.g. ?ps= or a chat cursor). */
  read: (reader: Caller) => Promise<ApiResponse>;
  /** Value-free note of how A was made visible (evidence). */
  how: string;
}

export const INVITE_LISTS = ['API-005', 'API-006', 'API-007', 'API-008', 'API-116'];
export const LIKES_RECEIVED = ['API-048', 'API-054', 'API-126'];
export const LIKE_SENT = ['API-047'];
export const PASSED = ['API-049'];
export const CHAT_READ = ['API-069'];
export const SHARE_LINK = ['API-016'];
export const DISCOVERED = ['API-014', 'API-015', 'API-019', 'API-020'];

/** Every route with its own visibility setup (the rest uses the connected pair). */
export const VISIBILITY_ROUTES = [
  ...INVITE_LISTS,
  ...LIKES_RECEIVED,
  ...LIKE_SENT,
  ...PASSED,
  ...CHAT_READ,
  ...SHARE_LINK,
  ...DISCOVERED,
];

/** Per worker: the relationship made for a purpose is re-used by the route's other cases (EXPOSE and CACHE). */
const made = new WeakMap<Accounts, Map<string, Promise<Profile>>>();
function once(accounts: Accounts, key: string, make: () => Promise<Profile>): Promise<Profile> {
  let m = made.get(accounts);
  if (!m) made.set(accounts, (m = new Map()));
  let p = m.get(key);
  if (!p) {
    p = make();
    m.set(key, p);
    const pending = p;
    pending.catch(() => {
      if (m!.get(key) === pending) m!.delete(key);
    });
  }
  return p;
}

const asCaller = (fx: CheckFixtures, self: Profile, other?: Profile, label = 'user'): Caller => ({
  label,
  auth: AUTH.user(self.token),
  device: self.device,
  session: self,
  values: valuesFor(fx.m2Config, self, other),
});

/** Send `apiId` as `from` towards `to` (its OTHER_REF), Dev request shape — e.g. a like or a pass. */
async function act(fx: CheckFixtures, apiId: string, from: Profile, to: Profile, what: string) {
  const res = await send(apiById(apiId), fx, asCaller(fx, from, to), {
    values: { OTHER_REF: to.ref, OTHER_USER_ID: to.userId },
    retry: false,
  });
  fx.observe(what, res);
  if (res.status < 200 || res.status >= 300)
    blockPrereq(PREREQ.connected.id, `${what} failed (HTTP ${res.status}) — A cannot be made visible to B`);
  return res;
}

/** B's plain read of the route (Dev request with B's values; OTHER_* = A). */
const plainRead = (api: InventoryApi, fx: CheckFixtures, a: Writer) => (reader: Caller) =>
  send(api, fx, reader, { values: { OTHER_REF: a.ref, OTHER_USER_ID: a.userId } });

/** The run-pool account that already appears in `body` (not `self`), preferring this worker's own slot. */
function discovered(accounts: Accounts, body: unknown, self: Profile, writable: boolean) {
  return accounts
    .poolAccounts()
    .filter((e) => e.mobileNumber !== self.mobileNumber && (!writable || e.ownSlot))
    .sort((x, y) => Number(y.ownSlot) - Number(x.ownSlot))
    .find((e) => mentionsAccount(body, { ref: e.ref }));
}

/**
 * A (writer) and B (reader) for `api`, with the relationship that shows A in B's reply already created.
 * `writable`: A must be able to change its own name (CACHE) — then A is always a full session of this worker.
 */
export async function visiblePair(api: InventoryApi, fx: CheckFixtures, writable: boolean): Promise<Visible> {
  const acc = fx.accounts;
  // profiles_voted lists who voted on a poll: A only appears after voting on a poll option only Dev can provide
  // (POLL_OPTION_ID for advertisement/vote, M2Q-45) — kept Blocked (user decision 2026-10-25).
  if (api.id === 'API-106')
    blockPrereq(
      'M2Q-45',
      `${api.id}: A appears only after voting on a poll — needs a poll option id from Dev (M2Q-45)`,
    );
  if (INVITE_LISTS.includes(api.id)) {
    // Receiver: approved male account 0; sender: an approved female suite account (Accounts.pendingInvite).
    const b = await acc.approved(0);
    const { sender } = await acc.pendingInvite(b);
    return {
      a: sender,
      b,
      read: plainRead(api, fx, sender),
      how: 'A sent B a pending invite with a reply message (send_request_to_profile)',
    };
  }
  if (LIKES_RECEIVED.includes(api.id)) {
    const b = await acc.approved(2);
    const a = await once(acc, `liked:${b.mobileNumber}`, async () => {
      const p = await acc.partner(b, 'likes received');
      await act(fx, 'API-052', p, b, 'A likes B (like_without_deduction)');
      return p;
    });
    return { a, b, read: plainRead(api, fx, a), how: 'A liked B (non-mutual, like_without_deduction)' };
  }
  if (LIKE_SENT.includes(api.id)) {
    const b = await acc.approved(2);
    const a = await once(acc, `like-sent:${b.mobileNumber}`, async () => {
      const p = await acc.partner(b, 'like sent');
      await act(fx, 'API-052', b, p, 'B likes A (like_without_deduction)');
      return p;
    });
    return {
      a,
      b,
      read: plainRead(api, fx, a),
      how: 'B liked A, an approved account with no history with B',
    };
  }
  if (PASSED.includes(api.id)) {
    const b = await acc.approved(0);
    const a = await once(acc, `passed:${b.mobileNumber}`, async () => {
      const p = await acc.partner(b, 'passed');
      await act(fx, 'API-050', b, p, 'B passes A (pass_user, tab discover)');
      return p;
    });
    return { a, b, read: plainRead(api, fx, a), how: 'B passed A (tab discover); A never liked / invited B' };
  }
  if (CHAT_READ.includes(api.id)) {
    const [a, b] = await acc.connectedPair();
    const sent = await send(apiById('API-187'), fx, asCaller(fx, a, b), {
      values: { OTHER_REF: b.ref },
      synthetic: { freeText: `FT_${fx.m2Config.runId} visible to B` },
      retry: false,
    });
    fx.observe('A sends B a chat message (messages/send)', sent);
    const read = async (reader: Caller) => {
      const values = await completeValues(api, fx, b, { ...reader.values });
      const body = (buildRequest(api, values, syntheticFor(fx, b)).body ?? {}) as Record<string, unknown>;
      // chat_messages lists messages OLDER than created_at (chat/message.rb:47, 57): a cursor 5 min ahead.
      body.created_at = new Date(Date.now() + 5 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      body.page = 1;
      return send(api, fx, { ...reader, values }, { body });
    };
    return {
      a,
      b,
      // Saved asynchronously (ChatMessageWorker): the first read is polled for up to 30 s until A shows.
      read: pollUntil(read, (res) => mentionsAccount(res.isJson ? res.json() : undefined, a), 30_000),
      how: 'A sent B a chat message in their conversation (read with a cursor 5 min ahead)',
    };
  }
  if (SHARE_LINK.includes(api.id)) {
    // B (female account 1) opens a share link for A (male account 2) made by the suite's account 0.
    const b = await acc.onboarded(1);
    const a = await acc.onboarded(2);
    const recommender = await acc.onboarded(0);
    const link = await send(apiById('API-018'), fx, asCaller(fx, recommender, a), {
      values: { OTHER_REF: a.ref },
    });
    fx.observe('share link for A (get_shareable_link)', link);
    const raw = (link.json() as { link?: unknown } | undefined)?.link;
    const ps = typeof raw === 'string' ? (raw.split('ps=')[1] ?? '').split('&')[0] : '';
    if (!ps)
      blockPrereq(
        PREREQ.connected.id,
        `${api.id}: no share-link token for A (get_shareable_link HTTP ${link.status}) — A cannot be shown to B`,
      );
    acc.addOwnedId(ps);
    const read = async (reader: Caller) => {
      const query = { ...(buildRequest(api, reader.values, syntheticFor(fx, b)).query ?? {}), ps };
      return send(api, fx, reader, { query });
    };
    return { a, b, read, how: 'B opened a share link for A (?ps=, profile sharing)' };
  }
  if (DISCOVERED.includes(api.id)) {
    const b = await acc.onboarded(1);
    const probe = await send(api, fx, asCaller(fx, b, undefined, 'user B'));
    fx.observe(`${api.id} as B (which suite account is listed)`, probe);
    const e = discovered(acc, probe.isJson ? probe.json() : undefined, b, writable);
    if (!e)
      blockPrereq(
        PREREQ.connected.id,
        `${api.id}: no suite account appears in B’s reply (HTTP ${probe.status}) — this list is decided by the matching algorithm, not by an action the suite can take (M2Q-32)`,
      );
    const a: Writer | undefined = writable
      ? await acc.loginPoolAccount(e)
      : { mobileNumber: e.mobileNumber, ref: e.ref, userId: undefined, known: e.known };
    if (!a)
      blockPrereq(PREREQ.connected.id, `${api.id}: the listed suite account can no longer be logged into`);
    return {
      a,
      b,
      read: plainRead(api, fx, a),
      how: `A is a suite account (${e.label}) that B’s reply already lists`,
    };
  }
  const [a, b] = await acc.connectedPair();
  return { a, b, read: plainRead(api, fx, a), how: 'A and B are the suite’s connected pair' };
}

/** The first call of `read` is repeated (every 3 s, up to `ms`) until `ok` holds; later calls read once. */
function pollUntil(
  read: (reader: Caller) => Promise<ApiResponse>,
  ok: (res: ApiResponse) => boolean,
  ms: number,
): (reader: Caller) => Promise<ApiResponse> {
  let first = true;
  return async (reader) => {
    if (!first) return read(reader);
    first = false;
    extendTestTimeout(ms + 15_000); // the poll gets its own time on top of the test's
    const start = Date.now();
    for (;;) {
      const res = await read(reader);
      if (ok(res) || Date.now() - start >= ms) return res;
      await new Promise((r) => setTimeout(r, 3_000));
    }
  };
}
