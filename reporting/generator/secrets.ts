/**
 * Known secret VALUES (the Aisle test token, DB/SMTP passwords) and their placeholders. Read from the process
 * environment AND from the project's .env file (report generation may run without .env loaded), so the report
 * pipeline can mask them and refuse to write a report that contains one. Node-only; never sent to the browser.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SECRET_ENV: [name: string, placeholder: string][] = [
  ['AISLE_TEST_TOKEN', '$AISLE_TEST_TOKEN'],
  ['AISLE_EXPIRED_TEST_TOKEN', '$AISLE_EXPIRED_TEST_TOKEN'],
  ['DB_PASSWORD', '[REDACTED_SECRET]'],
  ['SMTP_PASSWORD', '[REDACTED_SECRET]'],
];

function dotEnvValues(): Record<string, string> {
  const file = path.resolve(__dirname, '../../.env');
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m)
      out[m[1] as string] = (m[2] as string)
        .replace(/\s+#.*$/, '')
        .trim()
        .replace(/^['"]|['"]$/g, '');
  }
  return out;
}

/** [value, placeholder, variable name] for every configured secret of 8+ characters. */
export function knownSecrets(): [string, string, string][] {
  const fromFile = dotEnvValues();
  const out: [string, string, string][] = [];
  for (const [name, placeholder] of SECRET_ENV) {
    for (const v of new Set([process.env[name]?.trim(), fromFile[name]])) {
      if (v && v.length >= 8 && !v.startsWith('PENDING_')) out.push([v, placeholder, name]);
    }
  }
  return out;
}

/** Replace exact secret values with their placeholders; everything else is left as is. */
export function maskKnownSecrets(text: string, secrets = knownSecrets()): string {
  let out = text;
  for (const [value, placeholder] of secrets) out = out.split(value).join(placeholder);
  return out;
}
