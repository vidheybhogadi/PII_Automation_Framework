/**
 * Generates an Ed25519 key pair for registering a calling service with the PII service.
 *   npm run keys:generate -- secrets/primary-caller
 * Writes <prefix>.pem (PRIVATE, mode 600, never share/commit) and <prefix>.pub.pem (give to the PII team).
 * The private key is never printed.
 */
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const prefix = process.argv[2];
if (!prefix) {
  console.error('Usage: npm run keys:generate -- <output-prefix>   e.g. secrets/primary-caller');
  process.exit(1);
}
const privatePath = path.resolve(`${prefix}.pem`);
const publicPath = path.resolve(`${prefix}.pub.pem`);
if (existsSync(privatePath)) {
  console.error(`Refusing to overwrite existing ${privatePath}`);
  process.exit(1);
}
mkdirSync(path.dirname(privatePath), { recursive: true });
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
writeFileSync(privatePath, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
writeFileSync(publicPath, publicKey.export({ format: 'pem', type: 'spki' }));
console.log(`Private key (keep secret, git-ignored): ${privatePath}`);
console.log(`Public key (send to PII backend team for registration): ${publicPath}`);
console.log(publicKey.export({ format: 'pem', type: 'spki' }).toString());
