/**
 * Validates configuration WITHOUT printing any secret, then checks that the Aisle PII facade is reachable
 * and accepts the test token.
 *   npm run check-env              # config + readiness + token probe
 *   npm run check-env -- --offline # config only
 *
 * The probe is a read of a random, never-written user ID — it creates no data. It also shows which fields
 * the Aisle caller can use today (NAME vs EMAIL), so blocked access is visible before a run.
 * Exit code 0 = ready to run the Aisle API tests.
 */
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createAisleClient } from '../src/clients/client-factory';
import { assertIntegrationConfig, isDbConfigured, loadConfig } from '../src/config/config';
import { pendingSettings } from '../src/config/placeholders';
import { Logger } from '../src/utils/logger';

dotenv.config({ path: path.resolve(process.cwd(), process.env.ENV_FILE ?? '.env'), quiet: true });

async function main(): Promise<void> {
  const offline = process.argv.includes('--offline');
  const config = loadConfig();
  const ok = (m: string) => console.log(`  ✔ ${m}`);
  const warn = (m: string) => console.log(`  ⚠ ${m}`);

  console.log(`Environment: ${config.environment}`);
  const pending = pendingSettings(process.env);
  if (pending.length)
    warn(
      `${pending.length} setting(s) still hold a PENDING_ placeholder (see PENDING-PLACEHOLDERS.md): ` +
        pending.join(', '),
    );
  assertIntegrationConfig(config);
  ok(`AISLE_BASE_URL ${config.baseUrl}`);
  ok('AISLE_TEST_TOKEN set (value never printed)');
  ok(`Test email domain: ${config.testData.emailDomain}`);
  if (config.testData.phones.length === 0)
    warn('AISLE_TEST_PHONES empty — phone / temporary-phone tests will be BLOCKED (BQ-03)');
  else ok(`${config.testData.phones.length} approved test phone(s) configured`);
  if (isDbConfigured(config)) ok(`DB validation configured (${config.db.engine}, read-only)`);
  else warn('DB validation not configured — @db tests will be BLOCKED (BQ-04)');

  if (offline) return;
  const client = createAisleClient(config, new Logger());
  const health = await client.healthReady();
  if (health.status === 401) throw new Error(`Aisle rejected the test token: ${health.summary()}`);
  if (health.status !== 200) throw new Error(`Aisle PII facade not ready: ${health.summary()}`);
  ok(`Facade ready and token accepted: ${health.summary()}`);

  // Token + field-access probe: read a user that cannot exist. 404 = access OK; 403 = field not granted.
  const userId = `${config.testData.runPrefix}-probe-${randomUUID().slice(0, 8)}`;
  for (const field of ['NAME', 'EMAIL', 'PHONE']) {
    const probe = await client.readPii({ user_id: userId, field_names: [field] }, { retry: false });
    const meaning: Record<number, string> = {
      404: 'access OK (PII_NOT_FOUND for the random probe user, as expected)',
      403: 'NOT granted to the Aisle caller — tests needing it will be BLOCKED',
      401: 'token rejected',
    };
    const text = `${field}: ${probe.summary()} — ${meaning[probe.status] ?? 'unexpected response'}`;
    if (probe.status === 404) ok(text);
    else warn(text);
  }
}

main().catch((error: Error) => {
  console.error(`\n✘ ${error.name}: ${error.message}`);
  process.exit(1);
});
