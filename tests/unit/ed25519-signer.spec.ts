/**
 * UNIT — Ed25519 signer. No network. Proves the signer implements exactly:
 *   X-PII-Signature = Base64(Ed25519.sign(privateKey, SHA256(exact body bytes)))
 */
import { expect, test } from '@playwright/test';
import { generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { inspect } from 'node:util';
import {
  ED25519_SIGNATURE_BYTES,
  Ed25519Signer,
  SignerError,
  sha256,
  verifyBodySignature,
} from '../../src/auth/ed25519-signer';
import { serializeBody } from '../../src/clients/base-api-client';
import { Secret } from '../../src/utils/secret';
import {
  GUIDE_SAMPLE_BODY,
  GUIDE_SAMPLE_SIGNATURE_B64,
  RFC8032_TEST1_EMPTY_MESSAGE_SIGNATURE_HEX,
  RFC8032_TEST1_PRIVATE_KEY_PEM,
  RFC8032_TEST1_PUBLIC_KEY_HEX,
} from './helpers/test-keys';

const signer = Ed25519Signer.fromPem(RFC8032_TEST1_PRIVATE_KEY_PEM, 'unit-test');
const body = Buffer.from(GUIDE_SAMPLE_BODY, 'utf8');

test.describe('UNIT Ed25519 signer', () => {
  test('UT-SIG-001 The standard test key (RFC 8032) loads, and its public key matches the standard', () => {
    const spkiDer = signer.publicKey.export({ format: 'der', type: 'spki' });
    // Last 32 bytes of an Ed25519 SPKI structure are the raw public key.
    expect(spkiDer.subarray(-32).toString('hex')).toBe(RFC8032_TEST1_PUBLIC_KEY_HEX);
  });

  test('UT-SIG-002 Signing reproduces the standard’s published example signature', () => {
    // Sanity check of the primitive itself: pure Ed25519 over the empty message.
    expect(nodeSign(null, Buffer.alloc(0), RFC8032_TEST1_PRIVATE_KEY_PEM).toString('hex')).toBe(
      RFC8032_TEST1_EMPTY_MESSAGE_SIGNATURE_HEX,
    );
  });

  test('UT-SIG-003 Our signature matches the integration guide’s Python example exactly', () => {
    expect(serializeBody(JSON.parse(GUIDE_SAMPLE_BODY)).equals(body)).toBe(true);
    expect(signer.signBody(body)).toBe(GUIDE_SAMPLE_SIGNATURE_B64);
  });

  test('UT-SIG-004 The SHA-256 hash of the body is signed, not the body itself', () => {
    expect(signer.signBody(body)).not.toBe(signer.signRawBodyWithoutDigest(body));
    const digestSig = nodeSign(null, sha256(body), RFC8032_TEST1_PRIVATE_KEY_PEM).toString('base64');
    expect(signer.signBody(body)).toBe(digestSig);
  });

  test('UT-SIG-005 A signature is valid for the exact bytes it was made from', () => {
    expect(verifyBodySignature(signer.publicKey, body, signer.signBody(body))).toBe(true);
  });

  test('UT-SIG-006 A signature is invalid for different bytes', () => {
    const other = Buffer.from(GUIDE_SAMPLE_BODY.replace('user-123', 'user-124'), 'utf8');
    expect(verifyBodySignature(signer.publicKey, other, signer.signBody(body))).toBe(false);
  });

  test('UT-SIG-007 Changing spaces, field order or line endings makes the signature invalid', () => {
    const signature = signer.signBody(body);
    const payload = JSON.parse(GUIDE_SAMPLE_BODY) as Record<string, string>;
    const mutations = {
      prettyPrinted: JSON.stringify(payload, null, 2),
      spaceAfterColon: GUIDE_SAMPLE_BODY.replace(/":"/g, '": "'),
      reorderedFields: JSON.stringify({ user_id: payload.user_id, ...payload }),
      trailingNewline: `${GUIDE_SAMPLE_BODY}\n`,
      crlf: `${GUIDE_SAMPLE_BODY}\r\n`,
      leadingSpace: ` ${GUIDE_SAMPLE_BODY}`,
    };
    for (const [name, mutated] of Object.entries(mutations)) {
      expect(mutated, `${name} must differ from original`).not.toBe(GUIDE_SAMPLE_BODY);
      expect(verifyBodySignature(signer.publicKey, Buffer.from(mutated), signature), name).toBe(false);
    }
  });

  test('UT-SIG-008 A signature made with a different key is invalid', () => {
    const other = Ed25519Signer.fromKeyObject(generateKeyPairSync('ed25519').privateKey, 'other');
    expect(verifyBodySignature(signer.publicKey, body, other.signBody(body))).toBe(false);
  });

  test('UT-SIG-009 A signature is 64 bytes in standard Base64 (88 characters)', () => {
    const signature = signer.signBody(body);
    expect(signature).toMatch(/^[A-Za-z0-9+/]{86}==$/);
    expect(Buffer.from(signature, 'base64')).toHaveLength(ED25519_SIGNATURE_BYTES);
  });

  test('UT-SIG-010 The same key and bytes always give the same signature', () => {
    expect(signer.signBody(body)).toBe(signer.signBody(Buffer.from(GUIDE_SAMPLE_BODY)));
  });

  test('UT-SIG-011 An empty body can be signed and verified', () => {
    const empty = Buffer.alloc(0);
    expect(verifyBodySignature(signer.publicKey, empty, signer.signBody(empty))).toBe(true);
  });

  test('UT-SIG-012 A missing or invalid private key fails clearly without printing key text', () => {
    const garbage =
      '-----BEGIN PRIVATE KEY-----\nTk9UQUtFWV9TRUNSRVRfTUFURVJJQUw=\n-----END PRIVATE KEY-----';
    const rsaPem = generateKeyPairSync('rsa', { modulusLength: 1024 })
      .privateKey.export({ format: 'pem', type: 'pkcs8' })
      .toString();
    const ecPem = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      .privateKey.export({ format: 'pem', type: 'pkcs8' })
      .toString();
    const cases: Record<string, string> = { empty: '', notPem: 'abc123', garbage, rsa: rsaPem, ecdsa: ecPem };
    for (const [name, pem] of Object.entries(cases)) {
      let error: unknown;
      try {
        Ed25519Signer.fromPem(pem, name);
      } catch (e) {
        error = e;
      }
      expect(error, name).toBeInstanceOf(SignerError);
      const message = (error as Error).message;
      expect(message, name).not.toContain('Tk9UQUtFWV9');
      expect(message, name).not.toContain('MIIC');
      expect(message, name).not.toMatch(/[A-Za-z0-9+/]{40,}/);
    }
  });

  test('UT-SIG-013 A protected private key is never exposed when printed or converted to JSON', () => {
    const wrapped = Ed25519Signer.fromPem(new Secret(RFC8032_TEST1_PRIVATE_KEY_PEM), 'wrapped');
    expect(wrapped.signBody(body)).toBe(GUIDE_SAMPLE_SIGNATURE_B64);
    const rendered = `${inspect(wrapped)} ${JSON.stringify({ wrapped })} ${String(wrapped)}`;
    expect(rendered).not.toContain('MC4CAQAw');
    expect(rendered).toContain('Ed25519Signer(wrapped)');
  });

  test('UT-SIG-014 The public key is exported in the format the PII service registers', () => {
    expect(signer.publicKeyPem()).toContain('-----BEGIN PUBLIC KEY-----');
  });
});
