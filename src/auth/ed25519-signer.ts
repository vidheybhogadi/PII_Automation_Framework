/**
 * Ed25519 request signing, exactly as specified in the PII Service API Integration Guide:
 *
 *     body_hash       = SHA256(exact_request_body_bytes)
 *     signature       = Ed25519.sign(caller_private_key, body_hash)
 *     X-PII-Signature = Base64(signature)
 *
 * Crypto concepts, briefly:
 *  - SHA-256 turns any number of bytes into a fixed 32-byte "digest". Changing even one byte of the
 *    body (a space, a newline, field order) produces a completely different digest.
 *  - Ed25519 is a public-key signature scheme. The caller signs with its PRIVATE key; the PII service
 *    verifies with the PUBLIC key registered for the caller ID. A valid signature proves the request came
 *    from the key holder and that the digest (and therefore the body) was not modified.
 *  - Ed25519 is deterministic: the same key + same message always yields the same 64-byte signature.
 *    That property lets unit tests compare against a known-answer value computed by the guide's Python code.
 *
 * Node detail: `crypto.sign(null, message, ed25519Key)` performs "pure" Ed25519 over `message`.
 * Here the message is the 32-byte SHA-256 digest — matching Python's `private_key.sign(sha256(body).digest())`.
 * (Passing an algorithm name such as 'sha256' is NOT valid for Ed25519 and would not match the service.)
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { inspect } from 'node:util';
import type { Secret } from '../utils/secret';

export class SignerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignerError';
  }
}

/** Ed25519 signatures are always 64 bytes -> 88 characters of standard Base64 (with "==" padding). */
export const ED25519_SIGNATURE_BYTES = 64;

/** SHA-256 digest of the exact bytes that will be transmitted. */
export function sha256(bytes: Buffer): Buffer {
  return createHash('sha256').update(bytes).digest();
}

export class Ed25519Signer {
  readonly #privateKey: KeyObject;
  readonly publicKey: KeyObject;
  /** Label used in error messages (e.g. caller role) — never key material. */
  readonly label: string;

  private constructor(privateKey: KeyObject, label: string) {
    this.#privateKey = privateKey;
    this.publicKey = createPublicKey(privateKey);
    this.label = label;
  }

  /**
   * Load an unencrypted PKCS#8 PEM Ed25519 private key ("-----BEGIN PRIVATE KEY-----").
   * Error messages intentionally never include any part of the key text.
   */
  static fromPem(pem: string | Secret, label = 'caller'): Ed25519Signer {
    const text = typeof pem === 'string' ? pem : pem.reveal();
    if (!text || !text.includes('-----BEGIN')) {
      throw new SignerError(
        `Private key for "${label}" is missing or is not PEM text. Expected an unencrypted PKCS#8 PEM ` +
          `Ed25519 key beginning with "-----BEGIN PRIVATE KEY-----".`,
      );
    }
    let key: KeyObject;
    try {
      key = createPrivateKey({ key: text, format: 'pem' });
    } catch {
      throw new SignerError(
        `Private key for "${label}" could not be parsed. Expected an unencrypted PKCS#8 PEM Ed25519 key ` +
          `(password-protected keys are not supported — the guide loads keys with password=None).`,
      );
    }
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new SignerError(
        `Private key for "${label}" is of type "${key.asymmetricKeyType ?? 'unknown'}", but the PII service ` +
          `requires Ed25519. Do not use RSA/ECDSA/HMAC keys.`,
      );
    }
    return new Ed25519Signer(key, label);
  }

  /** Wrap an existing KeyObject (used by unit tests and throw-away "unregistered" keys). */
  static fromKeyObject(privateKey: KeyObject, label = 'caller'): Ed25519Signer {
    if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519') {
      throw new SignerError(`Key for "${label}" must be an Ed25519 private key.`);
    }
    return new Ed25519Signer(privateKey, label);
  }

  /**
   * Returns Base64(Ed25519.sign(privateKey, SHA256(bodyBytes))).
   * `bodyBytes` MUST be the exact Buffer that is later written to the HTTP connection.
   */
  signBody(bodyBytes: Buffer): string {
    return sign(null, sha256(bodyBytes), this.#privateKey).toString('base64');
  }

  /**
   * NEGATIVE-TEST HELPER ONLY: signs the raw body instead of its SHA-256 digest.
   * The service must reject this — it proves the server really verifies the documented digest scheme.
   */
  signRawBodyWithoutDigest(bodyBytes: Buffer): string {
    return sign(null, bodyBytes, this.#privateKey).toString('base64');
  }

  /** Public key in SPKI PEM form — safe to share; this is what gets registered with the PII service. */
  publicKeyPem(): string {
    return this.publicKey.export({ format: 'pem', type: 'spki' }).toString();
  }

  toString(): string {
    return `Ed25519Signer(${this.label})`;
  }

  toJSON(): string {
    return this.toString();
  }

  [inspect.custom](): string {
    return this.toString();
  }
}

/** Verify a Base64 signature the same way the PII service is documented to (used in unit tests). */
export function verifyBodySignature(
  publicKey: KeyObject,
  bodyBytes: Buffer,
  signatureBase64: string,
): boolean {
  const signature = Buffer.from(signatureBase64, 'base64');
  if (signature.length !== ED25519_SIGNATURE_BYTES) return false;
  return verify(null, sha256(bodyBytes), publicKey, signature);
}
