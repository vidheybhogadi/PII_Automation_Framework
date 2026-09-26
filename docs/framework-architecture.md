# Framework Architecture

## 1. Layers

```
tests/*.spec.ts                      ← WHAT to verify (scenarios, IDs, tags). No signing, SQL or HTTP code.
   │ uses fixtures
src/fixtures/test-fixtures.ts        ← config · preflight · pii / piiAs(role) · data · db · log · cleanup
src/fixtures/steps.ts                ← reusable, self-asserting setup steps (seedField, createKey, …)
   │
src/clients/pii-client.ts            ← one typed method per documented endpoint
src/clients/base-api-client.ts       ← serialize ONCE → sign → send SAME bytes · headers · request ID ·
   │                                   timeout · bounded 503 retry · safe logging · timing
src/auth/ed25519-signer.ts           ← Base64(Ed25519.sign(key, SHA256(bytes)))
src/assertions/*.ts                  ← envelope/contract/error/security assertions with value-free messages
src/models/*.ts                      ← Zod schemas = runtime validators + TypeScript types
src/db/                              ← DbAdapter (pg | mysql2, read-only) · PiiRepository (SQL catalog)
src/data/                            ← run IDs, unique synthetic identities, normalization oracles
src/config/                          ← env schema (format) + require* (presence, actionable errors)
src/utils/                           ← logger + redaction, Secret, retry, cleanup, request IDs
```

## 2. Request lifecycle

```
payload ──JSON.stringify (once)──▶ bodyBytes (Buffer, UTF-8)
                                     │
                                     ├─▶ SHA-256 ─▶ Ed25519.sign(privateKey) ─▶ Base64 ─▶ X-PII-Signature
                                     │
                                     └─▶ axios({ data: bodyBytes, transformRequest: identity }) ─▶ wire
```

Guarantees, each proven by a unit test that actually ran:

| Guarantee                                                    | Proof                                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Signature algorithm matches the guide's Python byte-for-byte | UT-SIG-003 (known answer produced by `scripts/cross-verify-signature.py`)          |
| Bytes on the socket are exactly the signed bytes             | UT-CLI-001 (local capture server verifies the signature over received bytes)       |
| Axios does not inject headers or re-serialize                | UT-CLI-006 (caught and fixed a real `application/x-www-form-urlencoded` injection) |
| Fresh `X-Request-Id` per call and per retry                  | UT-CLI-003, UT-CLI-009                                                             |
| Only read-only endpoints retry, only on 503, bounded         | UT-CLI-009/010                                                                     |

## 3. Why Axios instead of Playwright `APIRequestContext`

Playwright traces record full request/response bodies and headers. For this service, that would put
decrypted PII, signatures and raw AES keys into `trace.zip` report attachments. Axios traffic is invisible to
tracing, and Axios can send a pre-built `Buffer` unchanged. Playwright is still the runner, reporter and fixture system.

## 4. Sensitive-data controls

| Risk                        | Control                                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PII/keys in assertion diffs | `ApiResponse` keeps bodies in private `#fields`; `toJSON`/`inspect` show only a safe summary. Value comparisons use `expectSecretEquals` (length + SHA-256 fingerprint). Zod errors report paths/codes, never values. |
| PII in logs                 | Single `Logger`; key-based redaction (value, phone, key, signature, body, data…) + pattern scrubbing (email, phone, PEM, Base64) — UT-RED-*. ESLint `no-console` everywhere else.                                     |
| Secrets in config dumps     | `Secret` wrapper (private field) for private keys and DB password — UT-CFG-007.                                                                                                                                       |
| Traces                      | `trace: 'off'`; per-test redacted `api-calls.log` attachment instead.                                                                                                                                                 |
| DB writes                   | Read-only session (`default_transaction_read_only` / `SET SESSION TRANSACTION READ ONLY`) + SELECT/WITH-only SQL guard + read-only DB user.                                                                           |
| Error messages              | Config/signer/DB errors name variables and paths, never values (UT-CFG-004, UT-SIG-012, UT-DB-003).                                                                                                                   |

## 5. Failure philosophy

- **Missing environment configuration** (URL, keys, tenants, phones, DB) → the test **fails** with a message
  naming the variable and where to obtain it. Never silently skipped.
- **Missing backend contract information** → `blockedBy('Q-xx', reason)` marks the test `fixme` and adds a `blocked`
  annotation. It shows as not-run with the reason, **never as passed**.
- **Ambiguous documented behaviour** → `expectRejected(res, [closed set], 'Q-xx')` plus an `assumption` annotation.
- **Service not ready** → the per-worker `preflight` fixture fails fast, so there is no cascade of misleading failures.

## 6. Test data

Run ID `qa-auto-<utc stamp>-<rand>` is created once in `playwright.config.ts` and shared with all workers.
User IDs: `<runId>-w<worker>-<seq>-<label>`, so they are unique across parallel workers and repeated runs, and
traceable. Emails: `<runId>.w<worker>.<seq>.<label>@<approved domain>`. Phones: only from `PII_TEST_PHONES`.
Cleanup: free-text keys are revoked (the only approved cleanup API). PII rows cannot be deleted (no API), so they are
listed in `cleanup-summary.json` per test (Q-15).

## 7. Extending for Milestone 2 (Aisle API flows)

Nothing for Milestone 2 is implemented, because no Aisle integration APIs are documented. When contracts arrive:

1. Add `src/clients/<aisle-service>-client.ts` extending `BaseApiClient` (or a sibling base with that service's auth).
2. Add models under `src/models/`, fixtures in `test-fixtures.ts` (e.g. `aisleUsers`).
3. Write flow tests that act through the Aisle API, then verify through **`PiiClient`** (read/search) and
   **`PiiRepository`** (ciphertext at rest) that interception encrypted/decrypted as specified.
4. Add a Playwright project `integration-m2` with its own tag.
