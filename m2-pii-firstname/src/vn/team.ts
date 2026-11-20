/**
 * The vernac team users and their sessions.
 *
 * Discovery (read-only, M2FN-VSET-001): the nine team numbers → their not-deleted users per in-scope app (profile
 * state, hide flag, selfie, review status), whether each has a PII NAME row (PII DB), the existing relations AMONG
 * them (likes, passes, invites, blocks, conversations) and the name flags / PII tenants of the apps. Nothing is
 * created: the QA lead allows only relations that already exist (M2FNQ-34) and no new users (M2FNQ-51).
 *
 * Login: POST /v1/session/verify_number_login {mobile_number, otp: 1234} with the app-name header (test numbers pass
 * the fixed OTP without an SMS step, phone_number.rb:501-502). The guard refuses a login unless the DB shows an
 * existing user with a profile for that number in that app (a login would otherwise create one). Logins go through
 * a client without a recorder; the token is registered as $M2FN_VN_USER_TOKEN before it is used.
 */
import type { Logger } from '../../../core/utils/logger';
import { registerSecretValue } from '../../../core/utils/redaction';
import { Secret } from '../../../core/utils/secret';
import { VN, VnClient } from './client';
import type { VnConfig } from './config';
import type { VnDb } from './db';
import { assertLoginAllowed, TEAM_NUMBERS, VN_APPS, type VnApp } from './guard';

/** account_profiles.profile_state enum (profile.rb:34). */
export const PROFILE_STATE = [
  'pending',
  'approved',
  'disapproved',
  'deactivated',
  'awaiting_approval',
  'image_inappropriate',
  'image_pending_approval',
  'pending_deactivated',
  'disapproved_deactivated',
  'banned_state',
  'pending_not_verified',
  'vip_disapproved',
  'bad_actor',
  'processing',
  'disabled',
  'disabled_temporarily',
  'inactive',
] as const;
const HIVE_REVIEWED = 3; // admin_review_status enum: review_pending, review_passed, review_failed, hive_reviewed
const SELFIE_VERIFIED = 1; // selfie_verifications.status: not_verified, verified, disqualified, day_limit_reached

export interface TeamUser {
  number: string;
  /** "…<digit>" — how reports name a team number. */
  label: string;
  app: VnApp;
  userId: string;
  ref: string | undefined;
  hasProfile: boolean;
  state: string | undefined;
  hide: boolean;
  selfieVerified: boolean;
  hasSelfieRecord: boolean;
  hiveReviewed: boolean;
  /** A PII NAME row exists for this user in its app’s tenant. */
  hasPiiName: boolean;
}

export interface Pair {
  a: string;
  b: string;
}

export interface Team {
  users: TeamUser[];
  tenants: Partial<Record<VnApp, string>>;
  flags: Partial<Record<VnApp, { read: boolean; write: boolean }>>;
  testNumbers: number;
  likes: (Pair & { likedBack: boolean; passed: boolean })[];
  passes: Pair[];
  invites: (Pair & { status: number })[];
  blocks: Pair[];
  conversations: (Pair & { id: string; linkType: number; full: boolean })[];
  /** Users seen in an out-of-scope app (logged, never used). */
  skipped: { app: string; label: string }[];
}

const APP_BY_ID = Object.fromEntries(Object.entries(VN_APPS).map(([n, id]) => [id, n])) as Record<
  number,
  VnApp
>;

export async function discoverTeam(db: VnDb, apps: VnApp[]): Promise<Team> {
  const rows = await db.appQuery<Record<string, unknown>>('teamUsers', [[...TEAM_NUMBERS]]);
  const users: TeamUser[] = [];
  const skipped: Team['skipped'] = [];
  for (const r of rows) {
    const number = String(r.number);
    const label = `…${number.slice(3, 4)}`;
    const app = APP_BY_ID[Number(r.app_id)];
    if (!app || !apps.includes(app)) {
      skipped.push({ app: String(r.app_id), label });
      continue;
    }
    users.push({
      number,
      label,
      app,
      userId: String(r.user_id),
      ref: r.ref ? String(r.ref) : undefined,
      hasProfile: Boolean(r.ref),
      state:
        r.profile_state === null || r.profile_state === undefined
          ? undefined
          : PROFILE_STATE[Number(r.profile_state)],
      hide: r.hide_first_name === true,
      selfieVerified: Number(r.selfie_status) === SELFIE_VERIFIED,
      hasSelfieRecord: r.selfie_status !== null && r.selfie_status !== undefined,
      hiveReviewed: Number(r.admin_review_status) === HIVE_REVIEWED,
      hasPiiName: false,
    });
  }
  db.suite = new Set(users.map((u) => u.userId));
  const appIds = apps.map((a) => VN_APPS[a]);
  const tenants: Team['tenants'] = {};
  for (const t of await db.appQuery<Record<string, unknown>>('tenants', [appIds]))
    if (APP_BY_ID[Number(t.app_id)] && t.pii_tenant_id)
      tenants[APP_BY_ID[Number(t.app_id)]!] = String(t.pii_tenant_id);
  const flags: Team['flags'] = {};
  for (const f of await db.appQuery<Record<string, unknown>>('nameFlags', [appIds])) {
    const app = APP_BY_ID[Number(f.app_id)];
    if (!app) continue;
    const cur = (flags[app] ??= { read: false, write: false });
    if (f.feature === 'pii_name_read') cur.read = f.enabled === true;
    if (f.feature === 'pii_name_write') cur.write = f.enabled === true;
  }
  const ids = [...db.suite];
  if (ids.length) {
    const named = await db.piiQuery<Record<string, unknown>>('nameRows', [ids, Object.values(tenants)]);
    for (const n of named) {
      const u = users.find((x) => x.userId === String(n.user_id) && tenants[x.app] === String(n.tenant_id));
      if (u) u.hasPiiName = true;
    }
  }
  const pairs = async (q: string) => (ids.length ? await db.appQuery<Record<string, unknown>>(q, [ids]) : []);
  const [likes, passes, invites, blocks, convs] = await Promise.all([
    pairs('likesAmongSuite'),
    pairs('passesAmongSuite'),
    pairs('requestsAmongSuite'),
    pairs('blocksAmongSuite'),
    pairs('conversationsAmongSuite'),
  ]);
  const testNumbers = Number(
    (await db.appQuery<{ n: number }>('teamTestNumbers', [TEAM_NUMBERS.map((n) => `+91${n}`)]))[0]?.n ?? 0,
  );
  return {
    users,
    tenants,
    flags,
    testNumbers,
    likes: likes.map((l) => ({
      a: String(l.a),
      b: String(l.b),
      likedBack: l.liked_back === true,
      passed: l.passed === true,
    })),
    passes: passes.map((p) => ({ a: String(p.a), b: String(p.b) })),
    invites: invites.map((p) => ({ a: String(p.a), b: String(p.b), status: Number(p.status) })),
    blocks: blocks.map((p) => ({ a: String(p.a), b: String(p.b) })),
    conversations: convs.map((c) => ({
      a: String(c.a),
      b: String(c.b),
      id: String(c.conversation_id),
      linkType: Number(c.link_type),
      full: c.full_connection === true,
    })),
    skipped,
  };
}

export const userById = (team: Team, id: string) => team.users.find((u) => u.userId === id);

/** Usable for logins: has a profile and is not deleted (the query already drops deleted users). */
export const usable = (u: TeamUser) => u.hasProfile && Boolean(u.ref);

/**
 * May the suite rename / edit this user? It must have a PII NAME already (a rename would otherwise CREATE one, which
 * cannot be undone), must not be hive-reviewed (update_profile_data would call review_passed!, admin_user.rb:143) and
 * must have a profile.
 */
export const writable = (u: TeamUser) => usable(u) && u.hasPiiName && !u.hiveReviewed;

export class TeamSessions {
  private readonly client: VnClient;
  private readonly tokens = new Map<string, Promise<Secret>>();

  constructor(
    private readonly config: VnConfig,
    log: Logger,
    private readonly team: () => Team,
  ) {
    this.client = new VnClient(config.baseUrl, log); // no recorder: the login reply carries a fresh token
  }

  /** The user JWT of `u` (one login per user and worker). */
  token(u: TeamUser): Promise<Secret> {
    const key = `${u.app}:${u.userId}`;
    let p = this.tokens.get(key);
    if (!p) {
      p = this.login(u);
      this.tokens.set(key, p);
      p.catch(() => this.tokens.delete(key));
    }
    return p;
  }

  private async login(u: TeamUser): Promise<Secret> {
    const known = this.team().users.find(
      (x) => x.app === u.app && x.number === u.number && x.userId === u.userId,
    );
    assertLoginAllowed({
      baseUrl: this.config.baseUrl,
      app: u.app,
      number: u.number,
      knownUser: known ? { app: known.app, number: known.number, hasProfile: usable(known) } : undefined,
    });
    const res = await this.client.call(VN.login, {
      app: u.app,
      body: { mobile_number: u.number, otp: '1234' },
    });
    const body = res.json() as { auth_token?: unknown; ref?: unknown; id?: unknown } | undefined;
    const token = typeof body?.auth_token === 'string' ? body.auth_token : '';
    if (res.status !== 200 || !token)
      throw new Error(`Vernac login of team user ${u.label} (${u.app}): HTTP ${res.status}`);
    registerSecretValue(token, '$M2FN_VN_USER_TOKEN');
    return new Secret(token);
  }
}
