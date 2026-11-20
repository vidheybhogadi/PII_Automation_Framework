/**
 * Time-based one-time password (RFC 6238; the Google-Authenticator kind ROTP::TOTP makes): HMAC-SHA1, 30-second
 * steps, 6 digits, base32 secret. Used for the CMS OTP of QA’s admin login. The code is never logged.
 */
import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error('TOTP secret is not base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The code for time `nowMs` (default: now). */
export function totp(secretBase32: string, nowMs: number = Date.now(), digits = 6, stepSeconds = 30): string {
  const counter = Math.floor(nowMs / 1000 / stepSeconds);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', base32Decode(secretBase32)).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** Milliseconds until the next 30-second step starts. */
export const msToNextStep = (nowMs: number = Date.now(), stepSeconds = 30) =>
  stepSeconds * 1000 - (nowMs % (stepSeconds * 1000));
