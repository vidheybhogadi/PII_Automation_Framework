/**
 * ⚠️ NON-PRODUCTION TEST KEY — FOR UNIT TESTS ONLY. NEVER REGISTER OR USE AGAINST ANY ENVIRONMENT. ⚠️
 *
 * This is the PUBLISHED RFC 8032 §7.1 "TEST 1" Ed25519 key (seed 9d61b19d…7f60). It is public knowledge,
 * which is exactly why it is safe to commit and useful: signatures are deterministic, so we can compare
 * against known answers.
 */
export const RFC8032_TEST1_PRIVATE_KEY_PEM = [
  '-----BEGIN PRIVATE KEY-----',
  'MC4CAQAwBQYDK2VwBCIEIJ1hsZ3v/VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g',
  '-----END PRIVATE KEY-----',
  '',
].join('\n');

/** RFC 8032 TEST 1 public key (hex) and signature of the EMPTY message (hex) — from the RFC itself. */
export const RFC8032_TEST1_PUBLIC_KEY_HEX =
  'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
export const RFC8032_TEST1_EMPTY_MESSAGE_SIGNATURE_HEX =
  'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';

/**
 * Known answer produced by the integration guide's OWN Python example (scripts/cross-verify-signature.py)
 * with the key above: json.dumps(payload, separators=(",", ":")) -> sha256 -> Ed25519 -> base64.
 */
export const GUIDE_SAMPLE_BODY =
  '{"tenant_id":"tenant-alpha","user_id":"user-123","field":"EMAIL","value":"person@example.com"}';
export const GUIDE_SAMPLE_SIGNATURE_B64 =
  '+rZLc7z0jsU4e8XGyfMIvvrUvf0CeAxzPBLsmzPtyuZsNv1mIYRh2IulgW6Y2m3FO9xawMBm1j1FGPlXGm35AQ==';
