# Setup Guide

## 1. Prerequisites

- Node.js **20.19+** (LTS 22/24 recommended; verified locally with Node 26.8)
- npm 10+
- Network/VPN access to the target PII environment
- (DB tests) network access to the PII database + read-only credentials

## 2. Install

```bash
cd PII_Automation_Framework
npm ci                      # installs pinned versions from package-lock.json
cp .env.example .env        # .env is git-ignored
npm run verify              # typecheck + lint + format check + unit tests (no service needed)
```

`pg` and `mysql2` are optional dependencies. They are installed by default and loaded only when `DB_ENGINE` selects them.

## 3. Environment variables — what to set and who provides it

| Variable                                                                               | Required for                                              | Source                                                                                                          |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PII_ENVIRONMENT`                                                                      | reports                                                   | you (`local`/`dev`/`qa`/`staging`)                                                                              |
| `PII_BASE_URL`                                                                         | all integration tests                                     | Backend/DevOps (dev default `http://127.0.0.1:8001`)                                                            |
| `PII_CALLER_PRIMARY_ID` + `_PRIVATE_KEY_FILE`                                          | all integration tests                                     | PII backend team registers the caller; you generate the key (§5)                                                |
| `PII_CALLER_SECONDARY_ID` + key                                                        | caller-isolation tests (TR-003, FT-005, AUTH-017, TI-006) | PII backend team (§4)                                                                                           |
| `PII_CALLER_LIMITED_ID` + key                                                          | authorization tests (AZ-*, AUTH-019)                      | PII backend team (§4)                                                                                           |
| `PII_TEST_TENANT_ID`                                                                   | optional                                                  | leave empty: each run generates a made-up tenant (app) ID `<run id>-app-a`; set only if Dev gives fixed tenants |
| `PII_TEST_TENANT_ID_SECONDARY`                                                         | optional (tenant isolation)                               | leave empty: generated as `<run id>-app-b`                                                                      |
| `PII_TEST_EMAIL_DOMAIN`                                                                | email tests                                               | QA lead: approved non-deliverable domain (e.g. a reserved `.example` domain)                                    |
| `PII_TEST_PHONES`                                                                      | phone, transient, search-phone tests                      | QA lead / compliance: **approved test numbers only** (at least 2 approved 10-digit numbers)                     |
| `PII_TEST_PHONE_8_DIGITS`, `PII_TEST_PHONE_15_DIGITS`                                  | NRM-004                                                   | **Optional** — leave empty (only 10-digit test numbers are used; NRM-004 is then skipped)                       |
| `PII_BATCH_MAX_ITEMS`, `PII_SEARCH_DEFAULT_LIMIT`, `PII_TRANSIENT_TTL_MIN/MAX_SECONDS` | limit tests                                               | Backend: per-environment server config (defaults = documented dev values)                                       |
| `PII_MAX_BODY_BYTES`                                                                   | SEC-002                                                   | Backend (Q-22)                                                                                                  |
| `PII_NON_SEARCHABLE_FIELD`                                                             | SR-012                                                    | Backend (Q-18)                                                                                                  |
| `PII_ENABLE_TTL_EXPIRY_TEST`                                                           | TR-012                                                    | Backend: short-TTL environment (Q-12)                                                                           |
| `PII_SIGNATURE_HELPER_MUST_BE_DISABLED`                                                | SEC-003                                                   | `true` in every non-development env                                                                             |
| `PII_ENDPOINTS_IN_SCOPE`                                                               | scoping                                                   | QA lead (default `all`)                                                                                         |
| `DB_*`, `DB_QUERIES_FILE`                                                              | `@db`, POC                                                | DBA / PII backend team — see `database-setup.md`                                                                |
| `LOG_LEVEL`, `PII_LOG_TO_CONSOLE`                                                      | debugging                                                 | you                                                                                                             |

Validate at any time (prints no secrets):

```bash
npm run check-env               # config + service readiness
npm run check-env -- --offline  # config only
```

## 4. Caller registrations to request from the PII backend team

| Role          | Permissions (per field)                                                                        | Used by              |
| ------------- | ---------------------------------------------------------------------------------------------- | -------------------- |
| **primary**   | EMAIL, PHONE, NAME: READ, WRITE, SEARCH, BULK_READ · FREE_TEXT: READ, WRITE                    | all functional tests |
| **secondary** | identical to primary, **different caller ID and key**                                          | ownership isolation  |
| **limited**   | EMAIL: **SEARCH only** · NAME: **READ only** · PHONE: none · BULK_READ: none · FREE_TEXT: none | authorization tests  |

The limited set is exact: AZ-004 and AZ-005 are positive controls that fail if it is misconfigured.

## 5. Generate caller key pairs

```bash
npm run keys:generate -- secrets/primary-caller     # writes secrets/primary-caller.pem (600) + .pub.pem
npm run keys:generate -- secrets/secondary-caller
npm run keys:generate -- secrets/limited-caller
```

Send only the `.pub.pem` files to the PII backend team. `secrets/` and `*.pem` are git-ignored. In CI, store the private
PEM in the secret store (see `.github/workflows/pii-api-tests.yml`).

Key format: unencrypted PKCS#8 PEM Ed25519 (`-----BEGIN PRIVATE KEY-----`), matching the guide's
`load_pem_private_key(..., password=None)`. Inline alternatives: `PII_CALLER_<ROLE>_PRIVATE_KEY` containing the PEM with
literal `\n`, or Base64 of the PEM.

## 6. Optional: independent signature cross-check

```bash
python3 -m venv .venv && .venv/bin/pip install cryptography
.venv/bin/python scripts/cross-verify-signature.py   # prints the signature the guide's own code produces
```

UT-SIG-003 asserts the TypeScript signer produces the identical value.
