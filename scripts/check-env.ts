/**
 * Validates configuration WITHOUT printing any secret, then checks service readiness and sends ONE signed
 * probe per configured caller to prove signing, caller registration and permissions work end to end.
 *   npm run check-env              # config + readiness + signed probe
 *   npm run check-env -- --offline # config only
 *
 * The probe is a read of a random, never-written user ID — it creates no data.
 * Exit code 0 = ready to run integration tests.
 */
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Ed25519Signer } from '../src/auth/ed25519-signer';
import { createPiiClient } from '../src/clients/client-factory';
import { assertIntegrationConfig, loadConfig } from '../src/config/config';
import { CALLER_ROLES } from '../src/config/env-schema';
import { Logger } from '../src/utils/logger';

dotenv.config({ path: path.resolve(process.cwd(), process.env.ENV_FILE ?? '.env'), quiet: true });

async function main(): Promise<void> {
  const offline = process.argv.includes('--offline');
  const config = loadConfig();
  const ok = (m: string) => console.log(`  ✔ ${m}`);
  const warn = (m: string) => console.log(`  ⚠ ${m}`);

  console.log(`Environment: ${config.environment}`);
  assertIntegrationConfig(config);
  ok(`PII_BASE_URL set (${config.baseUrl})`);
  ok(
    `Tenants: primary set, secondary ${config.tenants.secondary ? 'set' : 'NOT set (tenant-isolation tests will fail)'}`,
  );

  for (const role of CALLER_ROLES) {
    const creds = config.callers[role];
    if (!creds) {
      warn(`caller "${role}" not configured — tests needing it fail with an actionable message`);
      continue;
    }
    Ed25519Signer.fromPem(creds.privateKeyPem, role); // throws a safe error if the key is invalid
    ok(`caller "${role}" configured (id=${creds.callerId}); Ed25519 private key parses`);
  }
  if (config.testData.phones.length === 0) warn('PII_TEST_PHONES empty — phone/transient tests will fail');
  else ok(`${config.testData.phones.length} approved test phone(s) configured`);
  if (config.db.engine === 'none')
    warn('DB_ENGINE=none — @db tests will fail until DB validation is configured');
  else ok(`DB_ENGINE=${config.db.engine}, queries file ${config.db.queriesFile ?? '(not set)'}`);

  if (offline) return;
  const res = await createPiiClient(config, new Logger(), null).healthReady();
  if (res.status !== 200) throw new Error(`Service not ready: ${res.summary()}`);
  ok(`Service ready: ${res.summary()}`);

  // Signed probe: POST /api/v1/pii/read for a user that cannot exist. Expected per role:
  //   primary/secondary → 404 PII_NOT_FOUND (auth OK + READ on EMAIL)   limited → 403 (auth OK, no READ on EMAIL)
  const tenant = config.tenants.primary as string;
  const userId = `${config.testData.runPrefix}-probe-${randomUUID().slice(0, 8)}`;
  let failures = 0;
  for (const role of CALLER_ROLES) {
    if (!config.callers[role]) continue;
    const probe = await createPiiClient(config, new Logger(), role).readPii(
      { tenant_id: tenant, user_id: userId, field_names: ['EMAIL'] },
      { retry: false },
    );
    const expected = role === 'limited' ? 403 : 404;
    const meaning: Record<number, string> = {
      401: 'AUTHENTICATION FAILED — caller ID not registered, wrong private key for this caller ID, or signature mismatch',
      403:
        role === 'limited'
          ? 'authenticated; READ on EMAIL correctly denied'
          : 'authenticated, but READ on EMAIL is NOT granted — check caller permissions',
      404: 'authenticated and authorized (PII_NOT_FOUND for the random probe user, as expected)',
    };
    const text = `signed probe as "${role}": ${probe.summary()} — ${meaning[probe.status] ?? 'unexpected response'}`;
    if (probe.status === expected) ok(text);
    else {
      failures += 1;
      console.log(`  ✘ ${text}`);
    }
  }
  if (failures)
    throw new Error(
      `${failures} caller probe(s) failed — fix caller registration/permissions before running tests (docs/setup-guide.md §4-5).`,
    );
}

main().catch((error: Error) => {
  console.error(`\n✘ ${error.name}: ${error.message}`);
  process.exit(1);
});
