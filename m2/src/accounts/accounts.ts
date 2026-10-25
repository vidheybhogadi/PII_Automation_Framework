/**
 * Synthetic accounts for M2 tests (one pool per Playwright parallel slot, persisted for the whole run).
 *
 * - newUser(role): a NEW (onboarding-stage) account via phone login. Only when M2_CREATE_ACCOUNTS=true; otherwise
 *   the test is Blocked. Pooled: one account per role ("A", "B", …) per slot, reused by its tests.
 * - onboarded(i): a finished profile — Dev-provided (M2_ONBOARDED_ACCOUNTS) or, with M2_CREATE_ACCOUNTS=true,
 *   created and onboarded by the suite (m2/src/accounts/onboarding.ts). Its profile_state is re-checked every time
 *   it is handed out: image_inappropriate / disabled (moderation, open sub-question of M2Q-36) → Blocked.
 * - connectedPair() / trio(): two matched profiles (M2_CONNECTED_ACCOUNTS) or the suite's own pair (suitePair).
 * - web() / admin(): true web JWT (payment routes, M2Q-17) and CMS admin (M2Q-04) are not available → Blocked.
 * - throwaway(key): a suite account onboarded only for one API's destructive / profile-submit cases (shared by that
 *   API's cases in this slot, replaced once consumed); approved(i) waits for staging's auto-approval;
 *   deactivated(key) deactivates a throwaway itself; suitePair() connects accounts 0 and 1 by a mutual like;
 *   requestId(receiver) makes an invite from a dedicated sender account.
 *
 * Run pool (2026-10-24, run qa-m2-20261024t134344: approval took 8–20 min and a worker restart after every failed
 * test re-created throwaway accounts): reports/m2/accounts/<run>-pool.json keeps — per slot — the onboarded
 * accounts, the throwaway accounts per key (and whether they were consumed), the invite senders, the pair's
 * conversation id and, per account, when the approval clock started. A restarted worker logs into these accounts
 * again instead of creating new ones. warmUp() onboards the accounts that need approval when a worker starts, so
 * staging's approval runs while other tests execute; approval-dependent per-API cases run last
 * (m2/tests/zz-late/, see m2/src/checks/late.ts).
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
import type { Secret } from '../../../core/utils/secret';
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

/**
 * Routes that RESET the calling account: POST /V1/user/reset_profile creates a new user for the number with
 * last_reset = now, and a reset account answers 406 to a further reset (user.rb:541-544, 595-596, develop_new
 * 944f76a — from code, confirm with Dev). A throwaway that a reset succeeded on is consumed: the next case or variant
 * gets a never-reset account.
 */
export const RESETTING_APIS = ['API-198'];

/** Margin on top of M2_APPROVAL_WAIT_MS for the rest of a test that waits for approval. */
export const APPROVAL_TIMEOUT_MARGIN_MS = 60_000;
/** Extra test time when a consumed throwaway account is replaced by a newly onboarded one. */
export const THROWAWAY_TIMEOUT_MS = 60_000;
/** How long suitePair() polls list_connected_profiles for the other account once both are approved. */
export const PAIR_LIST_WAIT_MS = 60_000;
/** Throwaway key of the shared deactivated-state account (role B: `${DEACTIVATION_KEY}:B`). */
export const DEACTIVATION_KEY = 'deactivated';

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
    // A pooled throwaway that was deleted is never logged into again, also not by a restarted worker.
    writeRunPool(this.config.runId, (pool) => {
      for (const t of Object.values(pool.throwaways))
        if (t.mobileNumber === s.mobileNumber) t.consumed = true;
    });
  }

  /**
   * A resetting route answered 2xx for suite account `s`: its throwaway is consumed — never handed out again, also not
   * by a restarted worker (run pool). The number stays in the ledger and is deleted at the end like every account.
   */
  markConsumed(s: UserSession, apiId: string, status: number): void {
    for (const [key, p] of this.throwaways)
      if (p.mobileNumber === s.mobileNumber) this.throwaways.delete(key);
    writeRunPool(this.config.runId, (pool) => {
      for (const t of Object.values(pool.throwaways))
        if (t.mobileNumber === s.mobileNumber) t.consumed = true;
    });
    const entry = this.ledger.find((e) => e.mobileNumber === s.mobileNumber);
    if (entry) {
      entry.note = `${entry.note ?? ''} (reset by its ${apiId} test: HTTP ${status})`.trim();
      this.flush();
    }
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
    approvalSince(this.config.runId, p.mobileNumber); // the approval clock starts at onboarding
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
    const usable = (st: { status: number; profileState: string | undefined }) =>
      st.status === 200 &&
      !(st.profileState && UNUSABLE_STATES.includes(st.profileState)) &&
      (opts.keepDeactivated || st.profileState !== 'deactivated');
    const poolKey = `${this.slot}:${key}`;
    const cached = this.throwaways.get(key) ?? (await this.pooledThrowaway(key));
    if (cached) {
      const st = await ownState(this.sessions, cached);
      if (usable(st)) {
        this.throwaways.set(key, cached);
        return cached;
      }
      // A new account is onboarded below: give the test time for it.
      extendTestTimeout(THROWAWAY_TIMEOUT_MS);
      const entry = this.ledger.find((e) => e.mobileNumber === cached.mobileNumber);
      const deletedHere = st.status !== 200 && DELETING_APIS.some((d) => key.startsWith(d));
      if (entry) {
        entry.profileState = st.profileState ?? entry.profileState;
        if (entry.deleted === true) {
          // already recorded from the deleting route's own reply (recordDeletedBy)
        } else if (deletedHere) {
          // Deleted by its own test: never log in to this number again (that would create a new account).
          Object.assign(entry, { deleted: true, note: `deleted by its ${key} test` });
        } else entry.note = `consumed by its ${key} test (state ${st.profileState ?? `HTTP ${st.status}`})`;
        this.flush();
      }
      // Never handed out again — also not by a restarted worker (run pool).
      writeRunPool(this.config.runId, (pool) => {
        const t = pool.throwaways[poolKey];
        if (t && t.mobileNumber === cached.mobileNumber) Object.assign(t, { consumed: true });
      });
      this.throwaways.delete(key);
    }
    // A run-unique counter per slot (persisted), so a restarted worker never re-uses a fake email.
    let n = 0;
    writeRunPool(this.config.runId, (pool) => {
      n = pool.counters[`t${this.slot}`] ?? 0;
      pool.counters[`t${this.slot}`] = n + 1;
    });
    const values = {
      firstName: onboardingValues(this.config.runId, 10 + n).firstName,
      email: `${this.config.runId}-t${this.slot}-${n}@${(process.env.AISLE_TEST_EMAIL_DOMAIN || 'example.test').toLowerCase()}`,
    };
    const p = await this.onboardFresh(values, 'Male');
    const entry = this.ledger.find((e) => e.mobileNumber === p.mobileNumber);
    if (entry) entry.note = `throwaway for ${key}`;
    this.flush();
    writeRunPool(this.config.runId, (pool) => {
      pool.throwaways[poolKey] = {
        mobileNumber: p.mobileNumber,
        deviceId: p.device.uniqueIdentifier,
        ref: p.ref,
        gender: 'Male',
        known: values,
      };
    });
    this.throwaways.set(key, p);
    return p;
  }

  /**
   * The throwaway of `key` that an earlier worker of this run (same slot) onboarded and that is not consumed: logged
   * into again (same number and device). Never for a number deleted in this run (a login would create a new account);
   * if the login nevertheless lands on a NEW account (application_stage not "completed" — deleted without a record),
   * that new account goes into the ledger (deleted at the end) and the pooled entry is marked consumed.
   */
  private async pooledThrowaway(key: string): Promise<Profile | undefined> {
    const poolKey = `${this.slot}:${key}`;
    const t = readRunPool(this.config.runId).throwaways[poolKey];
    if (!t || t.consumed) return undefined;
    const consumed = () =>
      writeRunPool(this.config.runId, (pool) => {
        const x = pool.throwaways[poolKey];
        if (x && x.mobileNumber === t.mobileNumber) x.consumed = true;
      });
    if (deletedInRun(this.config.runId, t.mobileNumber)) {
      consumed();
      return undefined;
    }
    const s = await this.sessions.loginWithNumber(t.mobileNumber, t.deviceId);
    if (s.applicationStage !== 'completed') {
      const entry = this.record({
        mobileNumber: t.mobileNumber,
        deviceId: t.deviceId,
        note: `re-login to the consumed throwaway of ${key} created a new account`,
      });
      Object.assign(entry, { userId: s.userId, ref: s.ref, applicationStage: s.applicationStage });
      this.own.set(s.mobileNumber, s);
      this.flush();
      consumed();
      return undefined;
    }
    return { ...s, ref: s.ref ?? t.ref, gender: t.gender ?? 'Male', known: t.known };
  }

  /**
   * Wait for staging's automatic approval of `p` (pending_not_verified → approved; it took 8–20 min in run
   * qa-m2-20261024t134344). Every call re-checks profile_state (one cheap fetch_own_info) — an account that was not
   * approved for an earlier test can be approved now. The approval clock of an account starts when the suite
   * onboarded it (or at its first wait) and is kept in the run pool, so all waits for one account together last at
   * most M2_APPROVAL_WAIT_MS (default 15 min) from that start; afterwards a single check decides → Blocked M2Q-32.
   * A waiting test gets its own timeout extension (the remaining wait plus a margin).
   */
  async waitApproved(p: Profile, key: string): Promise<Profile> {
    const since = approvalSince(this.config.runId, p.mobileNumber);
    const deadline = since + this.config.approvalWaitMs;
    let extended = false;
    let state: string | undefined;
    for (;;) {
      const st = await ownState(this.sessions, p);
      state = st.profileState;
      if (state === 'approved') break;
      if (state && UNUSABLE_STATES.includes(state)) break;
      const left = deadline - Date.now();
      if (left <= 0) break;
      if (!extended) {
        // The wait can take the rest of the account's approval window: the test gets that time plus a margin.
        extendTestTimeout(left + APPROVAL_TIMEOUT_MARGIN_MS);
        extended = true;
      }
      await new Promise((r) => setTimeout(r, Math.min(10_000, left)));
    }
    const entry = this.ledger.find((e) => e.mobileNumber === p.mobileNumber);
    if (entry) {
      entry.profileState = state ?? entry.profileState;
      this.flush();
    }
    if (state !== 'approved')
      blockPrereq(
        PREREQ.approval.id,
        `${key}: ${PREREQ.approval.reason} (profile_state ${state ?? 'unknown'} ${Math.round((Date.now() - since) / 60_000)} min after the approval clock started)`,
      );
    return p;
  }

  /** Onboarded account i once staging approved it (see waitApproved). */
  async approved(i = 0): Promise<Profile> {
    return this.waitApproved(await this.onboarded(i), `onboarded-${i}`);
  }

  /**
   * A throwaway account in the "deactivated" state, made by the suite itself with POST /V1/users/deactivate_user.
   * Profile#deactivate_profile only acts for approved / pending / disapproved / vip_disapproved profiles
   * (app/models/profile.rb:4583-4589, develop_new 944f76a — from code, confirm with Dev): a freshly onboarded
   * account is "pending_not_verified", so it is first waited for until staging approves it. One deactivation
   * throwaway per role and slot serves every deactivated-state route; re-activated before the clean-up delete.
   */
  async deactivated(key: string): Promise<Profile> {
    const p = await this.throwaway(key, { keepDeactivated: true });
    let st = await ownState(this.sessions, p);
    if (st.profileState !== 'deactivated') {
      await this.waitApproved(p, key);
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
   * profiles, like_controller.rb:4), and their conversation id from GET /V1/list_connected_profiles.
   * The conversation exists right after the mutual like, but list_connected_profiles only lists conversations whose
   * other member is in a "conversation" profile state — approved / pending / … but not pending_not_verified
   * (chat/conversation.rb:41 join_other_active_profiles_include_deleted, fields/profile_state.rb:155-167,
   * develop_new 944f76a — from code, confirm with Dev). So both accounts are first waited for until approved, then
   * the list is polled (up to PAIR_LIST_WAIT_MS) until the other account appears. Made once per slot and run (the
   * likes and the conversation id are kept in the run pool). No conversation → Blocked M2Q-32 with the statuses seen.
   */
  suitePair(): Promise<{ a: Profile; b: Profile; conversationId: string }> {
    this.pair ??= (async () => {
      const a = await this.onboarded(0);
      const b = await this.onboarded(1);
      const known = readRunPool(this.config.runId).pairs[String(this.slot)];
      if (known?.conversationId && known.a === a.mobileNumber && known.b === b.mobileNumber) {
        this.ownedIds.add(known.conversationId);
        return { a, b, conversationId: known.conversationId };
      }
      let likes = known?.likes;
      if (!likes || known?.a !== a.mobileNumber || known?.b !== b.mobileNumber) {
        const like = async (from: Profile, to: Profile) =>
          (
            await this.sessions.client.call('API-046', {
              auth: AUTH.user(from.token),
              device: from.device,
              body: { ref: to.ref },
              retry: false,
            })
          ).status;
        likes = [await like(a, b), await like(b, a)];
        const done = likes;
        writeRunPool(this.config.runId, (pool) => {
          pool.pairs[String(this.slot)] = { a: a.mobileNumber, b: b.mobileNumber, likes: done };
        });
      }
      await this.waitApproved(a, 'pair account 0');
      await this.waitApproved(b, 'pair account 1');
      extendTestTimeout(PAIR_LIST_WAIT_MS);
      const start = Date.now();
      let list: ApiResponse;
      let item: Record<string, unknown> | undefined;
      let id: unknown;
      for (;;) {
        list = await this.sessions.client.call('API-063', {
          auth: AUTH.user(a.token),
          device: a.device,
          query: { page: '1', items_per_page: '10' },
        });
        item = itemsWith(list.json(), (o) => String(o.ref) === b.ref)[0];
        id = item ? (item.conversation_id ?? deepGet(item, 'conversation_id')) : undefined;
        if ((id !== undefined && id !== null && id !== '') || Date.now() - start >= PAIR_LIST_WAIT_MS) break;
        await new Promise((r) => setTimeout(r, 5_000));
      }
      if (id === undefined || id === null || id === '')
        blockPrereq(
          PREREQ.connected.id,
          `No connection between the suite's accounts 0 and 1 (like HTTP ${likes[0]} / ${likes[1]}, both approved, list_connected_profiles HTTP ${list.status}, conversation ${item ? 'without id' : 'not listed'} after ${Math.round((Date.now() - start) / 1000)} s)`,
        );
      const conversationId = String(id);
      this.ownedIds.add(conversationId);
      writeRunPool(this.config.runId, (pool) => {
        pool.pairs[String(this.slot)] = {
          a: a.mobileNumber,
          b: b.mobileNumber,
          likes: likes!,
          conversationId,
        };
      });
      return { a, b, conversationId };
    })();
    // A failed attempt is not cached as a rejection forever: the next test re-tries once.
    const pending = this.pair;
    pending.catch(() => {
      if (this.pair === pending) this.pair = undefined;
    });
    return pending;
  }

  /**
   * The conversation id of the connected pair when it is the suite's own pair (M2_CREATE_ACCOUNTS=true and no
   * Dev-provided M2_CONNECTED_ACCOUNTS); undefined otherwise.
   */
  async pairConversationId(): Promise<string | undefined> {
    const [a, b] = this.config.connectedNumbers;
    if ((a && b) || !this.config.createAccounts) return undefined;
    return (await this.suitePair()).conversationId;
  }

  /**
   * A pending invite id for `receiver` (an approved suite account): a dedicated SENDER account sends a request
   * (POST /V1/invites/send_request_to_profile) and the id is read from the receiver's GET /V1/invites/all_requests
   * entry for that sender. Chat::Request.send_request does nothing when the receiver is not approved, the genders
   * are the same, or the sender already invited / is connected to the receiver (chat/request.rb:182-189, 295-297,
   * develop_new 944f76a — from code, confirm with Dev). So the sender is an approved account of the opposite gender
   * that never liked, connected to or invited the receiver, and every consumed request id needs a new sender:
   * a still-pending request of a known sender is re-used; otherwise an unused sender (or a newly onboarded one) sends.
   * Not possible → Blocked M2Q-32.
   */
  async requestId(receiver: Profile): Promise<string> {
    await this.waitApproved(receiver, 'invite receiver');
    const gender: 'Male' | 'Female' = receiver.gender === 'Female' ? 'Male' : 'Female';
    const readList = async () =>
      this.sessions.client.call('API-005', {
        auth: AUTH.user(receiver.token),
        device: receiver.device,
        query: { page: '1', items_per_page: '10' },
      });
    const idIn = (body: unknown, senderRef: string | undefined) => {
      const item = senderRef ? itemsWith(body, (o) => String(o.ref) === senderRef)[0] : undefined;
      const k = item && ['request_id', 'invite_id', 'invitation_id', 'id'].find((x) => item[x] != null);
      return item && k ? { id: String(item[k]), key: k } : undefined;
    };
    const found = (id: { id: string; key: string }, how: string) => {
      test.info().annotations.push({
        type: 'assumption',
        description: `REQUEST_ID read from the receiver's all_requests entry for a suite sender account (key "${id.key}", ${how}).`,
      });
      this.ownedIds.add(id.id);
      return id.id;
    };
    // 1. A request a known sender already sent that is still pending (not consumed) → re-use it.
    let list = await readList();
    for (const s of this.sendersOf(gender)) {
      const pending = idIn(list.json(), s.ref);
      if (pending) return found(pending, 'pending request re-used');
    }
    // 2. A sender that never invited this receiver (pre-onboarded by warmUp, or a new one) sends a request.
    const sender = await this.inviteSender(gender, receiver.ref);
    await this.waitApproved(sender, 'invite sender');
    const sent = await this.sessions.client.call('API-004', {
      auth: AUTH.user(sender.token),
      device: sender.device,
      body: { ref: receiver.ref, invitation_type: 'story', reply_message: 'QA synthetic request' },
      retry: false,
    });
    writeRunPool(this.config.runId, (pool) => {
      const x = (pool.senders[String(this.slot)] ?? []).find((y) => y.mobileNumber === sender.mobileNumber);
      if (x && receiver.ref && !x.usedFor.includes(receiver.ref)) x.usedFor.push(receiver.ref);
    });
    let id: { id: string; key: string } | undefined;
    for (let i = 0; i < 3 && !id; i++) {
      if (i) await new Promise((r) => setTimeout(r, 2_000));
      list = await readList();
      id = idIn(list.json(), sender.ref);
    }
    if (!id)
      blockPrereq(
        PREREQ.connected.id,
        `No invite from a suite sender account (send_request_to_profile HTTP ${sent.status}, all_requests HTTP ${list.status}, entry not listed or without an id)`,
      );
    return found(id, 'new request');
  }

  /** Senders of `gender` this slot knows (run pool), logged in when first used. */
  private sendersOf(gender: 'Male' | 'Female'): { ref: string | undefined; mobileNumber: string }[] {
    return (readRunPool(this.config.runId).senders[String(this.slot)] ?? []).filter(
      (s) => s.gender === gender && !s.consumed,
    );
  }

  /** An invite sender of `gender` that never invited `receiverRef`: from the run pool, or onboarded now. */
  private async inviteSender(gender: 'Male' | 'Female', receiverRef: string | undefined): Promise<Profile> {
    const pooled = (readRunPool(this.config.runId).senders[String(this.slot)] ?? []).find(
      (s) =>
        s.gender === gender &&
        !s.consumed &&
        !(receiverRef && s.usedFor.includes(receiverRef)) &&
        !deletedInRun(this.config.runId, s.mobileNumber),
    );
    if (pooled) {
      const cached = this.profiles.get(`sender-${pooled.mobileNumber}`);
      if (cached) return cached;
      const s = await this.sessions.loginWithNumber(pooled.mobileNumber, pooled.deviceId);
      if (s.applicationStage === 'completed') {
        const p: Profile = { ...s, ref: s.ref ?? pooled.ref, gender, known: pooled.known };
        this.profiles.set(`sender-${pooled.mobileNumber}`, p);
        await this.requireActive(p, 'invite sender');
        return p;
      }
      // The number no longer has its account (a login created a new one): track it and use a new sender.
      const entry = this.record({
        mobileNumber: pooled.mobileNumber,
        deviceId: pooled.deviceId,
        note: 're-login to a lost invite sender created a new account',
      });
      Object.assign(entry, { userId: s.userId, ref: s.ref, applicationStage: s.applicationStage });
      this.flush();
      writeRunPool(this.config.runId, (pool) => {
        const x = (pool.senders[String(this.slot)] ?? []).find((y) => y.mobileNumber === pooled.mobileNumber);
        if (x) x.consumed = true;
      });
    }
    return this.newSender(gender);
  }

  /** Onboard a new invite sender of `gender` (its own gender's photo set) and keep it in the run pool. */
  private async newSender(gender: 'Male' | 'Female'): Promise<Profile> {
    extendTestTimeout(THROWAWAY_TIMEOUT_MS);
    let n = 0;
    writeRunPool(this.config.runId, (pool) => {
      n = pool.counters[`s${this.slot}`] ?? 0;
      pool.counters[`s${this.slot}`] = n + 1;
    });
    const values = {
      firstName: onboardingValues(this.config.runId, 20 + n).firstName,
      email: `${this.config.runId}-s${this.slot}-${n}@${(process.env.AISLE_TEST_EMAIL_DOMAIN || 'example.test').toLowerCase()}`,
    };
    const p = await this.onboardFresh(values, gender);
    const entry = this.ledger.find((e) => e.mobileNumber === p.mobileNumber);
    if (entry) entry.note = `invite sender (${gender})`;
    this.flush();
    writeRunPool(this.config.runId, (pool) => {
      (pool.senders[String(this.slot)] ??= []).push({
        mobileNumber: p.mobileNumber,
        deviceId: p.device.uniqueIdentifier,
        ref: p.ref,
        gender,
        known: values,
        usedFor: [],
      });
    });
    this.profiles.set(`sender-${p.mobileNumber}`, p);
    return p;
  }

  /**
   * Worker start (M2_CREATE_ACCOUNTS=true): onboard — once per slot and run — every account that needs staging's
   * approval, so the approval clock starts early and runs while other tests execute: pair accounts 0 (male) and
   * 1 (female), account 2 (approved routes, role B), the GATE account 3, a female invite sender and the deactivation
   * throwaway. Accounts already in the run pool are not touched (no request at all). Never throws; returns counts.
   * Off with M2_PREONBOARD=false.
   */
  async warmUp(): Promise<{ created: number; failed: number }> {
    const r = { created: 0, failed: 0 };
    if (!this.config.createAccounts || process.env.M2_PREONBOARD === 'false') return r;
    const pool = readRunPool(this.config.runId);
    const run = async (needed: boolean, make: () => Promise<unknown>) => {
      if (!needed) return;
      try {
        await make();
        r.created++;
      } catch {
        r.failed++; // e.g. onboarding refused or moderation: the test that needs the account blocks with the reason
      }
    };
    for (const i of [0, 1, 2, 3])
      await run(!this.config.onboardedNumbers[i] && !pool.onboarded[`${this.slot}:${i}`], () =>
        this.ownOnboarded(i),
      );
    await run(
      !(pool.senders[String(this.slot)] ?? []).some((s) => s.gender === 'Female' && !s.consumed),
      () => this.newSender('Female'),
    );
    await run(!pool.throwaways[`${this.slot}:${DEACTIVATION_KEY}`], () => this.throwaway(DEACTIVATION_KEY));
    if (r.created + r.failed) this.log.info('Pre-onboarded synthetic accounts', r);
    return r;
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
    // Audit fix 2026-10-25: every suite account of the RUN — other workers' accounts come from the shared run pool
    // (roles, onboarded, throwaways, senders, pairs), this worker's from memory and its ledger.
    const pool = readRunPool(this.config.runId);
    const all = [
      ...[
        ...this.pool.values(),
        ...this.profiles.values(),
        ...this.own.values(),
        ...this.throwaways.values(),
      ].map((s) => s.mobileNumber),
      ...this.ledger.map((e) => e.cleanupNumber ?? e.mobileNumber),
      ...Object.values(pool.roles).map((r) => r.mobileNumber),
      ...Object.values(pool.onboarded).map((r) => r.mobileNumber),
      ...Object.values(pool.throwaways).map((r) => r.mobileNumber),
      ...Object.values(pool.senders).flatMap((list) => list.map((r) => r.mobileNumber)),
      ...Object.values(pool.pairs).flatMap((p) => [p.a, p.b]),
    ];
    // Only well-formed synthetic numbers (a refused login variant may have tracked a malformed one).
    return [...new Set(all)].filter((n) => isAllowedTestNumber(n) && n !== self?.mobileNumber);
  }

  /** Every onboarded suite profile this worker holds (pooled and throwaway) — for value checks of list entries. */
  suiteProfiles(): Profile[] {
    const out = new Map<string, Profile>();
    for (const p of [...this.profiles.values(), ...this.throwaways.values()]) out.set(p.mobileNumber, p);
    return [...out.values()];
  }

  /** The suite profile with this ref (this worker's), if any. */
  profileByRef(ref: string | undefined): Profile | undefined {
    if (!ref) return undefined;
    return this.suiteProfiles().find((p) => p.ref === ref);
  }

  /**
   * A Dev-provided account in a special state (M2Q-32): M2_ACCOUNT_HIDDEN_NAME,
   * M2_ACCOUNT_DEACTIVATED (one synthetic number each). Without it the test is Blocked.
   */
  async special(state: 'HIDDEN_NAME' | 'DEACTIVATED'): Promise<Profile> {
    const number = process.env[`M2_ACCOUNT_${state}`]?.trim();
    if (!number) blockPrereq(PREREQ.states.id, `${PREREQ.states.reason} — set M2_ACCOUNT_${state}`);
    return this.profileFor(number, `special-${state}`);
  }

  web(): never {
    return blockPrereq(PREREQ.web.id, PREREQ.web.reason);
  }

  private webJwtCache: Promise<Secret | undefined> | undefined;

  /**
   * A web JWT (ptfrm "web") of the suite's onboarded account 1 — only as the WRONG credential type of the TOKEN
   * checks (session.ts webToken; the account's app token is not touched). Blocks when accounts cannot be created or
   * staging issues no web token.
   */
  async webJwt(): Promise<Secret> {
    this.requireCreate();
    this.webJwtCache ??= (async () => this.sessions.webToken(await this.onboarded(1)))();
    const token = await this.webJwtCache;
    if (!token) blockPrereq(PREREQ.webJwt.id, PREREQ.webJwt.reason);
    return token;
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
    approvalSince(this.config.runId, p.mobileNumber); // the approval clock starts at onboarding
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

/** An account kept in the run pool (git-ignored, no tokens). */
interface PooledAccount {
  mobileNumber: string;
  deviceId: string;
  ref: string | undefined;
  gender?: 'Male' | 'Female';
  known?: { firstName: string; email: string };
  /** Deleted, reset, deactivated for good or otherwise used up: never handed out again. */
  consumed?: boolean;
}

export interface RunPool {
  roles: Record<string, { mobileNumber: string; deviceId: string }>;
  onboarded: Record<string, { mobileNumber: string; deviceId: string; ref: string | undefined }>;
  /** `${slot}:${key}` → throwaway account of that key (A1, 2026-10-24). */
  throwaways: Record<string, PooledAccount>;
  /** slot → invite senders; `usedFor` lists the receiver refs each one already invited. */
  senders: Record<string, (PooledAccount & { usedFor: string[] })[]>;
  /** slot → the suite pair (numbers of accounts 0 / 1, like statuses, conversation id once listed). */
  pairs: Record<string, { a: string; b: string; likes: number[]; conversationId?: string }>;
  /** account number → when its approval clock started (ISO time; onboarding or first wait). */
  approval: Record<string, string>;
  /** Run-unique counters (fake values of throwaways / senders per slot). */
  counters: Record<string, number>;
}
const poolFile = (runId: string) => path.join(ROOT, ACCOUNTS_DIR, `${runId}-pool.json`);

/** The run's shared account pool (git-ignored, no tokens): which number serves which role / index / key. */
export function readRunPool(runId: string): RunPool {
  const f = poolFile(runId);
  const raw = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Partial<RunPool>) : {};
  return {
    roles: raw.roles ?? {},
    onboarded: raw.onboarded ?? {},
    throwaways: raw.throwaways ?? {},
    senders: raw.senders ?? {},
    pairs: raw.pairs ?? {},
    approval: raw.approval ?? {},
    counters: raw.counters ?? {},
  };
}

function writeRunPool(runId: string, change: (p: RunPool) => void): void {
  const pool = readRunPool(runId);
  change(pool);
  mkdirSync(path.dirname(poolFile(runId)), { recursive: true });
  writeFileSync(poolFile(runId), JSON.stringify(pool, null, 2));
}

/** When the approval clock of an account started (epoch ms); starts it now when it has not started yet. */
export function approvalSince(runId: string, mobileNumber: string): number {
  const known = readRunPool(runId).approval[mobileNumber];
  if (known) return Date.parse(known);
  const now = new Date();
  writeRunPool(runId, (p) => {
    p.approval[mobileNumber] ??= now.toISOString();
  });
  return Date.parse(readRunPool(runId).approval[mobileNumber] ?? now.toISOString());
}

/** True when any ledger of this run records `mobileNumber` as deleted (never log into it again). */
export function deletedInRun(runId: string, mobileNumber: string): boolean {
  const dir = path.join(ROOT, ACCOUNTS_DIR);
  if (!existsSync(dir)) return false;
  return readdirSync(dir)
    .filter((f) => f.startsWith(runId) && f.endsWith('.json') && !f.endsWith('-pool.json'))
    .some((f) =>
      (JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { accounts: LedgerEntry[] }).accounts.some(
        (e) => e.deleted === true && (e.cleanupNumber ?? e.mobileNumber) === mobileNumber,
      ),
    );
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
