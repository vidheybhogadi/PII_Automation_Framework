# Implementation Summary

## Complete (built and statically verified; unit-level behaviour executed)

- Typed configuration with actionable errors and secret wrapping (`src/config`)
- Ed25519 signer that matches the guide's Python reference byte-for-byte (`src/auth`)
- Centralized client: serialize-once/sign/send-same-bytes, headers, request IDs, timeouts, bounded 503 retry for read-only
  endpoints, safe logging, timing, and controlled tampering for negative tests (`src/clients`)
- Typed Zod models for all 11 endpoints (`src/models`)
- Value-free assertions for envelopes, contracts, errors, no-store, plaintext and leak detection (`src/assertions`)
- Read-only DB adapter (PostgreSQL/MySQL) and repository over a team-supplied SQL catalog (`src/db`)
- Test data factory, run IDs, cleanup registry, redacting logger (`src/data`, `src/utils`)
- Playwright fixtures, projects, tags, HTML/JUnit/JSON reporting, CI workflow
- **75 unit tests: executed, all passing**
- **133 integration tests**: implemented, type-checked and listed; **not executed** against a real service

- **PII Sentinel report** (`reporting/`): a simple single-page report generated after every run (summary, what needs
  attention, area cards, test list, run details) plus PDF/CSV/JSON exports and run history — see docs/reporting.md.

## Blocked by missing information

| What                               | Blocked by                                                                         | Tests               |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| Any live execution                 | Environment URL, registered callers + keys, tenants, email domain, approved phones | all integration     |
| DB validation (incl. POC step 4–6) | DB engine, schema, read-only credentials (Q-03, Q-16)                              | POC-001, DB-001…007 |
| Not-ready readiness                | Q-17                                                                               | HLT-002             |
| Expired transient                  | Q-12                                                                               | TR-012              |
| Non-searchable field               | Q-18                                                                               | SR-012              |
| Body size limit                    | Q-22                                                                               | SEC-002             |
| Signature helper exposure          | Q-23                                                                               | SEC-003             |
| Request-ID reuse / replay          | Q-14, Q-21                                                                         | AUTH-021, AUTH-022  |
| Audit event                        | Q-26                                                                               | DB-007              |
| Data deletion                      | Q-15                                                                               | (cleanup)           |

## Security findings to raise now (from document analysis)

1. **Signature does not bind method, path, caller ID, request ID or time (Q-21).** A captured signed request can be replayed,
   and a body valid for one endpoint (e.g. `{tenant_id,key_id}` for key _read_) is equally valid for another (key _revoke_).
2. **The guide's signature example (`MEQC…`) looks like ECDSA/DER (Q-02).** This could mislead integrators.
3. **Tenant scoping is not caller-scoped (Q-27):** any caller with field permission can read any tenant's PII.
   TI-006 documents this; confirm it is intended.
