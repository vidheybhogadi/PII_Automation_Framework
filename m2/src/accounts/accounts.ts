/**
 * Synthetic accounts for M2 tests (one pool per Playwright worker).
 *
 * - newUser(role): a NEW (onboarding-stage) account via phone login. Only when M2_CREATE_ACCOUNTS=true; otherwise
 *   the test is Blocked. Pooled: one account per role ("A", "B", …) per worker, reused by its tests.
 * - onboarded(i): a finished profile — Dev-provided (M2_ONBOARDED_ACCOUNTS) or, with M2_CREATE_ACCOUNTS=true,
 *   created and onboarded by the suite (m2/src/accounts/onboarding.ts). Its profile_state is re-checked every time
 *   it is handed out: image_inappropriate / disabled (moderation, open sub-question of M2Q-36) → Blocked.
 * - connectedPair() / trio(): two matched profiles (M2_CONNECTED_ACCOUNTS) — matching needs approved, discoverable
 *   profiles (M2Q-32), so without them the test is Blocked.
 * - web() / admin(): true web JWT (payment routes, M2Q-17) and CMS admin (M2Q-04) are not available → Blocked.
 * - throwaway(key): a suite account onboarded only for one API's destructive / profile-submit cases (shared by that
 *   API's cases in this worker, replaced once consumed); approved(i) waits for staging's auto-approval;
 *   deactivated(key) deactivates a throwaway itself; suitePair() connects accounts 0 and 1 by a mutual like.
 *
 * Ledger: every number the suite creates is written to reports/m2/accounts/<run>-w<n>.json (git-ignored: full
 * synthetic number, app user id, ref, device id, stage, profile state, deletion outcome — never tokens) BEFORE any
 * call is made. At the end every created account is deleted (POST /V1/user/delete {id: ref, reason_id: 1}); a
 * never-onboarded account is onboarded first so that it can be deleted; "disabled" profiles are marked unusable.
 * Dev-provided accounts are never deleted.
 */
import { test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ApiResponse } from '../../../core/http/api-response';
import type { Logger } from '../../../core/utils/logger';
import { registerSecretValue } from '../../../core/utils/redaction';
import { AUTH } from '../auth/credentials';
import { field, SessionHelper, USER_TOKEN_PLACEHOLDER, type UserSession } from '../auth/session';
import type { ExtraRoute } from '../clients/m2-client';
import { isAllowedTestNumber } from '../auth/test-phone';
import type { M2Config } from '../config/m2-config';
import { ROOT } from '../design';
import { blockPrereq, PREREQ } from '../prereq';
import { onboard, ownState, UNUSABLE_STATES } from './onboarding';

export interface Profile extends UserSession {
  /** Profile ref (from the verify reply or the own-profile read). */
  readonly ref: string | undefined;
  /** Declared gender (suite-onboarded: as onboarded; Dev-provided: from the own-profile read). */
  readonly gender?: 'Male' | 'Female' | undefined;
  /** The fake first name and email the suite onboarded it with (unknown for Dev-provided accounts). */
  readonly known?: { firstName: string; email: string } | undefined;
}

/** Gender of suite-onboarded account i: index 1 (user B / "other") is Female, every other index Male (2026-10-24). */
export const genderOf = (i: number): 'Male' | 'Female' => (i === 1 ? 'Female' : 'Male');

export interface LedgerEntry {
  mobileNumber: string;
  deviceId: string;
  createdAt: string;
  userId?: string | undefined;
  ref?: string | undefined;
  applicationStage?: string | undefined;
  profileState?: string | undefined;
  onboarded?: boolean;
  deleted: boolean | null;
  deleteStatus: number | null;
  /** True when the profile cannot be used or deleted any more (e.g. "disabled"). */
  unusable?: boolean;
  /** For an accepted login variant: the national test number used to log in again for clean-up. */
  cleanupNumber?: string;
  /** True when no account was ever created for this entry (e.g. a wrong-OTP login that issued no token). */
  neverCreated?: boolean;
  /** Why the clean-up could not delete this (existing) account — counted as "left behind (real)". */
  leftBehindReason?: string;
  note?: string;
}

/** Outcome of a ledger clean-up (counts only — never numbers). */
export interface CleanupResult {
  deleted: number;
  /** Accounts that exist and could not be deleted, with the reason counts. */
  leftBehind: number;
  leftBehindReasons: Record<string, number>;
  /** Entries for which no account was ever created (wrong-OTP checks, refused login variants). */
  neverCreated: number;
  alreadyDeleted: number;
  unusable: number;
}

/** Raise the running test's timeout by `ms` (no-op outside a test or when the test has no timeout). */
export function extendTestTimeout(ms: number): void {
  try {
    const info = test.info();
    if (info.timeout > 0) info.setTimeout(info.timeout + ms);
  } catch {
    // not inside a test (e.g. global teardown)
  }
}

export const ACCOUNTS_DIR = 'reports/m2/accounts';

/** First string value under a key named "ref" anywhere in a JSON body. */
function findRef(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (k === 'ref' && (typeof v === 'string' || typeof v === 'number')) return String(v);
    const inner = findRef(v);
    if (inner) return inner;
  }
  return undefined;
}

const ok = (r: ApiResponse) => r.status >= 200 && r.status < 300;

/** Routes that delete the calling account (a throwaway used by them is gone afterwards). */
export const DELETING_APIS = ['API-059', 'API-131', 'API-196', 'API-197'];

/** Margin on top of M2_APPROVAL_WAIT_MS for the rest of a test that waits for approval. */
export const APPROVAL_TIMEOUT_MARGIN_MS = 60_000;
/** Extra test time when a consumed throwaway account is replaced by a newly onboarded one. */
export const THROWAWAY_TIMEOUT_MS = 60_000;

/** POST /V1/users/upload_audio_url (not in the Dev inventory; config/routes.rb:107, from code). */
export const UPLOAD_AUDIO: ExtraRoute = {
  key: 'uploadAudioUrl',
  method: 'POST',
  path: '/V1/users/upload_audio_url',
  headers: ['Accept', 'device_type', 'app_version', 'unique_identifier'],
};

/** About one second of SILENT MPEG-1 Layer III audio (40 frames, 128 kbps, 44.1 kHz) — generated, no voice. */
export function silentMp3(): Buffer {
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x64]);
  return Buffer.concat(Array.from({ length: 40 }, () => frame));
}

/** First value under `key` anywhere in a JSON body. */
function deepGet(body: unknown, key: string): unknown {
  if (!body || typeof body !== 'object') return undefined;
  if (!Array.isArray(body) && key in (body as Record<string, unknown>))
    return (body as Record<string, unknown>)[key];
  for (const v of Object.values(body as Record<string, unknown>)) {
    const found = deepGet(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Objects anywhere in a body that satisfy `match`. */
function itemsWith(
  body: unknown,
  match: (o: Record<string, unknown>) => boolean,
  out: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (Array.isArray(body)) body.forEach((b) => itemsWith(b, match, out));
  else if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (match(o)) out.push(o);
    Object.values(o).forEach((v) => itemsWith(v, match, out));
  }
  return out;
}

/**
 * The fake first name and email a suite-onboarded account i gets (deterministic per run, so a worker restarted in
 * the same run knows them too). Dev-provided accounts (M2_ONBOARDED_ACCOUNTS) have no known values.
 */
export function onboardingValues(runId: string, i: number): { firstName: string; email: string } {
  const domain = (process.env.AISLE_TEST_EMAIL_DOMAIN || 'example.test').toLowerCase();
  return {
    firstName: `Qa${runId.slice(-4).replace(/\d/g, (d) => String.fromCharCode(97 + Number(d)))}${'abcdefghij'[i % 10]}`,
    email: `${runId}-${i}@${domain}`,
  };
}

export class Accounts {
  readonly sessions: SessionHelper;
  private readonly pool = new Map<string, UserSession>();
  private readonly profiles = new Map<string, Profile>();
  /** Latest session of every account this worker created (for clean-up). */
  private readonly own = new Map<string, UserSession>();
  private readonly ledger: LedgerEntry[] = [];
  private readonly ledgerFile: string;
  /** Throwaway accounts per key (API id) in this worker. */
  private readonly throwaways = new Map<string, Profile>();
  /** Ids the suite's own accounts created (conversation, request, photo ids) — allowed in requests. */
  private readonly ownedIds = new Set<string>();
  /** approval wait results per account number (true = approved, false = not approved in time). */
  private readonly approval = new Map<string, boolean>();
  private pair: Promise<{ a: Profile; b: Profile; conversationId: string }> | undefined;
  private readonly audio = new Map<string, string>();

  constructor(
    private readonly config: M2Config,
    private readonly log: Logger,
    workerIndex: number,
    /**
     * Playwright parallel slot (0 … workers-1). The run pool is namespaced by it, so tests in parallel workers never
     * share — and never concurrently rename — the same account; a worker restarted in the same slot re-uses its accounts.
     */
    private readonly slot = 0,
  ) {
    this.sessions = new SessionHelper(config, log, workerIndex);
    this.ledgerFile = path.join(ROOT, ACCOUNTS_DIR, `${config.runId}-w${workerIndex}.json`);
  }

  /** True when onboarded account i is created by the suite (its onboarding values are known), not Dev-provided. */
  isOwnOnboarded(i: number): boolean {
    return !this.config.onboardedNumbers[i];
  }

  get canCreate(): boolean {
    return this.config.createAccounts;
  }

  /** Block unless account creation is switched on. */
  requireCreate(): void {
    if (!this.config.createAccounts) blockPrereq(PREREQ.createAccounts.id, PREREQ.createAccounts.reason);
  }

  /** A NEW (onboarding-stage) account for a role, created once per worker and reused. */
  async newUser(role = 'A'): Promise<UserSession> {
    const pooled = this.pool.get(role);
    if (pooled) return pooled;
    this.requireCreate();
    // A worker restarted after a failure re-uses the run's account for this role (log in again, never re-create).
    const known = readRunPool(this.config.runId).roles[`${this.slot}:${role}`];
    const s = known
      ? await this.sessions.loginWithNumber(known.mobileNumber, known.deviceId)
      : await this.freshUser();
    if (!known)
      writeRunPool(
        this.config.runId,
        (p) =>
          (p.roles[`${this.slot}:${role}`] = {
            mobileNumber: s.mobileNumber,
            deviceId: s.device.uniqueIdentifier,
          }),
      );
    this.pool.set(role, s);
    return s;
  }

  /** A brand-new account every call. The number is in the ledger before the first request. */
  async freshUser(): Promise<UserSession> {
    this.requireCreate();
    const { mobileNumber, deviceId } = this.sessions.nextNumber();
    const entry = this.record({ mobileNumber, deviceId });
    const s = await this.sessions.loginWithNumber(mobileNumber, deviceId);
    Object.assign(entry, { userId: s.userId, ref: s.ref, applicationStage: s.applicationStage });
    this.own.set(mobileNumber, s);
    this.flush();
    return s;
  }

  /**
   * Try a login with a raw (possibly formatted / invalid) number. If staging accepts it, the issued token is
   * registered as a secret at once and the account goes into the ledger, so nothing is left untracked.
   */
  async loginVariant(raw: string, label: string): Promise<{ otp: ApiResponse; verify: ApiResponse }> {
    this.requireCreate();
    const deviceId = `${this.config.runId}-variant-${label}`;
    const entry = this.record({ mobileNumber: raw, deviceId, note: 'login variant' });
    const device = this.sessions.device(deviceId);
    const otp = await this.sessions.requestOtp(raw, device);
    const verify = await this.sessions.verify(raw, '1234', device);
    const token = field(verify.json(), 'auth_token');
    if (typeof token === 'string') {
      registerSecretValue(token, USER_TOKEN_PLACEHOLDER);
      const national = raw.replace(/\D/g, '').slice(-10);
      Object.assign(entry, {
        ...(isAllowedTestNumber(national) ? { cleanupNumber: national } : {}),
        userId: String(field(verify.json(), 'id') ?? ''),
        note: 'login variant ACCEPTED',
      });
    } else Object.assign(entry, { deleted: true, note: 'login variant refused — no account created' });
    this.flush();
    return { otp, verify };
  }

  /** Put a number in the ledger before a test sends it (e.g. a wrong-OTP login that must not create an account). */
  track(mobileNumber: string, deviceId: string, note: string): LedgerEntry {
    return this.record({ mobileNumber, deviceId, note });
  }

  /** No account was created for this entry (e.g. the wrong OTP issued no token): never logged into, never cleaned up. */
  markNeverCreated(entry: LedgerEntry, why: string): void {
    Object.assign(entry, { neverCreated: true, note: `${entry.note ?? ''} (${why})`.trim() });
    this.flush();
  }

  /**
   * A deleting route answered 2xx for suite account `s`: confirm with its OLD token (own profile no longer readable —
   * no new login, which would create a new account) and record the deletion in the ledger.
   */
  async recordDeletedBy(s: UserSession, apiId: string, status: number): Promise<void> {
    const entry = this.ledger.find((e) => e.mobileNumber === s.mobileNumber);
    if (!entry || entry.deleted === true) return;
    const st = await ownState(this.sessions, s);
    if (st.status === 200) return; // still readable: not deleted, the clean-up handles it
    Object.assign(entry, {
      deleted: true,
      deleteStatus: status,
      note: `${entry.note ?? ''} (deleted by its ${apiId} test: HTTP ${status}; own profile HTTP ${st.status} afterwards)`.trim(),
    });
    this.own.delete(s.mobileNumber);
    this.flush();
  }

  /** Log into an account again (returning login) — same number, same device. */
  async returningLogin(s: UserSession): Promise<UserSession> {
    const again = await this.sessions.loginWithNumber(s.mobileNumber, s.device.uniqueIdentifier);
    if (this.own.has(s.mobileNumber)) this.own.set(s.mobileNumber, again);
    return again;
  }

  /**
   * The i-th onboarded profile: Dev-provided (M2_ONBOARDED_ACCOUNTS) or, with M2_CREATE_ACCOUNTS=true, created and
   * onboarded by the suite (pooled per index). Its profile_state is re-checked before it is handed out.
   */
  async onboarded(i = 0): Promise<Profile> {
    const provided = this.config.onboardedNumbers[i];
    const p = provided ? await this.profileFor(provided, `onboarded-${i}`) : await this.ownOnboarded(i);
    await this.requireActive(p, `onboarded-${i}`);
    return p;
  }

  /**
   * A brand-new suite account, onboarded now through the verified onboarding flow (M2Q-36 answer) with the given
   * fake first name and email — the onboarding submit_profile is the write under test. Not pooled; deleted at the
   * end of the run like every account the suite creates. Onboarding failure → Blocked (M2Q-36), never a failure.
   */
  async onboardFresh(
    values: { firstName: string; email: string },
    gender: 'Male' | 'Female' = 'Male',
  ): Promise<Profile> {
    const fresh = await this.freshUser();
    const entry = this.ledger.find((e) => e.mobileNumber === fresh.mobileNumber)!;
    let done;
    try {
      done = await onboard(this.sessions, this.config, fresh, { ...values, gender });
    } catch (e) {
      Object.assign(entry, { note: `onboarding failed: ${(e as Error).message}` });
      this.flush();
      return blockPrereq(
        PREREQ.onboarding.id,
        `Onboarding a synthetic account failed — ${(e as Error).message}`,
      );
    }
    this.own.set(fresh.mobileNumber, done.session);
    const p: Profile = { ...done.session, ref: done.ref ?? fresh.ref, gender, known: values };
    Object.assign(entry, {
      onboarded: true,
      ref: p.ref,
      applicationStage: 'completed',
      profileState: done.profileState,
    });
    this.flush();
    await this.requireActive(p, 'onboarded-fresh');
    return p;
  }

  /**
   * A throwaway suite account for `key` (an API id): onboarded now with known fake values and used only by that
   * API's cases in this worker (destructive and profile-submit routes never touch the pooled accounts). Re-used while
   * it is still a normal active profile; once a case consumed it (deleted, reset or deactivated) a new one is made.
   * `keepDeactivated` re-uses a deactivated one (deactivated-state routes).
   */
  async throwaway(key: string, opts: { keepDeactivated?: boolean } = {}): Promise<Profile> {
    const cached = this.throwaways.get(key);
    if (cached) {
      const st = await ownState(this.sessions, cached);
      const usable =
        st.status === 200 &&
        !(st.profileState && UNUSABLE_STATES.includes(st.profileState)) &&
        (opts.keepDeactivated || st.profileState !== 'deactivated');
      if (usable) return cached;
      // A new account is onboarded below: give the test time for it.
      extendTestTimeout(THROWAWAY_TIMEOUT_MS);
      const entry = this.ledger.find((e) => e.mobileNumber === cached.mobileNumber);
      if (entry) {
        entry.profileState = st.profileState ?? entry.profileState;
        if (entry.deleted === true) {
          // already recorded from the deleting route's own reply (recordDeletedBy)
        } else if (st.status !== 200 && DELETING_APIS.some((d) => key.startsWith(d))) {
          // Deleted by its own test: never log in to this number again (that would create a new account).
          Object.assign(entry, { deleted: true, note: `deleted by its ${key} test` });
        } else entry.note = `consumed by its ${key} test (state ${st.profileState ?? `HTTP ${st.status}`})`;
        this.flush();
      }
    }
    const n = this.throwaways.size;
    const values = {
      firstName: onboardingValues(this.config.runId, 10 + n).firstName,
      email: `${this.config.runId}-t${this.slot}-${n}@${(process.env.AISLE_TEST_EMAIL_DOMAIN || 'example.test').toLowerCase()}`,
    };
    const p = await this.onboardFresh(values, 'Male');
    const entry = this.ledger.find((e) => e.mobileNumber === p.mobileNumber);
    if (entry) entry.note = `throwaway for ${key}`;
    this.flush();
    this.throwaways.set(key, p);
    return p;
  }

  /**
   * Wait for staging's automatic approval of `p` (male synthetic accounts went pending_not_verified → approved within
   * ~1–2 min on 2026-10-24). Polls every 10 s up to M2_APPROVAL_WAIT_MS (default 3 min); not approved → Blocked M2Q-32.
   * The outcome is remembered per account, so a worker waits at most once per account.
   */
  async waitApproved(p: Profile, key: string): Promise<Profile> {
    const known = this.approval.get(p.mobileNumber);
    if (known === false)
      blockPrereq(PREREQ.approval.id, `${key}: ${PREREQ.approval.reason} (already waited in this worker)`);
    if (known) return p;
    // The wait itself can take up to M2_APPROVAL_WAIT_MS: the test gets that time plus a margin for its own calls.
    extendTestTimeout(this.config.approvalWaitMs + APPROVAL_TIMEOUT_MARGIN_MS);
    const start = Date.now();
    let state: string | undefined;
    for (;;) {
      const st = await ownState(this.sessions, p);
      state = st.profileState;
      if (state === 'approved') break;
      if (state && UNUSABLE_STATES.includes(state)) break;
      if (Date.now() - start >= this.config.approvalWaitMs) break;
      await new Promise((r) => setTimeout(r, 10_000));
    }
    const entry = this.ledger.find((e) => e.mobileNumber === p.mobileNumber);
    if (entry) {
      entry.profileState = state ?? entry.profileState;
      this.flush();
    }
    this.approval.set(p.mobileNumber, state === 'approved');
    if (state !== 'approved')
      blockPrereq(
        PREREQ.approval.id,
        `${key}: ${PREREQ.approval.reason} (profile_state ${state ?? 'unknown'} after ${Math.round((Date.now() - start) / 1000)} s)`,
      );
    return p;
  }

  /** Onboarded account i once staging approved it (see waitApproved). */
  async approved(i = 0): Promise<Profile> {
    return this.waitApproved(await this.onboarded(i), `onboarded-${i}`);
  }

  /**
   * A throwaway account in the "deactivated" state, made by the suite itself: POST /V1/users/deactivate_user is
   * allowed for pending profiles (users_controller.rb:3, from code). Re-activated before the clean-up delete.
   */
  async deactivated(key: string): Promise<Profile> {
    const p = await this.throwaway(key, { keepDeactivated: true });
    let st = await ownState(this.sessions, p);
    if (st.profileState !== 'deactivated') {
      const res = await this.sessions.client.call('API-029', {
        auth: AUTH.user(p.token),
        device: p.device,
        retry: false,
      });
      st = await ownState(this.sessions, p);
      if (st.profileState !== 'deactivated')
        blockPrereq(
          PREREQ.approval.id,
          `${key}: the suite could not deactivate its throwaway account (deactivate HTTP ${res.status}, profile_state ${st.profileState ?? `HTTP ${st.status}`})`,
        );
    }
    const entry = this.ledger.find((e) => e.mobileNumber === p.mobileNumber);
    if (entry) {
      Object.assign(entry, { profileState: 'deactivated', note: `throwaway for ${key} (deactivated)` });
      this.flush();
    }
    return p;
  }

  /** The other suite account for `self`: account 1 (female), or account 0 when `self` is account 1. */
  async otherFor(self?: { mobileNumber: string }): Promise<Profile> {
    const b = await this.onboarded(1);
    return self && b.mobileNumber === self.mobileNumber ? this.onboarded(0) : b;
  }

  /**
   * Accounts 0 (male) and 1 (female) connected by a mutual like (POST /V1/like {ref} both ways; allowed for pending
   * profiles, like_controller.rb:4), and their conversation id from GET /V1/list_connected_profiles. Made once per
   * worker. No conversation → Blocked M2Q-32 with the observed statuses.
   */
  suitePair(): Promise<{ a: Profile; b: Profile; conversationId: string }> {
    this.pair ??= (async () => {
      const a = await this.onboarded(0);
      const b = await this.onboarded(1);
      const like = async (from: Profile, to: Profile) =>
        (
          await this.sessions.client.call('API-046', {
            auth: AUTH.user(from.token),
            device: from.device,
            body: { ref: to.ref },
            retry: false,
          })
        ).status;
      const s1 = await like(a, b);
      const s2 = await like(b, a);
      const list = await this.sessions.client.call('API-063', {
        auth: AUTH.user(a.token),
        device: a.device,
        query: { page: '1', items_per_page: '10' },
      });
      const item = itemsWith(list.json(), (o) => String(o.ref) === b.ref)[0];
      const id = item ? (item.conversation_id ?? deepGet(item, 'conversation_id')) : undefined;
      if (id === undefined || id === null || id === '')
        blockPrereq(
          PREREQ.connected.id,
          `No connection between the suite's accounts 0 and 1 (like HTTP ${s1} / ${s2}, list_connected_profiles HTTP ${list.status}, conversation ${item ? 'without id' : 'not listed'})`,
        );
      this.ownedIds.add(String(id));
      return { a, b, conversationId: String(id) };
    })();
    // A failed attempt is not cached as a rejection forever: the next test re-tries once.
    const pending = this.pair;
    pending.catch(() => {
      if (this.pair === pending) this.pair = undefined;
    });
    return pending;
  }

  /**
   * A fresh invite id: `sender` sends a request to `receiver` (POST /V1/invites/send_request_to_profile), and the id
   * is read from the receiver's GET /V1/invites/all_requests entry for the sender. Not possible → Blocked M2Q-32.
   */
  async requestId(sender: Profile, receiver: Profile): Promise<string> {
    const sent = await this.sessions.client.call('API-004', {
      auth: AUTH.user(sender.token),
      device: sender.device,
      body: { ref: receiver.ref, invitation_type: 'story', reply_message: 'QA synthetic request' },
      retry: false,
    });
    const list = await this.sessions.client.call('API-005', {
      auth: AUTH.user(receiver.token),
      device: receiver.device,
      query: { page: '1', items_per_page: '10' },
    });
    const item = itemsWith(list.json(), (o) => String(o.ref) === sender.ref)[0];
    const key = item && ['request_id', 'invite_id', 'invitation_id', 'id'].find((k) => item[k] != null);
    if (!item || !key)
      blockPrereq(
        PREREQ.connected.id,
        `No invite between the suite's accounts (send_request_to_profile HTTP ${sent.status}, all_requests HTTP ${list.status}, entry ${item ? 'without an id' : 'not listed'})`,
      );
    test.info().annotations.push({
      type: 'assumption',
      description: `REQUEST_ID read from the receiver's all_requests entry for the sender (key "${key}").`,
    });
    const id = String(item[key]);
    this.ownedIds.add(id);
    return id;
  }

  /** The caller's own photos (fetch_own_info image_list: URL + photo_id), at least two; none → undefined. */
  async ownPhotos(p: Profile): Promise<{ url: string; id: string }[] | undefined> {
    const res = await this.sessions.client.call('API-013', { auth: AUTH.user(p.token), device: p.device });
    const list = deepGet(res.json(), 'image_list');
    if (!Array.isArray(list)) return undefined;
    const photos = (list as Record<string, unknown>[])
      .map((x) => ({ url: x.photo ?? x.url ?? x.image_url, id: x.photo_id ?? x.id }))
      .filter((x) => typeof x.url === 'string' && x.id !== undefined && x.id !== null)
      .map((x) => ({ url: String(x.url), id: String(x.id) }));
    photos.forEach((x) => this.ownedIds.add(x.id));
    return photos.length >= 2 ? photos : undefined;
  }

  /**
   * An audio URL owned by `p`: POST /V1/users/upload_audio_url with a generated SILENT MP3 (no voice, synthetic;
   * Amazon::Url.upload_audio stores every uploaded file in Aisle's S3 and answers {audio_url: [url]}, from code).
   */
  async audioUrl(p: Profile): Promise<string | undefined> {
    const cached = this.audio.get(p.mobileNumber);
    if (cached) return cached;
    const boundary = `----qa-m2-${randomBytes(8).toString('hex')}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="qa_silence.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`,
      ),
      silentMp3(),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await this.sessions.client.callRoute(UPLOAD_AUDIO, {
      auth: AUTH.user(p.token),
      device: p.device,
      rawBody: body,
      contentType: `multipart/form-data; boundary=${boundary}`,
      retry: false,
    });
    const urls = deepGet(res.json(), 'audio_url');
    const url = Array.isArray(urls) ? urls.find((u) => typeof u === 'string') : undefined;
    if (res.status !== 200 || typeof url !== 'string') return undefined;
    this.audio.set(p.mobileNumber, url);
    return url;
  }

  /** User ids, refs and owned ids of every suite account this worker knows — the only ids requests may name. */
  suiteIds(): Set<string> {
    const ids = new Set<string>(this.ownedIds);
    const add = (s: { userId?: string | undefined; ref?: string | undefined }) => {
      if (s.userId) ids.add(String(s.userId));
      if (s.ref) ids.add(String(s.ref));
    };
    for (const s of [...this.pool.values(), ...this.profiles.values(), ...this.own.values()]) add(s);
    for (const p of this.throwaways.values()) add(p);
    for (const e of this.ledger) add(e);
    return ids;
  }

  /** Two matched profiles (M2_CONNECTED_ACCOUNTS) — matching needs approved, discoverable profiles (M2Q-32). */
  async connectedPair(): Promise<[Profile, Profile]> {
    const [a, b] = this.config.connectedNumbers;
    if (!a || !b) {
      if (!this.config.createAccounts) blockPrereq(PREREQ.connected.id, PREREQ.connected.reason);
      const pair = await this.suitePair();
      return [pair.a, pair.b];
    }
    const pair: [Profile, Profile] = [
      await this.profileFor(a, 'connected-a'),
      await this.profileFor(b, 'connected-b'),
    ];
    for (const p of pair) await this.requireActive(p, 'connected');
    return pair;
  }

  /** A connected pair plus a third onboarded account that is not part of it. */
  async trio(): Promise<[Profile, Profile, Profile]> {
    const [a, b] = await this.connectedPair();
    return [a, b, await this.onboarded(2)];
  }

  /** Phone numbers of every account this worker knows, except `self` — must never appear in `self`'s replies. */
  numbersExcept(self?: { mobileNumber: string }): string[] {
    const all = [...this.pool.values(), ...this.profiles.values()].map((s) => s.mobileNumber);
    return [...new Set(all)].filter((n) => n !== self?.mobileNumber);
  }

  /**
   * A Dev-provided account in a special state (M2Q-32): M2_ACCOUNT_UNMIGRATED, M2_ACCOUNT_HIDDEN_NAME,
   * M2_ACCOUNT_DEACTIVATED (one synthetic number each). Without it the test is Blocked.
   */
  async special(state: 'UNMIGRATED' | 'HIDDEN_NAME' | 'DEACTIVATED'): Promise<Profile> {
    const number = process.env[`M2_ACCOUNT_${state}`]?.trim();
    if (!number) blockPrereq(PREREQ.states.id, `${PREREQ.states.reason} — set M2_ACCOUNT_${state}`);
    return this.profileFor(number, `special-${state}`);
  }

  web(): never {
    return blockPrereq(PREREQ.web.id, PREREQ.web.reason);
  }

  admin(): never {
    return blockPrereq(PREREQ.admin.id, PREREQ.admin.reason);
  }

  /** Create + onboard an account for index i (gender: genderOf(i), with that gender's photo set). */
  private async ownOnboarded(i: number): Promise<Profile> {
    const key = `own-onboarded-${i}`;
    const cached = this.profiles.get(key);
    if (cached) return cached;
    this.requireCreate();
    const known = readRunPool(this.config.runId).onboarded[`${this.slot}:${i}`];
    if (known) {
      // Onboarded earlier in this run (another worker): log in again, never re-create or re-onboard.
      const again = await this.sessions.loginWithNumber(known.mobileNumber, known.deviceId);
      const p: Profile = {
        ...again,
        ref: again.ref ?? known.ref,
        gender: genderOf(i),
        known: onboardingValues(this.config.runId, i),
      };
      this.profiles.set(key, p);
      return p;
    }
    const fresh = await this.freshUser();
    const entry = this.ledger.find((e) => e.mobileNumber === fresh.mobileNumber)!;
    let done;
    try {
      done = await onboard(this.sessions, this.config, fresh, {
        ...onboardingValues(this.config.runId, i),
        gender: genderOf(i), // photos always match the declared gender (Female set for account 1)
      });
    } catch (e) {
      Object.assign(entry, { note: `onboarding failed: ${(e as Error).message}` });
      this.flush();
      return blockPrereq(
        PREREQ.onboarding.id,
        `Onboarding a synthetic account failed — ${(e as Error).message}`,
      );
    }
    this.own.set(fresh.mobileNumber, done.session);
    const p: Profile = {
      ...done.session,
      ref: done.ref ?? fresh.ref,
      gender: genderOf(i),
      known: onboardingValues(this.config.runId, i),
    };
    Object.assign(entry, {
      onboarded: true,
      ref: p.ref,
      applicationStage: 'completed',
      profileState: done.profileState,
    });
    this.flush();
    writeRunPool(this.config.runId, (pool) => {
      pool.onboarded[`${this.slot}:${i}`] = {
        mobileNumber: p.mobileNumber,
        deviceId: p.device.uniqueIdentifier,
        ref: p.ref,
      };
    });
    this.profiles.set(key, p);
    return p;
  }

  /** Re-check profile_state; image_inappropriate / disabled → Blocked (moderation, open part of M2Q-36). */
  private async requireActive(p: Profile, key: string): Promise<void> {
    const st = await ownState(this.sessions, p);
    const entry = this.ledger.find((e) => e.mobileNumber === p.mobileNumber);
    if (entry) {
      entry.profileState = st.profileState;
      if (st.profileState === 'disabled') entry.unusable = true;
      this.flush();
    }
    if (st.status !== 200)
      blockPrereq(
        PREREQ.onboarding.id,
        `${key}: own profile not readable (HTTP ${st.status}) — not onboarded`,
      );
    if (st.profileState === 'disapproved' && entry) entry.note = 'disapproved by moderation';
    if (st.profileState && UNUSABLE_STATES.includes(st.profileState))
      blockPrereq(
        PREREQ.moderation.id,
        `${key}: profile_state is ${st.profileState} — moderation flagged the synthetic profile (open sub-question of M2Q-36)`,
      );
  }

  private async profileFor(number: string, key: string): Promise<Profile> {
    const cached = this.profiles.get(key);
    if (cached) return cached;
    if (!isAllowedTestNumber(number))
      blockPrereq(PREREQ.onboarding.id, `${key}: not an allowed synthetic number`);
    const s = await this.sessions.loginWithNumber(number);
    const own = await this.sessions.client.call('API-013', {
      auth: { kind: 'secret', label: 'user JWT', secret: s.token },
      device: s.device,
    });
    if (own.status !== 200)
      blockPrereq(
        PREREQ.onboarding.id,
        `${key}: own profile not readable (HTTP ${own.status}) — not onboarded`,
      );
    const g = field(own.json(), 'gender');
    const p: Profile = {
      ...s,
      ref: s.ref ?? findRef(own.json()),
      gender: g === 'Male' || g === 'Female' ? g : undefined,
    };
    this.profiles.set(key, p);
    return p;
  }

  private record(e: Omit<LedgerEntry, 'createdAt' | 'deleted' | 'deleteStatus'>): LedgerEntry {
    const entry: LedgerEntry = {
      ...e,
      createdAt: new Date().toISOString(),
      deleted: null,
      deleteStatus: null,
    };
    this.ledger.push(entry);
    this.flush();
    return entry;
  }

  private flush(): void {
    if (!this.ledger.length) return;
    mkdirSync(path.dirname(this.ledgerFile), { recursive: true });
    writeFileSync(
      this.ledgerFile,
      JSON.stringify({ runId: this.config.runId, accounts: this.ledger }, null, 2),
    );
  }

  /**
   * Worker teardown: only saves the ledger. Accounts are deleted once at the END of the run (global teardown,
   * m2/src/accounts/global-teardown.ts), because a worker restarted after a failure re-uses the run's accounts.
   */
  async cleanup(): Promise<{ created: number }> {
    this.flush();
    if (this.ledger.length) this.log.info('Synthetic accounts', { created: this.ledger.length });
    return { created: this.ledger.length };
  }
}

/**
 * Delete one suite-created account and record the outcome in its ledger entry. Returns true when deleted.
 * Shared by the worker teardown and `npm run m2:accounts:cleanup`.
 */
export async function deleteOwnAccount(
  sessions: SessionHelper,
  config: M2Config,
  session: UserSession,
  entry: LedgerEntry,
): Promise<boolean> {
  let s = session;
  // Decide from THIS login, never from the ledger: a number whose account was deleted and then logged into again is
  // a new account at the first onboarding step (its old ref is dead — a delete with it answers 401).
  const stage = s.applicationStage;
  if (stage === 'completed') entry.onboarded = true;
  else if (stage !== undefined) entry.onboarded = false;
  let ref = entry.onboarded ? (s.ref ?? entry.ref) : s.ref;
  if (!entry.onboarded) {
    // Delete needs a profile (a new-user token gets 401, observed 2026-10-23): onboard the bare account first
    // (synthetic values, then deleted at once). This is the only deletion path observed for such accounts.
    try {
      const done = await onboard(sessions, config, s, {
        firstName: 'QaCleanup',
        email: `${config.runId}-cleanup-${entry.mobileNumber.slice(-4)}@${(process.env.AISLE_TEST_EMAIL_DOMAIN || 'example.test').toLowerCase()}`,
        gender: 'Male',
      });
      s = done.session;
      ref = done.ref ?? ref;
      entry.onboarded = true;
    } catch (e) {
      Object.assign(entry, {
        deleted: false,
        leftBehindReason: `onboarding for deletion failed: ${(e as Error).message} (M2Q-47)`,
      });
      return false;
    }
  }
  const st = await ownState(sessions, s);
  entry.profileState = st.profileState ?? entry.profileState;
  ref = st.ref ?? ref;
  if (ref) entry.ref = ref;
  if (st.profileState === 'disabled') {
    Object.assign(entry, {
      unusable: true,
      deleted: false,
      note: 'disabled profile — cannot be recovered or deleted',
    });
    return false;
  }
  if (st.profileState === 'deactivated') {
    // A throwaway the suite deactivated itself: activate it again (POST /V1/users/activate_user) before deleting.
    const act = await sessions.client.call('API-030', {
      auth: AUTH.user(s.token),
      device: s.device,
      retry: false,
    });
    entry.note = `${entry.note ?? ''} (re-activated for deletion: HTTP ${act.status})`.trim();
  }
  if (!ref) {
    Object.assign(entry, { deleted: false, leftBehindReason: 'no profile ref — cannot delete' });
    return false;
  }
  const res = await sessions.deleteAccount(s, ref);
  Object.assign(entry, {
    deleted: ok(res),
    deleteStatus: res.status,
    ...(ok(res) ? { leftBehindReason: undefined } : { leftBehindReason: `delete HTTP ${res.status}` }),
  });
  return ok(res);
}

interface RunPool {
  roles: Record<string, { mobileNumber: string; deviceId: string }>;
  onboarded: Record<string, { mobileNumber: string; deviceId: string; ref: string | undefined }>;
}
const poolFile = (runId: string) => path.join(ROOT, ACCOUNTS_DIR, `${runId}-pool.json`);

/** The run's shared account pool (git-ignored, no tokens): which number serves which role / onboarded index. */
export function readRunPool(runId: string): RunPool {
  const f = poolFile(runId);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as RunPool) : { roles: {}, onboarded: {} };
}

function writeRunPool(runId: string, change: (p: RunPool) => void): void {
  const pool = readRunPool(runId);
  change(pool);
  mkdirSync(path.dirname(poolFile(runId)), { recursive: true });
  writeFileSync(poolFile(runId), JSON.stringify(pool, null, 2));
}

/**
 * How the clean-up treats a ledger entry without logging in: already deleted, never created (wrong-OTP checks that
 * issued no token, refused login variants), unusable (disabled), or to be deleted. Pure — shared with the self-tests.
 */
export function ledgerDisposition(
  e: LedgerEntry,
  deletedNumbers: Set<string>,
): 'alreadyDeleted' | 'neverCreated' | 'unusable' | 'notAllowed' | 'delete' {
  const number = e.cleanupNumber ?? e.mobileNumber;
  if (e.deleted === true || deletedNumbers.has(number)) return 'alreadyDeleted';
  if (e.neverCreated || (e.note?.startsWith('wrong-OTP') && !e.userId)) return 'neverCreated';
  if (e.unusable) return 'unusable';
  if (!isAllowedTestNumber(number)) return 'notAllowed';
  return 'delete';
}

/**
 * Delete the not-yet-deleted accounts of ledger files (all runs, or one run): log in again with the number
 * (OTP 1234), onboard a bare account if needed, then POST /V1/user/delete. Disabled profiles are marked unusable.
 * Used by the global teardown (current run) and `npm run m2:accounts:cleanup` (all runs). Counts only.
 */
export async function cleanupLedgers(
  config: M2Config,
  sessions: SessionHelper,
  runId?: string,
): Promise<CleanupResult> {
  const dir = path.join(ROOT, ACCOUNTS_DIR);
  const files = existsSync(dir)
    ? readdirSync(dir).filter(
        (f) => f.endsWith('.json') && !f.endsWith('-pool.json') && (!runId || f.startsWith(runId)),
      )
    : [];
  const r: CleanupResult = {
    deleted: 0,
    leftBehind: 0,
    leftBehindReasons: {},
    neverCreated: 0,
    alreadyDeleted: 0,
    unusable: 0,
  };
  const leftBehind = (reason: string) => {
    r.leftBehind++;
    // Reasons are counted without numbers or HTTP request ids.
    const key = reason.replace(/\(requestId=[^)]*\)/g, '').trim();
    r.leftBehindReasons[key] = (r.leftBehindReasons[key] ?? 0) + 1;
  };
  // Numbers already deleted in ANY entry (several login variants can map to one account): never log in again —
  // a login to a deleted number would create a new account.
  const done = new Set<string>();
  for (const f of files)
    for (const e of (JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { accounts: LedgerEntry[] })
      .accounts)
      if (e.deleted === true) done.add(e.cleanupNumber ?? e.mobileNumber);
  for (const f of files) {
    const file = path.join(dir, f);
    const ledger = JSON.parse(readFileSync(file, 'utf8')) as { runId: string; accounts: LedgerEntry[] };
    for (const e of ledger.accounts) {
      const number = e.cleanupNumber ?? e.mobileNumber;
      const disposition = ledgerDisposition(e, done);
      if (disposition === 'alreadyDeleted') {
        r.alreadyDeleted++;
        if (e.deleted !== true) {
          e.deleted = true;
          e.note = `${e.note ?? ''} (same account as an entry already deleted)`.trim();
          writeFileSync(file, JSON.stringify(ledger, null, 2));
        }
        continue;
      }
      if (disposition === 'neverCreated') {
        r.neverCreated++;
        if (!e.neverCreated) {
          e.neverCreated = true; // permanent: never logged into
          writeFileSync(file, JSON.stringify(ledger, null, 2));
        }
        continue;
      }
      if (disposition === 'unusable') {
        r.unusable++;
        continue;
      }
      if (disposition === 'notAllowed') {
        leftBehind('not an allowed synthetic number — cannot log in to delete');
        continue;
      }
      try {
        const s = await sessions.loginWithNumber(number, e.deviceId);
        if (await deleteOwnAccount(sessions, config, s, e)) {
          r.deleted++;
          done.add(number);
        } else if (e.unusable) r.unusable++;
        else leftBehind(e.leftBehindReason ?? 'not deleted');
      } catch (err) {
        e.leftBehindReason = `clean-up failed: ${(err as Error).name}`;
        leftBehind(e.leftBehindReason);
      }
      writeFileSync(file, JSON.stringify(ledger, null, 2));
    }
  }
  return r;
}
