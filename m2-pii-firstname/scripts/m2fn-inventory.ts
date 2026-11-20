/**
 * The APIs of the M2 PII First Name suite, parsed from the source document m2-pii-firstname/docs/redis-key-apis.md
 * (Aisle Engineering tester quick reference, 2026-11-09). Only the Aisle backend rows (aisle_new) are suite APIs; the
 * vernacular rows (desiapp) are documented in the API guide only. Nothing here is invented: method, path and purpose
 * come from the table, behaviour notes from the quick reference text.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const SOURCE_DOC = 'm2-pii-firstname/docs/redis-key-apis.md';
export const SOURCE_REF = 'app/controllers/admin/redis_keys_controller.rb (develop_new @ bd85044)';

export interface M2fnApi {
  id: string;
  method: 'GET' | 'DELETE';
  path: string;
  purpose: string;
  auth: string;
  notes: string;
  source: string;
}

const NOTES: Record<string, string> = {
  GET: 'Key in the query string, no body. Returns the stored string unchanged (also JSON and empty strings); 404 when the key does not exist; 422 when the key holds a non-string value; 400 missing / blank / invalid key; 401 admin token, permission, device or OTP check failed; 503 Redis unavailable.',
  DELETE:
    'Key in the query string, no body. Deletes one exact key of any Redis type; an absent key returns 200 with deleted: false; wildcards are literal (no pattern expansion); 400 missing / blank / invalid key; 401 admin token, permission, device or OTP check failed; 503 Redis unavailable.',
};

export function parseM2fnInventory(root: string): M2fnApi[] {
  const text = readFileSync(path.join(root, SOURCE_DOC), 'utf8');
  const out: M2fnApi[] = [];
  for (const line of text.split('\n')) {
    const [, id, backend, method, url, purpose] = line.split('|').map((c) => c.trim());
    if (!id || !/^API-\d+$/.test(id) || backend !== 'aisle_new' || !url || !purpose) continue;
    if (method !== 'GET' && method !== 'DELETE') continue;
    const apiPath = new URL(url.replace(/`/g, '').replace('<key>', 'KEY')).pathname;
    out.push({
      id,
      method,
      path: apiPath,
      purpose,
      auth: 'CMS admin JWT (Redis permission, CMS OTP verified) + webcms: true',
      notes: NOTES[method]!,
      source: SOURCE_REF,
    });
  }
  return out;
}
