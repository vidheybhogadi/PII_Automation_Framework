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
 *
 * Ledger: every number the suite creates is written to reports/m2/accounts/<run>-w<n>.json (git-ignored: full
 * synthetic number, app user id, ref, device id, stage, profile state, deletion outcome — never tokens) BEFORE any
 * call is made. At the end every created account is deleted (POST /V1/user/delete {id: ref, reason_id: 1}); a
 * never-onboarded account is onboarded first so that it can be deleted; "disabled" profiles are marked unusable.
 * Dev-provided accounts are never deleted.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ApiResponse } from '../../../core/http/api-response';
import type { Logger } from '../../../core/utils/logger';
import { registerSecretValue } from '../../../core/utils/redaction';
import { field, SessionHelper, USER_TOKEN_PLACEHOLDER, type UserSession } from '../auth/session';
import { isAllowedTestNumber } from '../auth/test-phone';
import type { M2Config } from '../config/m2-config';
import { ROOT } from '../design';
import { blockPrereq, PREREQ } from '../prereq';
import { onboard, ownState, UNUSABLE_STATES } from './onboarding';

export interface Profile extends UserSession {
  /** Profile ref (from the verify reply or the own-profile read). */
  readonly ref: string | undefined;
}

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
  note?: string;
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

export class Accounts {
  readonly sessions: SessionHelper;
  private readonly pool = new Map<string, UserSession>();
  private readonly profiles = new Map<string, Profile>();
  /** Latest session of every account this worker created (for clean-up). */
  private readonly own = new Map<string, UserSession>();
  private readonly ledger: LedgerEntry[] = [];
  private readonly ledgerFile: string;

  constructor(
    private readonly config: M2Config,
    private readonly log: Logger,
    workerIndex: number,
  ) {
    this.sessions = new SessionHelper(config, log, workerIndex);
    this.ledgerFile = path.join(ROOT, ACCOUNTS_DIR, `${config.runId}-w${workerIndex}.json`);
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
    const known = readRunPool(this.config.runId).roles[role];
    const s = known
      ? await this.sessions.loginWithNumber(known.mobileNumber, known.deviceId)
      : await this.freshUser();
    if (!known)
      writeRunPool(
        this.config.runId,
        (p) => (p.roles[role] = { mobileNumber: s.mobileNumber, deviceId: s.device.uniqueIdentifier }),
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

  /** Two matched profiles (M2_CONNECTED_ACCOUNTS) — matching needs approved, discoverable profiles (M2Q-32). */
  async connectedPair(): Promise<[Profile, Profile]> {
    const [a, b] = this.config.connectedNumbers;
    if (!a || !b) blockPrereq(PREREQ.connected.id, PREREQ.connected.reason);
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

  /** Create + onboard an account for index i (gender Male with the male photo set). */
  private async ownOnboarded(i: number): Promise<Profile> {
    const key = `own-onboarded-${i}`;
    const cached = this.profiles.get(key);
    if (cached) return cached;
    this.requireCreate();
    const known = readRunPool(this.config.runId).onboarded[String(i)];
    if (known) {
      // Onboarded earlier in this run (another worker): log in again, never re-create or re-onboard.
      const again = await this.sessions.loginWithNumber(known.mobileNumber, known.deviceId);
      const p: Profile = { ...again, ref: again.ref ?? known.ref };
      this.profiles.set(key, p);
      return p;
    }
    const fresh = await this.freshUser();
    const entry = this.ledger.find((e) => e.mobileNumber === fresh.mobileNumber)!;
    const domain = (process.env.AISLE_TEST_EMAIL_DOMAIN || 'example.test').toLowerCase();
    let done;
    try {
      done = await onboard(this.sessions, this.config, fresh, {
        firstName: `Qa${this.config.runId.slice(-4).replace(/\d/g, (d) => String.fromCharCode(97 + Number(d)))}${'abcdefghij'[i % 10]}`,
        email: `${this.config.runId}-${i}@${domain}`,
        gender: 'Male', // default; photos always match the declared gender
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
    const p: Profile = { ...done.session, ref: done.ref ?? fresh.ref };
    Object.assign(entry, {
      onboarded: true,
      ref: p.ref,
      applicationStage: 'completed',
      profileState: done.profileState,
    });
    this.flush();
    writeRunPool(this.config.runId, (pool) => {
      pool.onboarded[String(i)] = {
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
    const p: Profile = { ...s, ref: s.ref ?? findRef(own.json()) };
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
  let ref = entry.ref ?? s.ref;
  if (!entry.onboarded) {
    // Delete needs a profile: onboard the bare account first (synthetic values, then deleted at once).
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
      entry.note = `could not onboard for deletion: ${(e as Error).message}`;
    }
  }
  const st = await ownState(sessions, s);
  entry.profileState = st.profileState ?? entry.profileState;
  ref = ref ?? st.ref;
  if (st.profileState === 'disabled') {
    Object.assign(entry, {
      unusable: true,
      deleted: false,
      note: 'disabled profile — cannot be recovered or deleted',
    });
    return false;
  }
  if (!ref) {
    Object.assign(entry, { deleted: false, note: 'no profile ref — cannot delete' });
    return false;
  }
  const res = await sessions.deleteAccount(s, ref);
  Object.assign(entry, { deleted: ok(res), deleteStatus: res.status });
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
 * Delete the not-yet-deleted accounts of ledger files (all runs, or one run): log in again with the number
 * (OTP 1234), onboard a bare account if needed, then POST /V1/user/delete. Disabled profiles are marked unusable.
 * Used by the global teardown (current run) and `npm run m2:accounts:cleanup` (all runs). Counts only.
 */
export async function cleanupLedgers(
  config: M2Config,
  sessions: SessionHelper,
  runId?: string,
): Promise<{ deleted: number; leftBehind: number; skipped: number }> {
  const dir = path.join(ROOT, ACCOUNTS_DIR);
  const files = existsSync(dir)
    ? readdirSync(dir).filter(
        (f) => f.endsWith('.json') && !f.endsWith('-pool.json') && (!runId || f.startsWith(runId)),
      )
    : [];
  let deleted = 0;
  let leftBehind = 0;
  let skipped = 0;
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
      if (e.deleted === true || e.unusable || !isAllowedTestNumber(number) || done.has(number)) {
        skipped++;
        if (done.has(number) && e.deleted !== true) {
          e.deleted = true;
          e.note = `${e.note ?? ''} (same account as an entry already deleted)`.trim();
          writeFileSync(file, JSON.stringify(ledger, null, 2));
        }
        continue;
      }
      if (e.note?.startsWith('wrong-OTP') || e.note?.includes('refused')) {
        skipped++;
        continue;
      }
      try {
        const s = await sessions.loginWithNumber(number, e.deviceId);
        e.ref = e.ref ?? s.ref;
        if (s.applicationStage === 'completed') e.onboarded = true;
        if (await deleteOwnAccount(sessions, config, s, e)) {
          deleted++;
          done.add(number);
        } else leftBehind++;
      } catch (err) {
        e.note = `clean-up failed: ${(err as Error).name}`;
        leftBehind++;
      }
      writeFileSync(file, JSON.stringify(ledger, null, 2));
    }
  }
  return { deleted, leftBehind, skipped };
}
