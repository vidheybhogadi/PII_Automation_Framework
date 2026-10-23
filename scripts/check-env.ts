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
import { connect } from 'node:net';
import path from 'node:path';
import type { AislePiiClient } from '../m1/src/clients/aisle-pii-client';
import { createAisleClient } from '../m1/src/clients/client-factory';
import { assertIntegrationConfig, isDbConfigured, loadConfig } from '../m1/src/config/config';
import { pendingSettings } from '../core/config/placeholders';
import { Logger } from '../core/utils/logger';
import { loadM2Config } from '../m2/src/config/m2-config';

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
      `${pending.length} setting(s) still hold a PENDING_ placeholder (see m1/docs/PENDING-PLACEHOLDERS.md): ` +
        pending.join(', '),
    );
  assertIntegrationConfig(config);
  ok(`AISLE_BASE_URL ${config.baseUrl}`);
  ok('AISLE_TEST_TOKEN set (value never printed)');
  ok(`Test email domain: ${config.testData.emailDomain}`);
  if (config.testData.phones.length === 0)
    warn('AISLE_TEST_PHONES empty — phone / temporary-phone tests will be BLOCKED (CONFIG)');
  else ok(`${config.testData.phones.length} approved test phone(s) configured`);
  const m2 = loadM2Config();
  ok(`M2: base URL ${m2.baseUrl}, app_version ${m2.appVersion}, device_type ${m2.deviceType}`);
  ok(`M2 login: phone_code_id ${m2.login.phoneCodeId}`);
  if (m2.login.signature) ok('M2_LOGIN_SIGNATURE_V1 set (value never printed)');
  else warn('M2_LOGIN_SIGNATURE_V1 empty — the OTP request is sent without signature_v1 (optional)');
  if (isDbConfigured(config)) ok(`DB validation configured (${config.db.engine}, read-only)`);
  else warn('DB validation not configured — @db tests will be BLOCKED (BQ-04)');

  if (offline) return;
  if (isDbConfigured(config) && config.db.host) {
    config.db.port ??= 5432;
    const reach = await tcpReachable(config.db.host, config.db.port, 5000);
    if (reach === true) ok(`DB host reachable from this machine (TCP ${config.db.host}:${config.db.port})`);
    else
      warn(
        `DB host NOT reachable from this machine (TCP ${config.db.host}:${config.db.port}: ${reach}) — @db tests will fail. ` +
          'A private 10.x / 172.16-31.x / 192.168.x address is not reachable from GitHub-hosted runners.',
      );
  }
  const client = createAisleClient(config, new Logger());
  const health = await client.healthReady();
  if (health.status === 401) throw new Error(`Aisle rejected the test token: ${health.summary()}`);
  if (health.status !== 200)
    throw new Error(`Aisle PII facade not ready: ${health.summary()}\n${describeEdge(health)}`);
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

/** true when a TCP connection opens within `timeoutMs`, else the reason (no query is sent, no credentials used). */
function tcpReachable(host: string, port: number, timeoutMs: number): Promise<true | string> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (result: true | string) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => done(`timed out after ${timeoutMs} ms`));
    socket.once('connect', () => done(true));
    socket.once('error', (e: NodeJS.ErrnoException) => done(e.code ?? e.message));
  });
}

/**
 * Says who answered a failed readiness call — the Aisle app or the edge (Cloudflare) in front of it — so a
 * CI-only 403 can be told apart from a token or service problem. Only headers and a classification are printed,
 * never the body text or the request headers (the health endpoint carries no personal data).
 */
function describeEdge(res: Awaited<ReturnType<AislePiiClient['healthReady']>>): string {
  const h = (name: string) => res.header(name) ?? '(absent)';
  const body = res.rawText();
  const cloudflarePage = /cloudflare|cf-error|attention required|just a moment|cf-chl/i.test(body);
  const answeredBy =
    res.header('cf-mitigated') || cloudflarePage
      ? 'Cloudflare (WAF / bot protection blocked the call before it reached Aisle)'
      : res.isJson
        ? 'the Aisle application (JSON error envelope)'
        : 'unknown (non-JSON body, no Cloudflare markers)';
  return [
    `  Answered by:   ${answeredBy}`,
    `  server:        ${h('server')}`,
    `  cf-ray:        ${h('cf-ray')}`,
    `  cf-mitigated:  ${h('cf-mitigated')}`,
    `  content-type:  ${h('content-type')}`,
    `  body:          ${res.isJson ? 'JSON' : 'non-JSON'}, ${body.length} bytes`,
  ].join('\n');
}

main().catch((error: Error) => {
  console.error(`\n✘ ${error.name}: ${error.message}`);
  process.exit(1);
});
