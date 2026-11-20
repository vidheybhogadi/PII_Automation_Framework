/**
 * Finish an interrupted vernac run: restore every team account still listed in the local restore journal
 * (reports/m2fn-vn/restore-journal.json) — name through the CMS (POST /admin/update_profile with the saved originals)
 * and the hide setting through the user’s own toggle — then verify and drop the entry.
 *
 *   npm run m2fn:vn:restore
 *
 * Same guards as the tests: team numbers only, testapp.koode.co only, read-only DB. Prints only labels (…<digit>),
 * apps and outcomes — never names or tokens.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { Logger } from '../../core/utils/logger';
import { loadM2Config } from '../../m2/src/config/m2-config';
import { CmsAdmins } from '../src/cms-admin';
import { VN, VnClient } from '../src/vn/client';
import { loadVnConfig } from '../src/vn/config';
import { VnDb } from '../src/vn/db';
import { editBody, journalDone, readJournal } from '../src/vn/restore';
import { discoverTeam, TeamSessions } from '../src/vn/team';

dotenv.config({ path: path.resolve(__dirname, '../..', process.env.ENV_FILE ?? '.env'), quiet: true });

async function main() {
  const entries = readJournal();
  if (!entries.length) {
    console.log('Restore journal is empty — nothing to restore.');
    return;
  }
  const cfg = loadVnConfig();
  const m2 = loadM2Config();
  const log = new Logger({ level: 'error', toConsole: false });
  const db = VnDb.open(m2, cfg.dbName, cfg.piiDbName);
  if (!db) throw new Error('The read-only vernac DB is not configured');
  const team = await discoverTeam(db, cfg.apps);
  const sessions = new TeamSessions(cfg, log, () => team);
  const cms = new CmsAdmins(
    {
      admin: cfg.admin,
      associate: cfg.associate,
      nonStringKey: undefined,
      redisOutageWindow: false,
      flagWindow: undefined,
      piiOutageWindow: false,
      batchAccounts: false,
    },
    { ...m2, baseUrl: cfg.baseUrl },
    log,
  );
  const auth = await cms.admin();
  if (auth.kind !== 'secret') throw new Error('no CMS admin token');
  const client = new VnClient(cfg.baseUrl, log);
  let failed = 0;
  for (const o of entries) {
    const u = team.users.find((x) => x.app === o.app && x.userId === o.userId);
    if (!u) {
      console.log(`${o.app} ${o.label}: user not found in the team lookup — left in the journal`);
      failed++;
      continue;
    }
    const st = (await db.appQuery<Record<string, unknown>>('profileState', [[...db.suite], u.userId]))[0];
    if ((st?.hide_first_name === true) !== o.hide)
      await client.call(VN.toggleHide, { app: u.app, auth: await sessions.token(u), body: {} });
    await client.call(VN.cmsUpdateProfile, { app: u.app, auth: auth.secret, body: editBody(o, o.firstName) });
    const view = await client.call(VN.cmsUser, { app: u.app, auth: auth.secret, pathParams: { ref: o.ref } });
    const okName =
      (view.json() as { user?: { first_name?: unknown } } | undefined)?.user?.first_name === o.firstName;
    const okDb =
      (await db.appQuery<Record<string, unknown>>('profileNameIs', [[...db.suite], u.userId, o.firstName]))[0]
        ?.is_value === true;
    const okHide =
      ((await db.appQuery<Record<string, unknown>>('profileState', [[...db.suite], u.userId]))[0]
        ?.hide_first_name ===
        true) ===
      o.hide;
    if (okName && okDb && okHide) {
      journalDone(o.key);
      console.log(`${o.app} ${o.label}: restored and verified`);
    } else {
      failed++;
      console.log(
        `${o.app} ${o.label}: NOT restored (name ${okName}, Postgres ${okDb}, hide ${okHide}) — left in the journal`,
      );
    }
  }
  await db.close();
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
