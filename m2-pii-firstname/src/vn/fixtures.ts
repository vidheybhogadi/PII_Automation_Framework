/**
 * Playwright fixtures of the vernac first-name cases (project m2fn-vn-api, one worker, testapp.koode.co).
 *
 * Worker scope: settings, the read-only vernac DB, the team discovery (once), the team user sessions and the vernac
 * CMS admin / associate sessions. Test scope: `vn` — a recording client (exact requests / responses in the report,
 * tokens as placeholders) and the save-and-restore registry. Its teardown restores every saved original, even when
 * the test failed, verifies it, and fails the test loudly when a restore does not hold.
 */
import { test as base, expect } from '@playwright/test';
import type { ApiResponse } from '../../../core/http/api-response';
import { ExchangeRecorder } from '../../../core/utils/exchange-recorder';
import { Logger } from '../../../core/utils/logger';
import type { Secret } from '../../../core/utils/secret';
import { loadM2Config, type M2Config } from '../../../m2/src/config/m2-config';
import { blockPrereq } from '../../../m2/src/prereq';
import { CmsAdmins, type CmsTarget } from '../cms-admin';
import type { M2fnConfig } from '../config';
import { VN, VnClient, type VnCall, type VnRoute } from './client';
import { loadVnConfig, type VnConfig } from './config';
import { VnDb } from './db';
import { assertVnHost, type VnApp } from './guard';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { editBody, JOURNAL, journalAdd, journalDone, type Original } from './restore';

/** Written when a restore fails: every later vernac test of the run then stops before touching anything. */
export const RESTORE_FAILED = path.join(path.dirname(JOURNAL), 'RESTORE-FAILED');
import type { VnKeyScope } from './redis';
import { discoverTeam, TeamSessions, writable, type Team, type TeamUser } from './team';

const VN_CMS: CmsTarget = {
  placeholder: { admin: '$M2FN_VN_CMS_ADMIN_TOKEN', associate: '$M2FN_VN_CMS_ASSOCIATE_TOKEN' },
  prereq: {
    admin: {
      id: 'M2FN-VN-CMS-ADMIN',
      reason:
        'No vernac CMS admin login configured here — set M2FN_VN_CMS_ADMIN_EMAIL, M2FN_VN_CMS_ADMIN_PASSWORD and M2FN_VN_CMS_ADMIN_TOTP_SECRET',
    },
    associate: {
      id: 'M2FN-VN-CMS-ASSOCIATE',
      reason:
        'No vernac CMS associate login configured here — set M2FN_VN_CMS_ASSOCIATE_EMAIL and M2FN_VN_CMS_ASSOCIATE_PASSWORD',
    },
  },
};

export const VN_BLOCK = {
  db: 'M2FN-VN-DB',
  run: 'M2FN-VN-RUN',
  state: 'M2FN-VN-STATE',
} as const;

const secretOf = (a: { kind: string; secret?: Secret }): Secret => {
  if (a.kind !== 'secret' || !a.secret) throw new Error('CMS session without a token');
  return a.secret;
};

export interface VnWorker {
  cfg: VnConfig;
  m2: M2Config;
  db: VnDb | undefined;
  team: () => Promise<Team>;
  sessions: TeamSessions;
  cms: CmsAdmins;
  log: Logger;
}

/** Everything a vernac case needs. */
export class VnCtx {
  private readonly saved = new Map<string, Original>();
  constructor(
    readonly w: VnWorker,
    readonly team: Team,
    readonly db: VnDb,
    readonly client: VnClient,
    readonly observe: (label: string, res: ApiResponse) => void,
  ) {}

  get cfg(): VnConfig {
    return this.w.cfg;
  }
  get runId(): string {
    return this.w.m2.runId;
  }

  admin = async (): Promise<Secret> => secretOf(await this.w.cms.admin());
  associate = async (): Promise<Secret> => secretOf(await this.w.cms.associate());

  /** Call as a team user (its own app, its JWT). */
  async asUser(u: TeamUser, route: VnRoute, o: Omit<VnCall, 'app' | 'auth'> = {}, app: VnApp = u.app) {
    const res = await this.client.call(route, { ...o, app, auth: await this.w.sessions.token(u) });
    this.observe(`${route.key} as ${u.app} ${u.label}`, res);
    return res;
  }

  /** Call as the CMS admin (app-name of the member’s app). */
  async asAdmin(route: VnRoute, app: VnApp, o: Omit<VnCall, 'app' | 'auth'> = {}) {
    const res = await this.client.call(route, { ...o, app, auth: await this.admin() });
    this.observe(`${route.key} as CMS admin`, res);
    return res;
  }

  /** The CMS view of a member: GET /admin/users/:ref → user (first_name through the PII getter). */
  async cmsUser(u: TeamUser): Promise<{ status: number; user: Record<string, unknown> }> {
    const res = await this.asAdmin(VN.cmsUser, u.app, { pathParams: { ref: u.ref! } });
    const body = res.json() as { user?: Record<string, unknown> } | undefined;
    return { status: res.status, user: body?.user ?? {} };
  }

  async cmsName(u: TeamUser): Promise<string | undefined> {
    const { user } = await this.cmsUser(u);
    return typeof user.first_name === 'string' ? user.first_name : undefined;
  }

  /** account_profiles.first_name equals `name` (boolean), and whether it holds a double inner space. */
  async dbName(u: TeamUser, name: string): Promise<{ isValue: boolean; double: boolean }> {
    const r = (
      await this.db.appQuery<Record<string, unknown>>('profileNameIs', [[...this.db.suite], u.userId, name])
    )[0];
    return { isValue: r?.is_value === true, double: r?.has_double_space === true };
  }

  async dbHide(u: TeamUser): Promise<{ hide: boolean; timeSet: boolean; state: number | undefined }> {
    const r = (
      await this.db.appQuery<Record<string, unknown>>('profileState', [[...this.db.suite], u.userId])
    )[0];
    return {
      hide: r?.hide_first_name === true,
      timeSet: r?.hide_time_set === true,
      state: r?.profile_state as number | undefined,
    };
  }

  async piiRow(u: TeamUser): Promise<{ hash: string; updatedAt: string } | undefined> {
    const tenant = this.team.tenants[u.app];
    if (!tenant) return undefined;
    const rows = await this.db.piiQuery<Record<string, unknown>>('nameRows', [[...this.db.suite], [tenant]]);
    const r = rows.find((x) => String(x.user_id) === u.userId);
    if (!r) return undefined;
    const at = r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at);
    return { hash: String(r.ciphertext_hash), updatedAt: at };
  }

  async piiNotPlaintext(u: TeamUser, name: string): Promise<boolean> {
    const tenant = this.team.tenants[u.app]!;
    const r = await this.db.piiQuery<Record<string, unknown>>('nameNotPlaintext', [
      [...this.db.suite],
      u.userId,
      tenant,
      name,
    ]);
    return r[0]?.not_plaintext === true;
  }

  keyScope(): VnKeyScope {
    return {
      runId: this.runId,
      env: this.cfg.redisEnv,
      callerId: this.cfg.piiCallerId,
      tenants: new Set(Object.values(this.team.tenants)),
      userIds: new Set(this.team.users.map((u) => u.userId)),
      refs: new Set(this.team.users.flatMap((u) => (u.ref ? [u.ref] : []))),
      conversations: new Set(this.team.conversations.map((c) => c.id)),
    };
  }

  // ---- save and restore ---------------------------------------------------------------------------------------------
  /**
   * Save a team user’s originals before any change (once per test). Refuses (blocks) a user the suite may not write:
   * no PII name yet, hive-reviewed, or Postgres already different from PII.
   */
  async save(u: TeamUser): Promise<Original> {
    const key = `${u.app}:${u.userId}`;
    const have = this.saved.get(key);
    if (have) return have;
    if (!this.cfg.run)
      blockPrereq(
        VN_BLOCK.run,
        'Writes on team accounts run only with M2FN_VN_RUN=true (QA lead 2026-11-11)',
      );
    if (!writable(u))
      blockPrereq(
        VN_BLOCK.state,
        `Team user ${u.label} (${u.app}) is not writable: it needs a PII name already and no hive review`,
      );
    const { status, user } = await this.cmsUser(u);
    const name = typeof user.first_name === 'string' ? user.first_name : '';
    if (status !== 200 || !name)
      throw new Error(`CMS view of team user ${u.label} (${u.app}): HTTP ${status}, no name`);
    const db = await this.dbName(u, name);
    if (!db.isValue)
      blockPrereq(
        VN_BLOCK.state,
        `Team user ${u.label} (${u.app}) already has a Postgres name that differs from PII — not used for writes`,
      );
    const hide = (await this.dbHide(u)).hide;
    const o = journalAdd({
      key,
      app: u.app,
      userId: u.userId,
      ref: u.ref!,
      label: u.label,
      firstName: name,
      gender: String(user.gender ?? ''),
      dateOfBirth: String(user.date_of_birth ?? ''),
      phoneCodeId: (user.phone_code_id as number | string | undefined) ?? '',
      number: String(user.fetch_only_number ?? ''),
      hide,
      savedAt: new Date().toISOString(),
    });
    this.saved.set(key, o);
    return o;
  }

  original(u: TeamUser): Original {
    const o = this.saved.get(`${u.app}:${u.userId}`);
    if (!o) throw new Error(`save() the team user ${u.label} before changing it`);
    return o;
  }

  /** CMS rename (POST /admin/update_profile) of a saved user, every other field unchanged. */
  async rename(u: TeamUser, firstName: string, route: VnRoute = VN.cmsUpdateProfile): Promise<ApiResponse> {
    const o = await this.save(u);
    return this.asAdmin(route, u.app, { body: editBody(o, firstName) });
  }

  /** Toggle the hide setting of a saved user (as the user). */
  async toggleHide(u: TeamUser): Promise<ApiResponse> {
    await this.save(u);
    return this.asUser(u, VN.toggleHide, { body: {} });
  }

  /**
   * Set the hide setting of a team user to `want` for this test (saved first, put back in teardown). Toggles only
   * when the DB flag differs; blocks when the toggle does not take effect (it needs a verified selfie).
   */
  async setHide(u: TeamUser, want: boolean): Promise<void> {
    await this.save(u);
    if ((await this.dbHide(u)).hide === want) return;
    const r = await this.asUser(u, VN.toggleHide, { body: {} });
    if (r.status !== 200 || (await this.dbHide(u)).hide !== want)
      blockPrereq(
        VN_BLOCK.state,
        `Team user ${u.label} (${u.app}): the hide setting could not be turned ${want ? 'on' : 'off'} (toggle_hide_name needs a verified selfie)`,
      );
  }

  /** Re-read the likes among the team users (after the suite created one). */
  async refreshLikes(): Promise<void> {
    const rows = await this.db.appQuery<Record<string, unknown>>('likesAmongSuite', [[...this.db.suite]]);
    this.team.likes.splice(
      0,
      this.team.likes.length,
      ...rows.map((l) => ({
        a: String(l.a),
        b: String(l.b),
        likedBack: l.liked_back === true,
        passed: l.passed === true,
      })),
    );
  }

  /**
   * Record a change between team users that cannot be undone (a like, a chat message): a test annotation and a line
   * in reports/m2fn-vn/irreversible-effects.json (labels and apps only — never names, numbers or tokens).
   */
  irreversible(app: VnApp, what: string): void {
    const description = `${app}: ${what}`;
    base.info().annotations.push({ type: 'irreversible', description });
    const file = path.join(path.dirname(JOURNAL), 'irreversible-effects.json');
    let all: unknown[] = [];
    try {
      all = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown[]) : [];
    } catch {
      all = [];
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify(
        [...all, { at: new Date().toISOString(), test: base.info().title.split(' ')[0], app, what }],
        null,
        2,
      ),
    );
  }

  /** Restore every saved original; returns the problems (empty = every restore verified). */
  async restoreAll(): Promise<string[]> {
    const problems: string[] = [];
    for (const o of this.saved.values()) {
      const u = this.team.users.find((x) => x.app === o.app && x.userId === o.userId)!;
      try {
        if ((await this.dbHide(u)).hide !== o.hide) {
          const r = await this.client.call(VN.toggleHide, {
            app: u.app,
            auth: await this.w.sessions.token(u),
            body: {},
          });
          this.observe(`restore hide ${u.label}`, r);
        }
        const cms = await this.cmsName(u);
        const db = await this.dbName(u, o.firstName);
        if (cms !== o.firstName || !db.isValue) {
          const r = await this.client.call(VN.cmsUpdateProfile, {
            app: u.app,
            auth: await this.admin(),
            body: editBody(o, o.firstName),
          });
          this.observe(`restore name ${u.label}`, r);
        }
        const okName = (await this.cmsName(u)) === o.firstName;
        const okDb = (await this.dbName(u, o.firstName)).isValue;
        const okHide = (await this.dbHide(u)).hide === o.hide;
        if (okName && okDb && okHide) journalDone(o.key);
        else
          problems.push(
            `RESTORE FAILED for team user ${u.label} (${u.app}, ref ${o.ref}): name ${okName ? 'ok' : 'NOT restored'}, Postgres ${okDb ? 'ok' : 'NOT restored'}, hide ${okHide ? 'ok' : 'NOT restored'} — run npm run m2fn:vn:restore`,
          );
      } catch (e) {
        problems.push(
          `RESTORE FAILED for team user ${o.label} (${o.app}, ref ${o.ref}): ${String(e).slice(0, 160)}`,
        );
      }
    }
    this.saved.clear();
    return problems;
  }
}

interface VnTestFixtures {
  vn: VnCtx;
}
interface VnWorkerFixtures {
  vnWorker: VnWorker;
}

export const test = base.extend<VnTestFixtures, VnWorkerFixtures>({
  vnWorker: [
    async ({}, use) => {
      const cfg = loadVnConfig();
      assertVnHost(cfg.baseUrl);
      const m2 = loadM2Config();
      const log = new Logger({ level: m2.logging.level, toConsole: m2.logging.toConsole });
      const db = VnDb.open(m2, cfg.dbName, cfg.piiDbName);
      let team: Promise<Team> | undefined;
      const teamNow = { value: undefined as Team | undefined };
      const m2fn: M2fnConfig = {
        admin: cfg.admin,
        associate: cfg.associate,
        nonStringKey: undefined,
        redisOutageWindow: false,
        flagWindow: undefined,
        piiOutageWindow: false,
        batchAccounts: false,
      };
      const cms = new CmsAdmins(m2fn, { ...m2, baseUrl: cfg.baseUrl }, log, VN_CMS);
      const sessions = new TeamSessions(cfg, log, () => teamNow.value!);
      await use({
        cfg,
        m2,
        db,
        log,
        cms,
        sessions,
        team: () => {
          team ??= discoverTeam(db!, cfg.apps).then((t) => (teamNow.value = t));
          team.catch(() => (team = undefined));
          return team;
        },
      });
      await db?.close();
    },
    { scope: 'worker' },
  ],

  vn: async ({ vnWorker }, use, testInfo) => {
    if (existsSync(RESTORE_FAILED))
      blockPrereq(
        'M2FN-VN-RESTORE',
        `A restore failed earlier (${RESTORE_FAILED}) — run npm run m2fn:vn:restore, check, then delete the marker`,
      );
    if (!vnWorker.db || !(await vnWorker.db.reachable()))
      blockPrereq(
        VN_BLOCK.db,
        'The read-only vernac DB (desiapp_production + pii on the .env DB_* server) is not configured or not reachable',
      );
    const team = await vnWorker.team();
    const recorder = new ExchangeRecorder();
    const log = new Logger({
      level: vnWorker.m2.logging.level,
      toConsole: vnWorker.m2.logging.toConsole,
      context: { test: testInfo.title.split(' ')[0] },
    });
    const observe = (label: string, res: ApiResponse) =>
      testInfo.annotations.push({ type: 'observed', description: `${label}: HTTP ${res.status}` });
    const ctx = new VnCtx(
      vnWorker,
      team,
      vnWorker.db,
      new VnClient(vnWorker.cfg.baseUrl, log, recorder),
      observe,
    );
    let problems: string[] = [];
    try {
      await use(ctx);
    } finally {
      problems = await ctx.restoreAll();
      const exchanges = recorder.exchanges();
      if (exchanges.length)
        await testInfo.attach('api-exchanges.json', {
          body: JSON.stringify(exchanges, null, 2),
          contentType: 'application/json',
        });
      for (const p of problems) testInfo.annotations.push({ type: 'restore-failed', description: p });
    }
    if (problems.length) {
      mkdirSync(path.dirname(RESTORE_FAILED), { recursive: true });
      writeFileSync(
        RESTORE_FAILED,
        `${new Date().toISOString()} ${testInfo.title.split(' ')[0]}\n${problems.join('\n')}\n`,
      );
      throw new Error(problems.join('\n'));
    }
  },
});

export { expect };
