<!-- GENERATED FILE — do not edit by hand. Source: PII_Automation_Framework scripts/api-docs/export.ts · `npm run docs:api` -->

# Aisle API Documentation

Every Aisle API: what it does, how to call it, the path a request takes through the code, and which data it reads and writes. 248 endpoints · staging `https://testa2.aisle.co` · generated 2026-10-29.

The same content is published as a website from the [API_Guide](https://github.com/vidheybhogadi/API_Guide) repository.

## Contents

- Guides: [How a request travels](#architecture) · [Authentication](#authentication) · [Personal data](#personal-data) · [Where the data lives](#data-stores) · [Glossary](#glossary)
- [First-name service routes](#area-g1) — 5 endpoints
- [Sign-up, login & account](#area-g2) — 13 endpoints
- [Profiles](#area-g3) — 13 endpoints
- [Lists & discovery](#area-g4) — 21 endpoints
- [Interactions, chat & live audio](#area-g5) — 30 endpoints
- [Profile updates](#area-g6) — 39 endpoints
- [Payments — checkout](#area-g7) — 38 endpoints
- [Payments — verification](#area-g8) — 11 endpoints
- [Provider callbacks](#area-g9) — 10 endpoints
- [CMS / admin](#area-g10) — 55 endpoints
- [PII service (direct)](#area-m1) — 13 endpoints

<a id="architecture"></a>

## How a request travels

Aisle is a Rails app with three front doors — the mobile app, the web app and the CMS — plus callbacks from outside providers. Personal data lives in a separate PII service that the app reaches through its PII integration.

### The pieces

1. **Callers** — Mobile app `/V1/…`; Web `/web/…`; CMS `/admin/…`; Providers (callbacks)
2. **Aisle Rails app** — Controllers → models → responses; Caches: profile, chat, rooms; Kafka sync, background jobs
3. **PII integration** — Read switch per field; `Pii::FieldStore`, `ProxyClient`; Signs every call
4. **PII service** — Encrypts and decrypts; PII database (PostgreSQL); Audit log (MongoDB)

### One request, end to end

1. A caller sends a request with its credential: user token, web token, CMS admin token, test token or a provider signature.
2. The Rails controller runs its normal logic. Its action is the first step of every flow on an endpoint page.
3. When the response or action needs a name, email or phone, the model asks the PII integration. With the field’s read switch on, the value comes from the PII service; with it off, from the local column.
4. Writes (sign-up, name edit, admin edit, a new user’s phone login) go to the PII service and to the local column. A failed PII write is logged and the request still succeeds.
5. Free text (chat messages, bio) works differently: Aisle gets a key from the PII service, encrypts the text itself and stores it with the key_id in the app database.
6. The PII service records an audit entry for every call.

### Two families of service routes

| Routes | Purpose | Good to know |
| --- | --- | --- |
| `/V1/api/v1/pii-test/*` | Save, read, search and bulk-read personal data directly in the PII service; temporary phones; free-text keys. | Skips the app’s caches. |
| `/V1/pii_integration/*` | First names through the app’s own logic: single, batch and by profile ref. | Uses the same test token. |

<a id="authentication"></a>

## Authentication

Every route needs a credential. All examples use staging (`https://testa2.aisle.co`) and placeholders such as `${USER_TOKEN}` — real tokens live in your local .env and are never pasted into documents, tickets or chats.

### Which credential a route needs

| Credential | Used by | How to get it |
| --- | --- | --- |
| User token (JWT) | 128 mobile-app endpoints | Log in with a phone number (below); the login response carries the token. |
| Web token (JWT) | Web endpoints that need it | Web login with the same account. |
| TEST_TOKEN | PII service routes (`/V1/api/v1/pii-test/*`, `/V1/pii_integration/*`) | Shared test token from the team’s secret store. |
| CMS admin token + `webcms: true` | 49 CMS endpoints | An OTP-verified admin with permission for the action. |
| Admin browser session | Legacy `/users/*` pages and the IRL admin page | Log in to the CMS in a browser. |
| Provider signature | Payment and Pusher callbacks | Genuine sandbox payloads from the provider. |

### Test phone numbers

> **Staging only.** Use a +91 number that starts with **10** (for example 1012345678); the OTP is **1234**. Do not use the **106** series (1060000000–1069999999) — it is reserved by the team. Numbers starting with 10 are not valid Indian mobile numbers, so they never belong to a real person.

1. Request an OTP: `POST /V1/sessions/login_with_phone_number` with the +91 phone code id and the number.
2. Verify: `POST /V1/sessions/verify_number_login_v1` with `"otp": "1234"`. A new number creates a new user.
3. Send the mobile headers on app calls: `device_type`, `app_version`, `unique_identifier`.

### Common headers

| Header | Purpose |
| --- | --- |
| `authorization` | The credential this route needs. |
| `accept` | Ask for JSON. |
| `content-type` | JSON body. |
| `device_type` | Mobile client details the app routes expect. |
| `app_version` | Mobile client details the app routes expect. |
| `unique_identifier` | Mobile client details the app routes expect. |
| `webcms` | Marks a CMS web request (admin token from an OTP-verified admin). |
| `cookie` | Admin browser session for legacy CMS pages. |
| `x-verify` | Provider signature — must be the genuine value. |
| `x-csrf-token` | Browser-session CSRF token, when required. |

<a id="personal-data"></a>

## Personal data

Four kinds of personal data pass through these endpoints. Each has its own read switch, write paths and fallbacks.

### Fields and read switches

| Field | Endpoints | Read switch | Behaviour |
| --- | --- | --- | --- |
| First name | 200 | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | 51 | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | 54 | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |
| Free text | 8 | `—` | Encrypted by Aisle with a key from the PII service; there is no read switch. |

### Good to know

- A read switch is on only when its value is `true` or the string `"true"`.
- With a switch on, the app does not fall back to the local value when the PII service has none — profiles that were never migrated show an empty field.
- Lists keep an already-cached first name when the PII service returns nothing, so a list and a profile page can differ.
- A failed PII write is logged and the request still succeeds, so a success response does not prove the PII write worked.
- Writes through the direct PII routes skip the app’s caches.
- Admin phone edits, returning logins and profile resets do not update the PII-service copy.

### Where personal data is written

| Endpoint | Writes |
| --- | --- |
| [`POST /V1/pii_integration/first_name`](#api-002) | First name |
| [`POST /V1/user/submit_profile`](#api-057) | First name, Email |
| [`POST /V1/sessions/submit_profile_web`](#api-061) | First name, Email |
| [`POST /web/user/update`](#api-129) | First name, Email |
| [`POST /V1/user/edit`](#api-058) | First name |
| [`POST /web/user/edit`](#api-130) | First name |
| [`POST /V1/sessions/verify_number_login_v1`](#api-060) | Phone |
| [`POST /admin/approve_and_edit`](#api-139) | First name, Phone |
| [`POST /admin/update_profile`](#api-140) | First name, Phone |
| [`POST /admin/images/images_updates_tab`](#api-149) | First name |
| [`POST /admin/images/auto_updates_images_update`](#api-151) | First name |
| [`POST /admin/images/approve_reject_multiple_photos_v1`](#api-153) | First name |
| [`POST /admin/images/approve_reject_multiple_photos_disapproved`](#api-154) | First name |
| [`POST /admin/members/approve_disapprove_banned_profiles`](#api-180) | First name |
| [`POST /admin/members/autofeed_update`](#api-209) | First name |
| [`POST /V1/messages/send`](#api-187) | Free text |
| [`POST /web/users/about`](#api-121) | Free text |

<a id="data-stores"></a>

## Where the data lives

Personal data sits in the PII service’s own database. The app database still keeps local copies until migration finishes, and free text is stored there encrypted.

### PostgreSQL “pii”

| Table | What it holds | Key columns |
| --- | --- | --- |
| `user_pii_field_value` | One encrypted value per user and field (NAME, EMAIL, PHONE). A new value replaces the old row. | `tenant_id, user_id, field_name, ciphertext, nonce, auth_tag, key_version, lookup_token, aad_version, created_at, updated_at` |
| `free_text_encryption_key` | Keys Aisle uses to encrypt free text. The text itself is not here. | `key_id, tenant_id, service_id, status, encrypted_key, created_at, revoked_at` |
| `pii_key_registry` | Master-key versions; one is active. | `key_version, status` |
| `transient_phone` | Temporary phone numbers before they are promoted. | — |
| `pii_field_catalog` · `pii_service_field_access` · `pii_calling_service` | Which fields exist and which callers may read, write, bulk-read or search them. | — |

Encrypted values use AES-256-GCM: a 12-byte nonce, a 16-byte tag and the key version needed to decrypt them. lookup_token is a fingerprint used by search (email and phone only).

### Local copies in aisleweb

| Field | Table.column | Linked from |
| --- | --- | --- |
| First name | `profiles.first_name` | — |
| Email | `account_emails.name` | `profiles.email_id` |
| Phone | `sms_notification_phone_numbers.number` | `users.phone_number_id` |
| Free text | Encrypted text + key_id | The message or profile it belongs to |

### Caches, events and logs

| Store | What |
| --- | --- |
| Audit log — MongoDB `audit_trails` | One entry per PII-service call, kept for 7 days. |
| Caches | Profile cards, chat conversations and live-audio rooms. |
| Kafka | Profile sync events sent by many profile updates. |
| Background jobs | Chat message saving, SMS and email sending. |

<a id="glossary"></a>

## Glossary

The step names you see in an endpoint’s “End-to-end flow”, in plain words.

### Code-path steps

| Step | What it does | Personal data |
| --- | --- | --- |
| `select_first_name` | Picks the first name to show to other people — respects the hide-name setting. | Yes |
| `get_first_name(_for_user)?` | Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field. | Yes |
| `(get_first_names_for_users\|hydrate_first_names!\|Pii::FieldStore.get_first_names)` | Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing. | Yes |
| `hydrate_first_name!` | Fills the first name into a cached profile response. | Yes |
| `get_multiple_cache_data` | Loads many cached profile cards for a list. | — |
| `assign_first_name` | Normalises the name, writes it to the PII service (best effort) and sets the local field. | Yes |
| `(write_first_name\|read_first_name)` | Writes / reads the first name directly in the PII service. | Yes |
| `(own_)?general_information` | Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone). | — |
| `fetch_email` | Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on. | Yes |
| `fetch_email_domain` | Reads the email domain for the scammer check during moderation. | Yes |
| `(fetch_only_number\|fetch_mobile_number\|fetch_phone_number_for_user\|fetch_full_phone_number_for_user\|fetch_only_number_with_phone_code_name)` | Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local. | Yes |
| `write_pii_phone_number_for_user` | Writes the national phone number to the PII service — only when a new user is created. | Yes |
| `Account::Email.add_email/search_user_ids` | Links the onboarding email to the user (only when the user has none yet). | Yes |
| `(own_detailed_v1\|own_detailed_web\|own_profile_web)` | The owner’s full profile response. | — |
| `(detailed_for_admin\|admin_complete_details\|profile_response_cms\|Profile.get_specific_user_for_admin)` | Admin (CMS) view of a profile. | — |
| `(fill_cache!\|create_profile_response\|create_cache_response\|profile_details)` | Rebuilds or reads the cached profile response. | — |
| `(fill_conversation_cache!\|create_cached_response\|fetch_cached_conversations)` | Rebuilds or reads the chat conversation cache. | — |
| `fill_room_cache!` | Rebuilds the live-audio room cache. | — |
| `sync_profile_to_kafka` | Publishes the updated profile to Kafka (only in some states). | — |
| `(send_for_aws_moderation\|check_for_scammer_before_moderation!)` | Content moderation and scammer check (only in some states). | — |
| `activate_any_subscription(_with_expiry)?` | Activates a subscription after a successful payment. | — |
| `Worker` | Background job: runs after the request has returned. | — |
| `PiiTestController` | PII test-route controller (TEST_TOKEN). | — |
| `ProxyClient` | Signs the request and forwards it to the PII service; skips the app’s caches. | Yes |

## Endpoints

<a id="area-g1"></a>

### First-name service routes

Read and write first names directly in the PII service (test token). 5 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| GET | [`/V1/pii_integration/first_name`](#api-001) | Read first name |
| POST | [`/V1/pii_integration/first_name`](#api-002) | Write first name |
| POST | [`/V1/pii_integration/profile_first_names`](#api-003) | Profile first names |
| POST | [`/V1/pii_integration/first_names/batch`](#api-190) | Batch |
| POST | [`/V1/pii_integration/profile_first_name_source`](#api-208) | Profile first name source |

<a id="api-001"></a>

#### `GET /V1/pii_integration/first_name` — Read first name

**Read first name.** Read and write first names directly in the PII service (test token).

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** Read · **Code** `app/controllers/v1/pii_integration_controller.rb; config/routes.rb#L18`

**Request**

Request fields: `user_id`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/pii_integration/first_name" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "user_id=$USER_ID"
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `user_id` (seen on staging 2026-10-25)
- `first_name` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `read_first_name` — Writes / reads the first name directly in the PII service.
2. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-19: unknown synthetic user_id → 200 {status, user_id, first_name:null}; no user_id → 400 "Missing required parameter: user_id"; no token → 401 (empty HTML body).

**What changed**

- 2026-10-25 — Response field added: `first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user_id` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-002"></a>

#### `POST /V1/pii_integration/first_name` — Write first name

**Write first name.** Read and write first names directly in the PII service (test token).

Personal data: First name (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** Write / update PII · **Code** `app/controllers/v1/pii_integration_controller.rb; config/routes.rb#L19`

**Request**

Request fields: `user_id`, `first_name`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/pii_integration/first_name" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "$USER_ID",
  "first_name": "Asha"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `user_id` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)
- `first_name` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `write_first_name` — Writes / reads the first name directly in the PII service.
2. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user_id` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-003"></a>

#### `POST /V1/pii_integration/profile_first_names` — Profile first names

**Profile first names.** Read and write first names directly in the PII service (test token).

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** Batch read · **Code** `app/controllers/v1/pii_integration_controller.rb; config/routes.rb#L21`

**Request**

Request fields: `refs`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/pii_integration/profile_first_names" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "refs": [
    "$REF",
    "$OTHER_REF"
  ]
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `requested_ref_count` (seen on staging 2026-10-25)
- `returned_ref_count` (seen on staging 2026-10-25)
- `profiles` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `profile_first_names`
2. `get_multiple_cache_data` — Loads many cached profile cards for a list.
3. `hydrate_first_names!` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.
4. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-19: unknown ref → 200 {status, requested_ref_count, returned_ref_count, profiles:{<ref>:null}}; empty refs → 400.

**What changed**

- 2026-10-25 — Response field added: `profiles` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `returned_ref_count` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `requested_ref_count` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-190"></a>

#### `POST /V1/pii_integration/first_names/batch` — Batch

**Batch.** Read and write first names directly in the PII service (test token).

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** Batch read · **Code** `app/controllers/v1/pii_integration_controller.rb; config/routes.rb#L20`

**Request**

Request fields: `user_ids`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/pii_integration/first_names/batch" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_ids": [
    "$USER_ID",
    "$OTHER_USER_ID"
  ]
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `requested_user_count` (seen on staging 2026-10-25)
- `returned_user_count` (seen on staging 2026-10-25)
- `first_names` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `Pii::FieldStore.get_first_names` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-19: unknown user_ids → 200 {status, requested_user_count, returned_user_count, first_names:{}}; empty user_ids → 400.

**What changed**

- 2026-10-25 — Response field added: `first_names` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `returned_user_count` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `requested_user_count` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-208"></a>

#### `POST /V1/pii_integration/profile_first_name_source` — Profile first name source

**Profile first name source.** Read and write first names directly in the PII service (test token).

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** Read (name source diagnostic) · **Code** `app/controllers/v1/pii_integration_controller.rb; config/routes.rb#L22`

**Request**

Request fields: `first_name` (optional · from code — confirm with Dev), `ref` (optional, string · from code — confirm with Dev), `user_id` (optional, string · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/V1/pii_integration/profile_first_name_source" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Content-Type: application/json" \
  --data-binary '{}'
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `user_id` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)
- `pii_only_write_performed` (seen on staging 2026-10-25)
- `db_first_name_before` (seen on staging 2026-10-25)
- `db_first_name_after` (seen on staging 2026-10-25)
- `pii_first_name` (seen on staging 2026-10-25)
- `profile_response_first_name` (seen on staging 2026-10-25)
- `profile_response_uses_pii` (seen on staging 2026-10-25)
- `hide_first_name` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `Declared route; profile_first_name_source action is absent (broken)`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** **Broken declaration:** `profile_first_name_source` is present in routes but absent from `V1::PiiIntegrationController`. A valid test token cannot make this route work. Do not use it as a successful PII smoke test. The diagnostic command below demonstrates the declared route only.
- **Observed on staging:** Observed 2026-10-19: route IS implemented on staging (contradicts the Dev doc) — {} → 400 "Missing required parameter: user_id or ref"; unknown ref → 404 "Profile not found".
- **Known limitation:** The Dev inventory lists this route without an action; staging does answer it (see the observed behaviour).

**What changed**

- 2026-10-29 — Request field added: `user_id` · from code — confirm with Dev · `app/controllers/v1/pii_integration_controller.rb:125 @004e72c (via profile_from_params)`
- 2026-10-29 — Request field added: `ref` · from code — confirm with Dev · `app/controllers/v1/pii_integration_controller.rb:127 @004e72c (via profile_from_params)`
- 2026-10-29 — Request field added: `first_name` · from code — confirm with Dev · `app/controllers/v1/pii_integration_controller.rb:92 @004e72c`
- 2026-10-25 — Response field added: `hide_first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_response_uses_pii` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_response_first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `pii_first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `db_first_name_after` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `db_first_name_before` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `pii_only_write_performed` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user_id` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="area-g2"></a>

### Sign-up, login & account

Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data. 13 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| POST | [`/V1/users/toggle_hide_name`](#api-032) | Toggle hide name |
| POST | [`/V1/user/submit_profile`](#api-057) | Update profile |
| POST | [`/V1/user/edit`](#api-058) | Edit profile |
| POST | [`/V1/user/delete`](#api-059) | Delete account |
| POST | [`/V1/sessions/verify_number_login_v1`](#api-060) | Verify number login v1 |
| POST | [`/V1/sessions/submit_profile_web`](#api-061) | Update profile web |
| POST | [`/V1/sessions/fetch_login_response`](#api-062) | Create login response v1 |
| POST | [`/web/user/update`](#api-129) | Update profile |
| POST | [`/web/user/edit`](#api-130) | Edit profile |
| POST | [`/web/user/delete`](#api-131) | Delete account |
| POST | [`/V1/users/delete_older_account`](#api-196) | Users delete older account |
| POST | [`/V1/users/delete_current_account`](#api-197) | Users delete current account |
| POST | [`/V1/user/reset_profile`](#api-198) | User reset profile |

<a id="api-032"></a>

#### `POST /V1/users/toggle_hide_name` — Toggle hide name

**Toggle hide name.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (hide/unhide name) · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L94`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/toggle_hide_name" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `first_name` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `toggle_hide_name`
2. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-057"></a>

#### `POST /V1/user/submit_profile` — Update profile

**Update profile.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (writes), Email (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Write / update PII · **Code** `app/controllers/v1/sessions_controller.rb; config/routes.rb#L153`

**Request**

Request fields: `data`, `general_information`, `first_name`, `personal_email`, `gender`, `date_of_birth_v1`, `faith`, `id`, `mother_tongue`, `height`, `relationship_goal`, `photos`, `photo`, `preferences`, `latitude`, `longitude`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/user/submit_profile" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "data": {
    "general_information": {
      "first_name": "Asha",
      "personal_email": "asha@example.com",
      "gender": "Female",
      "date_of_birth_v1": "1996-01-15",
      "faith": {
        "id": "$FAITH_ID"
      },
      "mother_tongue": {
        "id": "$LANGUAGE_ID"
      },
      "height": 65
    },
    "relationship_goal": {
      "id": "$RELATIONSHIP_GOAL_ID"
    },
    "photos": [
      {
        "photo": "$PHOTO_URL_1"
      },
      {
        "photo": "$PHOTO_URL_2"
      }
    ],
    "preferences": [],
    "latitude": 12.9716,
    "longitude": 77.5946
  }
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `id` (seen on staging 2026-10-25)
- `status_v1` (seen on staging 2026-10-25)
- `auth_token` (seen on staging 2026-10-25)
- `first_name` (seen on staging 2026-10-25)
- `gender` (seen on staging 2026-10-25)
- `profile_state` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `verification_status` (seen on staging 2026-10-25)
- `has_mobile_number` (seen on staging 2026-10-25)
- `application_stage` (seen on staging 2026-10-25)
- `application_stage_v2` (seen on staging 2026-10-25)
- `is_boost_available` (seen on staging 2026-10-25)
- `has_concierge_subscription` (seen on staging 2026-10-25)
- `show_concierge_icon` (seen on staging 2026-10-25)
- `zendesk_url` (seen on staging 2026-10-25)
- `use_firebase_face_recognition` (seen on staging 2026-10-25)
- `show_update_app` (seen on staging 2026-10-25)
- `enable_instagram_connection` (seen on staging 2026-10-25)
- `display_watch_clip` (seen on staging 2026-10-25)
- `video_information_urls` (seen on staging 2026-10-25)
- `your_story_form_url` (seen on staging 2026-10-25)
- `image_upload_api` (seen on staging 2026-10-25)
- `can_send_competitor_data` (seen on staging 2026-10-25)
- `move_image_upload_to_last_page` (seen on staging 2026-10-25)
- `use_presigned_url` (seen on staging 2026-10-25)
- `selfie_compression_size` (seen on staging 2026-10-25)
- `is_onboarding_phase_2` (seen on staging 2026-10-25)
- `use_liveliness_check` (seen on staging 2026-10-25)
- `meta_trigger_event_list` (seen on staging 2026-10-25)
- `pubnub_origin_link` (seen on staging 2026-10-25)
- `last_android_constant_file_update` (seen on staging 2026-10-25)
- `last_ios_constant_file_update` (seen on staging 2026-10-25)
- `store_kit_2_enabled` (seen on staging 2026-10-25)
- `active_algorithms` (seen on staging 2026-10-25)
- `enable_multi_comment` (seen on staging 2026-10-25)
- `popular_profile` (seen on staging 2026-10-25)
- `is_likely_to_pay` (seen on staging 2026-10-25)
- `first_login_after_approval` (seen on staging 2026-10-25)
- `avatar` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)
- `about` (seen on staging 2026-10-25)
- `age` (seen on staging 2026-10-25)
- `review_warning` (seen on staging 2026-10-25)
- `active_plan_type` (seen on staging 2026-10-25)
- `has_bought_subscription` (seen on staging 2026-10-25)
- `is_boost_active` (seen on staging 2026-10-25)
- `selfie_verification_allowed` (seen on staging 2026-10-25)
- `selfie_verification_message` (seen on staging 2026-10-25)
- `attempts_left` (seen on staging 2026-10-25)
- `is_deleted` (seen on staging 2026-10-25)
- `show_weekly` (seen on staging 2026-10-25)
- `is_liveness_verified` (seen on staging 2026-10-25)
- `show_discounted_pricing` (seen on staging 2026-10-25)
- `intro_offer_timer` (seen on staging 2026-10-25)
- `show_personalised_comment_popup` (seen on staging 2026-10-25)
- `personalised_comment_popup_text` (seen on staging 2026-10-25)
- `selfie_gesture` (seen on staging 2026-10-25)
- `show_complete_profile_popup` (seen on staging 2026-10-25)
- `is_spark_enabled` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_profile`
2. `submit_profile`
3. `update_application_information!`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `update_profile`
2. `submit_profile`
3. `update_application_information!`
4. `Account::Email.add_email/search_user_ids` — Links the onboarding email to the user (only when the user has none yet).

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| PII database | `user_pii_field_value (field_name = EMAIL)` | write (upsert) |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Onboarding writes first name and email only when their existing values are missing. Use an onboarding user and valid field IDs and uploaded photos. The web controller also uses this shared submit flow.
- **Observed on staging:** Observed 2026-10-23: POST /V1/user/submit_profile with {} or {data:{}} (new user) → 406 {status, message:"Please submit valid details…", your_story_form_url, is_backend_error, is_spark_enabled}. With the UI automation team’s body (option ids, 4 Aisle-CDN photos) → 200, profile_state "pending_not_verified", the submitted first_name returned; after POST /V1/account_journey/update_community_message_agreed a new verify shows application_stage "completed". ~35 s later profile_state became "image_inappropriate" with gender-mixed photo sets; with the gender-matched MALE set the profile stayed "pending_not_verified" >60 s (photos must match the declared gender; submit_profile copies each photo URL and stores a 54-byte placeholder if it cannot fetch it, still answering 200).

**What changed**

- 2026-10-25 — Response field added: `is_spark_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_complete_profile_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_gesture` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `personalised_comment_popup_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_personalised_comment_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `intro_offer_timer` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_discounted_pricing` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_liveness_verified` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_weekly` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_deleted` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `attempts_left` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_allowed` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_active` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_bought_subscription` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `active_plan_type` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `review_warning` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `age` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `about` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `avatar` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `first_login_after_approval` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_likely_to_pay` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `popular_profile` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `enable_multi_comment` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `active_algorithms` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `store_kit_2_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `last_ios_constant_file_update` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `last_android_constant_file_update` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `pubnub_origin_link` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `meta_trigger_event_list` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_liveliness_check` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_onboarding_phase_2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_compression_size` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_presigned_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `move_image_upload_to_last_page` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_send_competitor_data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `image_upload_api` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `your_story_form_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `video_information_urls` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `display_watch_clip` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `enable_instagram_connection` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_update_app` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_firebase_face_recognition` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `zendesk_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_concierge_icon` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_concierge_subscription` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_available` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `application_stage_v2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `application_stage` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_mobile_number` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `verification_status` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_state` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `gender` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `auth_token` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status_v1` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `id` · seen on staging 2026-10-25

<a id="api-058"></a>

#### `POST /V1/user/edit` — Edit profile

**Edit profile.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (writes), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Write / update PII · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L154`

**Request**

Request fields: `data`, `general_information`, `first_name`, `photos`, `photo`, `photo_id`, `status`, `user_traits`, `trait_id`, `user_interests_v2`, `interest_id`, `preferences`, `partial_work`, `work_title`, `industry`, `college`, `graduation_year`, `audio_prompt`, `question_id`, `audio_url`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/user/edit" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "data": {
    "general_information": {
      "first_name": "Asha"
    },
    "photos": [
      {
        "photo": "$PHOTO_URL_1",
        "photo_id": "$PHOTO_ID_1",
        "status": "avatar"
      },
      {
        "photo": "$PHOTO_URL_2",
        "photo_id": "$PHOTO_ID_2"
      }
    ],
    "user_traits": [
      {
        "trait_id": "$TRAIT_ID"
      }
    ],
    "user_interests_v2": [
      {
        "interest_id": "$INTEREST_V2_ID"
      }
    ],
    "preferences": [],
    "partial_work": {
      "work_title": "Engineer",
      "industry": "Technology",
      "college": "Example College",
      "graduation_year": "2018"
    },
    "audio_prompt": {
      "question_id": "$AUDIO_QUESTION_ID",
      "audio_url": "$AUDIO_URL"
    }
  }
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)
- `intro_questions` (seen on staging 2026-10-25)
- `discover_profile_order` (seen on staging 2026-10-25)
- `audio_prompts` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `edit_profile`
2. `edit_profile_details`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `edit_profile`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `edit_profile`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Use the current complete editable payload when testing an existing profile: omitted work, traits, interests or audio fields can be cleared by edit_profile_details. personal_email in this body does not update email; this edit path changes the name and returns the existing email and phone.

**What changed**

- 2026-10-25 — Response field added: `audio_prompts` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `discover_profile_order` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `intro_questions` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-059"></a>

#### `POST /V1/user/delete` — Delete account

**Delete account.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (reads), Email (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Delete account (reads PII for cleanup) · **Code** `app/controllers/v1/sessions_controller.rb; config/routes.rb#L155`

**Request**

Request fields: `reason_id`, `note`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/user/delete" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "reason_id": "$DELETE_REASON_ID",
  "note": "Synthetic PII regression account"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `delete_account`
2. `delete_all_account_info`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `delete_account`
2. `delete_all_account_info`
3. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Deletion uses PII names/emails in its downstream account cleanup payload. Run only for a disposable test account.
- **Observed on staging:** Observed 2026-10-23: a NEW (onboarding-stage) user’s valid token → 401; account deletion works only after onboarding. For an onboarded account: {id:<ref>} alone → 500; {id:<ref>, reason_id:1, note} → 200, the old token is dead afterwards and a new login starts at application_stage general_information_stage_1 (no profile). A "disabled" profile cannot be recovered (activate_user 403, delete has no effect). Confirmed again for a male-set account: delete → 200 and the number is reset.

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-060"></a>

#### `POST /V1/sessions/verify_number_login_v1` — Verify number login v1

**Verify number login v1.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (reads), Email (reads), Phone (writes), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app (before login) · **Auth** None — provider signature · **Operation** Write / update PII · **Code** `app/controllers/v1/sessions_controller.rb; config/routes.rb#L160`

**Request**

Request fields: `phone_code_id`, `mobile_number`, `otp`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/sessions/verify_number_login_v1" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "phone_code_id": "$PHONE_CODE_ID",
  "mobile_number": "1012345678",
  "otp": "$OTP"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `verify_number_login_v1`
2. `verify_login_with_number`
3. `login_from_phone_number`
4. `login_response_v1`
5. `send_for_aws_moderation` — Content moderation and scammer check (only in some states).
6. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
7. `create_profile_response` — Rebuilds or reads the cached profile response.
8. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
9. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `verify_number_login_v1`
2. `verify_login_with_number`
3. `login_from_phone_number`
4. `login_response_v1`
5. `send_for_aws_moderation` — Content moderation and scammer check (only in some states).
6. `check_for_scammer_before_moderation!` — Content moderation and scammer check (only in some states).
7. `fetch_email_domain` — Reads the email domain for the scammer check during moderation.

_Code path — Phone_

1. `verify_number_login_v1`
2. `verify_login_with_number`
3. `login_from_phone_number`
4. `write_pii_phone_number_for_user` — Writes the national phone number to the PII service — only when a new user is created.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | write (upsert) |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Obtain a fresh OTP through login_with_phone_number first. The phone PII write occurs only for a newly created User, not every returning login.
- **Observed on staging:** Observed 2026-10-23 (3 throwaway 107… accounts): OTP request POST /V1/sessions/login_with_phone_number {mobile_number} with Accept, Content-Type, device_type, app_version, unique_identifier → 200 {status, message, phone_code:"+91", mobile_number, zendesk_url, your_story_form_url}; phone_code_id and signature_v1 are not required (defaults to +91); an empty body {} → 500 {title, message:"Something went wrong…", is_backend_error} (server error on bad input). verify_number_login_v1 {mobile_number, otp:"1234"} (no phone_code_id) → 200 with id, auth_token, first_name, profile_state:null, application_stage:"general_information_stage_1", show_update_app. auth_token is an RS256 JWT (~168 h; claims iss, sub, aud, iat, exp, uid, did, ptfrm, phone_id) bound to the device: send the same unique_identifier and device_type as at login, as Authorization: Bearer. app_version 10.0.0 and 99.99.99 both accepted (show_update_app:true does not block). Later 2026-10-23 (UI automation team flow): OTP request {mobile_number, phone_code_id:242, device_type, app_version, unique_identifier, signature_v1} and verify {phone_code_id:242, mobile_number, otp:"1234"} → auth_token, id, ref, application_stage, profile_state (top level or under data); errors "The entered OTP is invalid." / "No OTP has been generated for this user or number." — refused verifies (wrong OTP, too-short number, letters, empty number) answer HTTP 200 with the error and NO token.
- **Known limitation:** The phone is written to the PII service only when a new user is created; returning logins do not re-sync it.

<a id="api-061"></a>

#### `POST /V1/sessions/submit_profile_web` — Update profile web

**Update profile web.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (writes), Email (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Write / update PII · **Code** `app/controllers/v1/sessions_controller.rb; config/routes.rb#L161`

**Request**

Request fields: `data`, `general_information`, `first_name`, `personal_email`, `gender`, `date_of_birth_v1`, `faith`, `id`, `mother_tongue`, `height`, `relationship_goal`, `photos`, `preferences`, `latitude`, `longitude`, `receiver_profile`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/sessions/submit_profile_web" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "data": {
    "general_information": {
      "first_name": "Asha",
      "personal_email": "asha@example.com",
      "gender": "Female",
      "date_of_birth_v1": "1996-01-15",
      "faith": {
        "id": "$FAITH_ID"
      },
      "mother_tongue": {
        "id": "$LANGUAGE_ID"
      },
      "height": 65
    },
    "relationship_goal": {
      "id": "$RELATIONSHIP_GOAL_ID"
    },
    "photos": [],
    "preferences": [],
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  "receiver_profile": "$OTHER_REF"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)
- `is_invite_available` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_profile_web`
2. `submit_profile_web`
3. `update_application_information_web!`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `update_profile_web`
2. `submit_profile_web`
3. `update_application_information_web!`
4. `Account::Email.add_email/search_user_ids` — Links the onboarding email to the user (only when the user has none yet).

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| PII database | `user_pii_field_value (field_name = EMAIL)` | write (upsert) |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** This is /V1/sessions/submit_profile_web. It only enters the new-profile branch if the user has no profile; receiver_profile must identify an eligible invitation target.

**What changed**

- 2026-10-25 — Response field added: `is_invite_available` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-062"></a>

#### `POST /V1/sessions/fetch_login_response` — Create login response v1

**Create login response v1.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (reads), Email (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app (before login) · **Auth** None — provider signature · **Operation** Login (reads/writes PII) · **Code** `app/controllers/v1/sessions_controller.rb; config/routes.rb#L164`

**Request**

Request fields: `user_id`, `is_new_user`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/sessions/fetch_login_response" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "$USER_ID",
  "is_new_user": false
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `create_login_response_v1`
2. `login_from_phone_number_v1`
3. `login_response_v1`
4. `send_for_aws_moderation` — Content moderation and scammer check (only in some states).
5. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
6. `create_profile_response` — Rebuilds or reads the cached profile response.
7. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
8. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `create_login_response_v1`
2. `login_from_phone_number_v1`
3. `login_response_v1`
4. `send_for_aws_moderation` — Content moderation and scammer check (only in some states).
5. `check_for_scammer_before_moderation!` — Content moderation and scammer check (only in some states).
6. `fetch_email_domain` — Reads the email domain for the scammer check during moderation.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: POST /V1/sessions/fetch_login_response {user_id, is_new_user:false} with NO credential → 200 with auth_token, first_name, gender, profile_state … for that user (also for another synthetic account’s id — possible defect); unknown user_id → 500.
- **Known limitation:** Returning logins do not re-sync the phone to the PII service.

<a id="api-129"></a>

#### `POST /web/user/update` — Update profile

**Update profile.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (writes), Email (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Write / update PII · **Code** `app/controllers/web/sessions_controller.rb; config/routes.rb#L365`

**Request**

Request fields: `data`, `general_information`, `first_name`, `personal_email`, `gender`, `date_of_birth_v1`, `faith`, `id`, `mother_tongue`, `height`, `relationship_goal`, `photos`, `photo`, `preferences`, `latitude`, `longitude`

```bash
curl -i --request POST "https://testa2.aisle.co/web/user/update" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "data": {
    "general_information": {
      "first_name": "Asha",
      "personal_email": "asha@example.com",
      "gender": "Female",
      "date_of_birth_v1": "1996-01-15",
      "faith": {
        "id": "$FAITH_ID"
      },
      "mother_tongue": {
        "id": "$LANGUAGE_ID"
      },
      "height": 65
    },
    "relationship_goal": {
      "id": "$RELATIONSHIP_GOAL_ID"
    },
    "photos": [
      {
        "photo": "$PHOTO_URL_1"
      },
      {
        "photo": "$PHOTO_URL_2"
      }
    ],
    "preferences": [],
    "latitude": 12.9716,
    "longitude": 77.5946
  }
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `id` (seen on staging 2026-10-25)
- `status_v1` (seen on staging 2026-10-25)
- `auth_token` (seen on staging 2026-10-25)
- `first_name` (seen on staging 2026-10-25)
- `gender` (seen on staging 2026-10-25)
- `profile_state` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `verification_status` (seen on staging 2026-10-25)
- `has_mobile_number` (seen on staging 2026-10-25)
- `application_stage` (seen on staging 2026-10-25)
- `application_stage_v2` (seen on staging 2026-10-25)
- `is_boost_available` (seen on staging 2026-10-25)
- `has_concierge_subscription` (seen on staging 2026-10-25)
- `show_concierge_icon` (seen on staging 2026-10-25)
- `zendesk_url` (seen on staging 2026-10-25)
- `use_firebase_face_recognition` (seen on staging 2026-10-25)
- `show_update_app` (seen on staging 2026-10-25)
- `enable_instagram_connection` (seen on staging 2026-10-25)
- `display_watch_clip` (seen on staging 2026-10-25)
- `video_information_urls` (seen on staging 2026-10-25)
- `your_story_form_url` (seen on staging 2026-10-25)
- `image_upload_api` (seen on staging 2026-10-25)
- `can_send_competitor_data` (seen on staging 2026-10-25)
- `move_image_upload_to_last_page` (seen on staging 2026-10-25)
- `use_presigned_url` (seen on staging 2026-10-25)
- `selfie_compression_size` (seen on staging 2026-10-25)
- `is_onboarding_phase_2` (seen on staging 2026-10-25)
- `use_liveliness_check` (seen on staging 2026-10-25)
- `meta_trigger_event_list` (seen on staging 2026-10-25)
- `pubnub_origin_link` (seen on staging 2026-10-25)
- `last_android_constant_file_update` (seen on staging 2026-10-25)
- `last_ios_constant_file_update` (seen on staging 2026-10-25)
- `store_kit_2_enabled` (seen on staging 2026-10-25)
- `active_algorithms` (seen on staging 2026-10-25)
- `enable_multi_comment` (seen on staging 2026-10-25)
- `popular_profile` (seen on staging 2026-10-25)
- `is_likely_to_pay` (seen on staging 2026-10-25)
- `first_login_after_approval` (seen on staging 2026-10-25)
- `avatar` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)
- `about` (seen on staging 2026-10-25)
- `age` (seen on staging 2026-10-25)
- `review_warning` (seen on staging 2026-10-25)
- `active_plan_type` (seen on staging 2026-10-25)
- `has_bought_subscription` (seen on staging 2026-10-25)
- `is_boost_active` (seen on staging 2026-10-25)
- `selfie_verification_allowed` (seen on staging 2026-10-25)
- `selfie_verification_message` (seen on staging 2026-10-25)
- `attempts_left` (seen on staging 2026-10-25)
- `is_deleted` (seen on staging 2026-10-25)
- `show_weekly` (seen on staging 2026-10-25)
- `is_liveness_verified` (seen on staging 2026-10-25)
- `show_discounted_pricing` (seen on staging 2026-10-25)
- `intro_offer_timer` (seen on staging 2026-10-25)
- `show_personalised_comment_popup` (seen on staging 2026-10-25)
- `personalised_comment_popup_text` (seen on staging 2026-10-25)
- `selfie_gesture` (seen on staging 2026-10-25)
- `show_complete_profile_popup` (seen on staging 2026-10-25)
- `is_spark_enabled` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_profile`
2. `submit_profile`
3. `update_application_information!`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `update_profile`
2. `submit_profile`
3. `update_application_information!`
4. `Account::Email.add_email/search_user_ids` — Links the onboarding email to the user (only when the user has none yet).

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| PII database | `user_pii_field_value (field_name = EMAIL)` | write (upsert) |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Onboarding writes first name and email only when their existing values are missing. Use an onboarding user and valid field IDs and uploaded photos. The web controller also uses this shared submit flow.

**What changed**

- 2026-10-25 — Response field added: `is_spark_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_complete_profile_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_gesture` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `personalised_comment_popup_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_personalised_comment_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `intro_offer_timer` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_discounted_pricing` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_liveness_verified` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_weekly` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_deleted` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `attempts_left` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_allowed` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_active` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_bought_subscription` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `active_plan_type` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `review_warning` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `age` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `about` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `avatar` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `first_login_after_approval` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_likely_to_pay` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `popular_profile` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `enable_multi_comment` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `active_algorithms` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `store_kit_2_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `last_ios_constant_file_update` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `last_android_constant_file_update` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `pubnub_origin_link` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `meta_trigger_event_list` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_liveliness_check` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_onboarding_phase_2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_compression_size` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_presigned_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `move_image_upload_to_last_page` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_send_competitor_data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `image_upload_api` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `your_story_form_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `video_information_urls` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `display_watch_clip` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `enable_instagram_connection` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_update_app` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_firebase_face_recognition` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `zendesk_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_concierge_icon` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_concierge_subscription` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_available` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `application_stage_v2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `application_stage` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_mobile_number` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `verification_status` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_state` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `gender` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `auth_token` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status_v1` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `id` · seen on staging 2026-10-25

<a id="api-130"></a>

#### `POST /web/user/edit` — Edit profile

**Edit profile.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (writes), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Write / update PII · **Code** `app/controllers/web/users_controller.rb; config/routes.rb#L366`

**Request**

Request fields: `data`, `general_information`, `first_name`, `photos`, `photo`, `photo_id`, `status`, `user_traits`, `trait_id`, `user_interests_v2`, `interest_id`, `preferences`, `partial_work`, `work_title`, `industry`, `college`, `graduation_year`, `audio_prompt`, `question_id`, `audio_url`, `data.about` (optional · from code — confirm with Dev), `data.user_interests` (optional · from code — confirm with Dev), `device_type` (optional · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/web/user/edit" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "data": {
    "general_information": {
      "first_name": "Asha"
    },
    "photos": [
      {
        "photo": "$PHOTO_URL_1",
        "photo_id": "$PHOTO_ID_1",
        "status": "avatar"
      },
      {
        "photo": "$PHOTO_URL_2",
        "photo_id": "$PHOTO_ID_2"
      }
    ],
    "user_traits": [
      {
        "trait_id": "$TRAIT_ID"
      }
    ],
    "user_interests_v2": [
      {
        "interest_id": "$INTEREST_V2_ID"
      }
    ],
    "preferences": [],
    "partial_work": {
      "work_title": "Engineer",
      "industry": "Technology",
      "college": "Example College",
      "graduation_year": "2018"
    },
    "audio_prompt": {
      "question_id": "$AUDIO_QUESTION_ID",
      "audio_url": "$AUDIO_URL"
    }
  }
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `edit_profile`
2. `edit_profile_details`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `edit_profile`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `edit_profile`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Use the current complete editable payload when testing an existing profile: omitted work, traits, interests or audio fields can be cleared by edit_profile_details. personal_email in this body does not update email; this edit path changes the name and returns the existing email and phone.

**What changed**

- 2026-10-29 — Request field added: `device_type` · from code — confirm with Dev · `app/controllers/web/users_controller.rb:34 @004e72c`
- 2026-10-29 — Request field added: `data.user_interests` · from code — confirm with Dev · `app/controllers/web/users_controller.rb:37 @004e72c`
- 2026-10-29 — Request field added: `data.about` · from code — confirm with Dev · `app/controllers/web/users_controller.rb:38 @004e72c`
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-131"></a>

#### `POST /web/user/delete` — Delete account

**Delete account.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (reads), Email (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Delete account (reads PII for cleanup) · **Code** `app/controllers/web/sessions_controller.rb; config/routes.rb#L367`

**Request**

Request fields: `reason_id`, `note`

```bash
curl -i --request POST "https://testa2.aisle.co/web/user/delete" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "reason_id": "$DELETE_REASON_ID",
  "note": "Synthetic PII regression account"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `delete_account`
2. `delete_all_account_info`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `delete_account`
2. `delete_all_account_info`
3. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Deletion uses PII names/emails in its downstream account cleanup payload. Run only for a disposable test account.

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-196"></a>

#### `POST /V1/users/delete_older_account` — Users delete older account

**Users delete older account.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (reads), Email (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Delete account (reads PII for cleanup) · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L98`

**Request**

Request fields: `ref`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/delete_older_account" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name, Email_

1. `User.delete_older_account`
2. `delete_all_account_info`
3. `deletion email name and recipient`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/users_controller.rb:300 @004e72c`

<a id="api-197"></a>

#### `POST /V1/users/delete_current_account` — Users delete current account

**Users delete current account.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (reads), Email (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Delete account (reads PII for cleanup) · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L99`

**Request**

Request fields: `ref`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/delete_current_account" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

**End-to-end flow**

_Code path — First name, Email_

1. `User.delete_current_account`
2. `delete_all_account_info`
3. `deletion email name and recipient`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-198"></a>

#### `POST /V1/user/reset_profile` — User reset profile

**User reset profile.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Write / update PII · **Code** `app/controllers/v1/sessions_controller.rb; config/routes.rb#L156`

**Request**

Request fields: `reason_id`, `note`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/user/reset_profile" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "reason_id": "$DELETE_REASON_ID",
  "note": "Synthetic account reset"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `id` (seen on staging 2026-10-25)
- `status_v1` (seen on staging 2026-10-25)
- `auth_token` (seen on staging 2026-10-25)
- `first_name` (seen on staging 2026-10-25)
- `gender` (seen on staging 2026-10-25)
- `profile_state` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `verification_status` (seen on staging 2026-10-25)
- `has_mobile_number` (seen on staging 2026-10-25)
- `application_stage` (seen on staging 2026-10-25)
- `application_stage_v2` (seen on staging 2026-10-25)
- `is_boost_available` (seen on staging 2026-10-25)
- `has_concierge_subscription` (seen on staging 2026-10-25)
- `show_concierge_icon` (seen on staging 2026-10-25)
- `zendesk_url` (seen on staging 2026-10-25)
- `use_firebase_face_recognition` (seen on staging 2026-10-25)
- `show_update_app` (seen on staging 2026-10-25)
- `enable_instagram_connection` (seen on staging 2026-10-25)
- `display_watch_clip` (seen on staging 2026-10-25)
- `video_information_urls` (seen on staging 2026-10-25)
- `your_story_form_url` (seen on staging 2026-10-25)
- `image_upload_api` (seen on staging 2026-10-25)
- `can_send_competitor_data` (seen on staging 2026-10-25)
- `move_image_upload_to_last_page` (seen on staging 2026-10-25)
- `use_presigned_url` (seen on staging 2026-10-25)
- `selfie_compression_size` (seen on staging 2026-10-25)
- `is_onboarding_phase_2` (seen on staging 2026-10-25)
- `use_liveliness_check` (seen on staging 2026-10-25)
- `meta_trigger_event_list` (seen on staging 2026-10-25)
- `pubnub_origin_link` (seen on staging 2026-10-25)
- `last_android_constant_file_update` (seen on staging 2026-10-25)
- `last_ios_constant_file_update` (seen on staging 2026-10-25)
- `store_kit_2_enabled` (seen on staging 2026-10-25)
- `active_algorithms` (seen on staging 2026-10-25)
- `enable_multi_comment` (seen on staging 2026-10-25)
- `popular_profile` (seen on staging 2026-10-25)
- `is_likely_to_pay` (seen on staging 2026-10-25)
- `first_login_after_approval` (seen on staging 2026-10-25)
- `avatar` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)
- `about` (seen on staging 2026-10-25)
- `age` (seen on staging 2026-10-25)
- `review_warning` (seen on staging 2026-10-25)
- `active_plan_type` (seen on staging 2026-10-25)
- `has_bought_subscription` (seen on staging 2026-10-25)
- `is_boost_active` (seen on staging 2026-10-25)
- `selfie_verification_allowed` (seen on staging 2026-10-25)
- `selfie_verification_message` (seen on staging 2026-10-25)
- `attempts_left` (seen on staging 2026-10-25)
- `is_deleted` (seen on staging 2026-10-25)
- `show_weekly` (seen on staging 2026-10-25)
- `is_liveness_verified` (seen on staging 2026-10-25)
- `show_discounted_pricing` (seen on staging 2026-10-25)
- `intro_offer_timer` (seen on staging 2026-10-25)
- `show_personalised_comment_popup` (seen on staging 2026-10-25)
- `personalised_comment_popup_text` (seen on staging 2026-10-25)
- `selfie_gesture` (seen on staging 2026-10-25)
- `show_complete_profile_popup` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `User.reset_profile`
2. `copied/new Profile save callbacks and subscription/cache refresh`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Copies compatibility fields to a new user/profile. It does not explicitly seed the new user's NAME, EMAIL or PHONE service rows; see migration gaps.
- **Known limitation:** Copies local fields to a new user but does not create PII-service records for it.

**What changed**

- 2026-10-25 — Response field added: `show_complete_profile_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_gesture` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `personalised_comment_popup_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_personalised_comment_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `intro_offer_timer` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_discounted_pricing` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_liveness_verified` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_weekly` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_deleted` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `attempts_left` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_allowed` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_active` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_bought_subscription` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `active_plan_type` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `review_warning` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `age` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `about` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `avatar` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `first_login_after_approval` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_likely_to_pay` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `popular_profile` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `enable_multi_comment` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `active_algorithms` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `store_kit_2_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `last_ios_constant_file_update` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `last_android_constant_file_update` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `pubnub_origin_link` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `meta_trigger_event_list` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_liveliness_check` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_onboarding_phase_2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_compression_size` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_presigned_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `move_image_upload_to_last_page` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_send_competitor_data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `image_upload_api` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `your_story_form_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `video_information_urls` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `display_watch_clip` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `enable_instagram_connection` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_update_app` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_firebase_face_recognition` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `zendesk_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_concierge_icon` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_concierge_subscription` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_available` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `application_stage_v2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `application_stage` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_mobile_number` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `verification_status` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_state` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `gender` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `auth_token` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status_v1` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `id` · seen on staging 2026-10-25

<a id="area-g3"></a>

### Profiles

Return one profile — your own or another member’s. 13 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| GET | [`/V1/users/profile_info`](#api-011) | Users profile info |
| GET | [`/V1/users/profile_info_web`](#api-012) | Web profile info |
| GET | [`/V1/users/fetch_own_info`](#api-013) | Fetch own info |
| GET | [`/V1/users/discover_profile_list_v2`](#api-016) | Discover profile list v2 |
| GET | [`/V1/users/meta_for_discover`](#api-017) | Meta for discover |
| GET | [`/V1/users/get_shareable_link`](#api-018) | Get shareable link |
| GET | [`/V1/users/:ref`](#api-021) | Users by ref |
| GET | [`/V1/user/verify_user_v1`](#api-086) | Verify user v1 |
| POST | [`/V1/user/verify_user_v1`](#api-087) | Verify user v1 |
| GET | [`/V1/user/verify_user`](#api-088) | Verify user |
| GET | [`/web/users/profile_info`](#api-119) | Users profile info |
| GET | [`/web/users/:ref`](#api-120) | Users by ref |
| GET | [`/api/profile_data/:user_id`](#api-186) | Profile data |

<a id="api-011"></a>

#### `GET /V1/users/profile_info` — Users profile info

**Users profile info.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L68`

**Request**

Request fields: `ref`, `conversation_id` (optional · from code — confirm with Dev)

```bash
curl -i --request GET "https://testa2.aisle.co/V1/users/profile_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "ref=$OTHER_REF"
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)
- `intro_questions` (seen on staging 2026-10-25)
- `exclusivity` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `Profile.fetch_profile_info`
2. `profile_details cache hydration`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `exclusivity` · from code — confirm with Dev · `app/controllers/v1/users_controller.rb:103 @004e72c`
- 2026-10-29 — Request field added: `conversation_id` · from code — confirm with Dev · `app/controllers/v1/users_controller.rb:103 @004e72c`
- 2026-10-25 — Response field added: `intro_questions` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `own_info` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-012"></a>

#### `GET /V1/users/profile_info_web` — Web profile info

**Web profile info.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** None — provider signature · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L69`

**Request**

Request fields: `user_name`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/users/profile_info_web" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "user_name=$PUBLIC_USER_NAME"
```

**End-to-end flow**

_Code path — First name_

1. `web_profile_info`
2. `fetch_web_profile_info`
3. `profile_details` — Rebuilds or reads the cached profile response.
4. `create_cache_response` — Rebuilds or reads the cached profile response.
5. `hydrate_first_name!` — Fills the first name into a cached profile response.
6. `get_first_name_for_user` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** The target profile must satisfy public-profile visibility rules; Authorization is optional for this action.

<a id="api-013"></a>

#### `GET /V1/users/fetch_own_info` — Fetch own info

**Fetch own info.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L70`

**Request**

Request fields: none

```bash
curl -i --request GET "https://testa2.aisle.co/V1/users/fetch_own_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}"
```

**Response fields** (top level; type not stated unless shown)

- `user_id` (seen on staging 2026-10-25)
- `first_name` (seen on staging 2026-10-25)
- `profile_state` (seen on staging 2026-10-25)
- `gender` (seen on staging 2026-10-25)
- `has_selected_mbti` (seen on staging 2026-10-25)
- `hide_first_name` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `daily_requests_left` (seen on staging 2026-10-25)
- `show_complete_profile_popup` (seen on staging 2026-10-25)
- `active_plan_type` (seen on staging 2026-10-25)
- `daily_likes_left` (seen on staging 2026-10-25)
- `has_intro_answer` (seen on staging 2026-10-25)
- `pending_invitations_count` (seen on staging 2026-10-25)
- `likes_received_count` (seen on staging 2026-10-25)
- `total_connections_count` (seen on staging 2026-10-25)
- `verification_status` (seen on staging 2026-10-25)
- `selfie_verification_message_v1` (seen on staging 2026-10-25)
- `out_of_likes_messages` (seen on staging 2026-10-25)
- `icebreaker_add_popup_feature_enabled` (seen on staging 2026-10-25)
- `opposite_gender` (seen on staging 2026-10-25)
- `success_stories` (seen on staging 2026-10-25)
- `is_boost_active` (seen on staging 2026-10-25)
- `boost_time` (seen on staging 2026-10-25)
- `boost_popup` (seen on staging 2026-10-25)
- `show_boost_button` (seen on staging 2026-10-25)
- `has_active_survey` (seen on staging 2026-10-25)
- `has_concierge_subscription` (seen on staging 2026-10-25)
- `show_buy_extra_invites_popup` (seen on staging 2026-10-25)
- `can_add_settle` (seen on staging 2026-10-25)
- `can_import_contact` (seen on staging 2026-10-25)
- `show_concierge_icon` (seen on staging 2026-10-25)
- `has_story` (seen on staging 2026-10-25)
- `show_story_alert` (seen on staging 2026-10-25)
- `show_image_alert` (seen on staging 2026-10-25)
- `image_list` (seen on staging 2026-10-25)
- `zendesk_url` (seen on staging 2026-10-25)
- `has_audio_prompt` (seen on staging 2026-10-25)
- `has_settle` (seen on staging 2026-10-25)
- `has_partial_work` (seen on staging 2026-10-25)
- `has_relationship_goal` (seen on staging 2026-10-25)
- `has_philosophy` (seen on staging 2026-10-25)
- `settles` (seen on staging 2026-10-25)
- `preferences` (seen on staging 2026-10-25)
- `traits` (seen on staging 2026-10-25)
- `interests` (seen on staging 2026-10-25)
- `interests_v2` (seen on staging 2026-10-25)
- `icebreaker_questions` (seen on staging 2026-10-25)
- `audio_prompts` (seen on staging 2026-10-25)
- `display_auto_pop_up` (seen on staging 2026-10-25)
- `display_popup_on_launch` (seen on staging 2026-10-25)
- `image_prompts` (seen on staging 2026-10-25)
- `selfie_verification_allowed` (seen on staging 2026-10-25)
- `selfie_verification_message` (seen on staging 2026-10-25)
- `has_traits` (seen on staging 2026-10-25)
- `has_interests` (seen on staging 2026-10-25)
- `relationship_goals` (seen on staging 2026-10-25)
- `show_mandatory_complete_profile_popup` (seen on staging 2026-10-25)
- `phonepe_sub_id` (seen on staging 2026-10-25)
- `phonepe_cancel_text` (seen on staging 2026-10-25)
- `is_phonepe_sub_active` (seen on staging 2026-10-25)
- `sorting_popup_text` (seen on staging 2026-10-25)
- `show_my_type_button` (seen on staging 2026-10-25)
- `like_tab_sort_by` (seen on staging 2026-10-25)
- `like_tab_my_type` (seen on staging 2026-10-25)
- `show_discounted_pricing` (seen on staging 2026-10-25)
- `intro_offer_timer` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `fetch_own_info`
2. `fetch_own_info`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-19: no token → 401 {unauthorized_request:true}. Observed 2026-10-23: a NEW (onboarding-stage) user’s valid token → 401 {unauthorized_request} — a 401 here is not proof of a credential problem; an ONBOARDED user’s token → 200 {user_id, first_name, profile_state, gender, hide_first_name, …} (no email), before and >60 s after submit with the male photo set.

**What changed**

- 2026-10-25 — Response field added: `intro_offer_timer` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_discounted_pricing` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `like_tab_my_type` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `like_tab_sort_by` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_my_type_button` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `sorting_popup_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_phonepe_sub_active` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `phonepe_cancel_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `phonepe_sub_id` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_mandatory_complete_profile_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `relationship_goals` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_interests` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_traits` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_allowed` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `image_prompts` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `display_popup_on_launch` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `display_auto_pop_up` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `audio_prompts` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `icebreaker_questions` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `interests_v2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `interests` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `traits` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `preferences` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `settles` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_philosophy` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_relationship_goal` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_partial_work` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_settle` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_audio_prompt` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `zendesk_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `image_list` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_image_alert` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_story_alert` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_story` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_concierge_icon` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_import_contact` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_add_settle` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_buy_extra_invites_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_concierge_subscription` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_active_survey` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_boost_button` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `boost_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `boost_time` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_active` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `success_stories` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `opposite_gender` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `icebreaker_add_popup_feature_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `out_of_likes_messages` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_message_v1` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `verification_status` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `total_connections_count` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `likes_received_count` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `pending_invitations_count` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_intro_answer` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `daily_likes_left` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `active_plan_type` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_complete_profile_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `daily_requests_left` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `hide_first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_selected_mbti` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `gender` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_state` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user_id` · seen on staging 2026-10-25

<a id="api-016"></a>

#### `GET /V1/users/discover_profile_list_v2` — Discover profile list v2

**Discover profile list v2.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L73`

**Request**

Request fields: `page`, `items_per_page`, `ps` (optional · from code — confirm with Dev)

```bash
curl -i --request GET "https://testa2.aisle.co/V1/users/discover_profile_list_v2" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `matches_list` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)
- `settings` (seen on staging 2026-10-25)
- `show_foryou_tab` (seen on staging 2026-10-25)
- `show_foryou_animation` (seen on staging 2026-10-25)
- `curator_feedback` (seen on staging 2026-10-25)
- `user_joined_after_incognito_mode` (seen on staging 2026-10-25)
- `show_incognito_mode` (seen on staging 2026-10-25)
- `is_user_incognito` (seen on staging 2026-10-25)
- `profile_sharing_popup_text` (seen on staging 2026-10-25)
- `has_recommendation` (seen on staging 2026-10-25)
- `incognito_mode_cards` (seen on staging 2026-10-25)
- `free_premium_female` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `discover_profile_list_v2`
2. `get_profile_from_link_ref`
3. `fetch_recommended_profile_header_text`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Request field added: `ps` · from code — confirm with Dev · `app/controllers/v1/users_controller.rb:51 @004e72c`
- 2026-10-25 — Response field added: `free_premium_female` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `incognito_mode_cards` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_recommendation` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_sharing_popup_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_user_incognito` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_incognito_mode` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user_joined_after_incognito_mode` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `curator_feedback` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_foryou_animation` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_foryou_tab` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `settings` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `own_info` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `matches_list` · seen on staging 2026-10-25

<a id="api-017"></a>

#### `GET /V1/users/meta_for_discover` — Meta for discover

**Meta for discover.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L75`

**Request**

Request fields: `ps` (optional · from code — confirm with Dev)

```bash
curl -i --request GET "https://testa2.aisle.co/V1/users/meta_for_discover" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}"
```

**Response fields** (top level; type not stated unless shown)

- `settings` (seen on staging 2026-10-25)
- `curator_feedback` (seen on staging 2026-10-25)
- `has_recommendation` (seen on staging 2026-10-25)
- `free_premium_female` (seen on staging 2026-10-25)
- `verification_status` (seen on staging 2026-10-25)
- `selfie_verification_allowed` (seen on staging 2026-10-25)
- `selfie_verification_message` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `selfie_compression_size` (seen on staging 2026-10-25)
- `attempts_left` (seen on staging 2026-10-25)
- `active_plan_type` (seen on staging 2026-10-25)
- `can_send_competitor_data` (seen on staging 2026-10-25)
- `video_information_urls` (seen on staging 2026-10-25)
- `your_story_form_url` (seen on staging 2026-10-25)
- `selfie_gesture` (seen on staging 2026-10-25)
- `use_liveliness_check` (seen on staging 2026-10-25)
- `meta_trigger_event_list` (seen on staging 2026-10-25)
- `is_liveness_verified` (seen on staging 2026-10-25)
- `user_id` (seen on staging 2026-10-25)
- `first_name` (seen on staging 2026-10-25)
- `profile_state` (seen on staging 2026-10-25)
- `gender` (seen on staging 2026-10-25)
- `hide_first_name` (seen on staging 2026-10-25)
- `daily_requests_left` (seen on staging 2026-10-25)
- `daily_likes_left` (seen on staging 2026-10-25)
- `is_boost_active` (seen on staging 2026-10-25)
- `show_buy_extra_invites_popup` (seen on staging 2026-10-25)
- `zendesk_url` (seen on staging 2026-10-25)
- `has_partial_work` (seen on staging 2026-10-25)
- `interests_v2` (seen on staging 2026-10-25)
- `icebreaker_questions` (seen on staging 2026-10-25)
- `audio_prompts` (seen on staging 2026-10-25)
- `phonepe_sub_id` (seen on staging 2026-10-25)
- `phonepe_cancel_text` (seen on staging 2026-10-25)
- `is_phonepe_sub_active` (seen on staging 2026-10-25)
- `image_list` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `profile_sharing_popup_text` (seen on staging 2026-10-25)
- `show_foryou_tab` (seen on staging 2026-10-25)
- `show_foryou_animation` (seen on staging 2026-10-25)
- `show_incognito_mode` (seen on staging 2026-10-25)
- `is_user_incognito` (seen on staging 2026-10-25)
- `user_joined_after_incognito_mode` (seen on staging 2026-10-25)
- `incognito_mode_cards` (seen on staging 2026-10-25)
- `boost_popup` (seen on staging 2026-10-25)
- `boost_time` (seen on staging 2026-10-25)
- `show_boost_button` (seen on staging 2026-10-25)
- `active_algorithms` (seen on staging 2026-10-25)
- `show_my_type_button` (seen on staging 2026-10-25)
- `like_tab_sort_by` (seen on staging 2026-10-25)
- `like_tab_my_type` (seen on staging 2026-10-25)
- `show_discounted_pricing` (seen on staging 2026-10-25)
- `has_audio_prompt` (seen on staging 2026-10-25)
- `has_settle` (seen on staging 2026-10-25)
- `has_relationship_goal` (seen on staging 2026-10-25)
- `has_philosophy` (seen on staging 2026-10-25)
- `has_traits` (seen on staging 2026-10-25)
- `has_interests` (seen on staging 2026-10-25)
- `has_story` (seen on staging 2026-10-25)
- `preferences` (seen on staging 2026-10-25)
- `relationship_goals` (seen on staging 2026-10-25)
- `traits` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `meta_for_discover`
2. `fetch_meta_for_discover_tab`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Request field added: `ps` · from code — confirm with Dev · `app/controllers/v1/users_controller.rb:27 @004e72c`
- 2026-10-25 — Response field added: `traits` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `relationship_goals` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `preferences` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_story` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_interests` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_traits` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_philosophy` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_relationship_goal` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_settle` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_audio_prompt` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_discounted_pricing` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `like_tab_my_type` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `like_tab_sort_by` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_my_type_button` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `active_algorithms` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_boost_button` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `boost_time` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `boost_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `incognito_mode_cards` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user_joined_after_incognito_mode` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_user_incognito` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_incognito_mode` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_foryou_animation` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_foryou_tab` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_sharing_popup_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `image_list` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_phonepe_sub_active` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `phonepe_cancel_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `phonepe_sub_id` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `audio_prompts` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `icebreaker_questions` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `interests_v2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_partial_work` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `zendesk_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_buy_extra_invites_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_active` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `daily_likes_left` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `daily_requests_left` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `hide_first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `gender` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_state` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user_id` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_liveness_verified` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `meta_trigger_event_list` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_liveliness_check` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_gesture` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `your_story_form_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `video_information_urls` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_send_competitor_data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `active_plan_type` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `attempts_left` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_compression_size` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_allowed` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `verification_status` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `free_premium_female` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_recommendation` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `curator_feedback` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `settings` · seen on staging 2026-10-25

<a id="api-018"></a>

#### `GET /V1/users/get_shareable_link` — Get shareable link

**Get shareable link.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L76`

**Request**

Request fields: `recommended_profile_ref`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/users/get_shareable_link" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "recommended_profile_ref=$OTHER_REF"
```

**Response fields** (top level; type not stated unless shown)

- `link` (seen on staging 2026-10-25)
- `preview_text` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `get_shareable_link`
2. `get_link`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `preview_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `link` · seen on staging 2026-10-25

<a id="api-021"></a>

#### `GET /V1/users/:ref` — Users by ref

**Users by ref.** Return one profile — your own or another member’s.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L83`

**Request**

Request fields: none

```bash
curl -i --request GET "https://testa2.aisle.co/V1/users/${REF}" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}"
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `intro_questions` (seen on staging 2026-10-25)
- `audio_prompts` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `show`
2. `get_specific_user`
3. `own_detailed_v1` — The owner’s full profile response.
4. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `show`
2. `get_specific_user`
3. `own_detailed_v1` — The owner’s full profile response.
4. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
5. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `show`
2. `get_specific_user`
3. `own_detailed_v1` — The owner’s full profile response.
4. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
5. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: for a synthetic account onboarded with the gender-matched male photo set, GET /V1/users/:ref → 200 before and >60 s after submit (old and fresh token).

**What changed**

- 2026-10-25 — Response field added: `audio_prompts` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `intro_questions` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-086"></a>

#### `GET /V1/user/verify_user_v1` — Verify user v1

**Verify user v1.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/app_releases_controller.rb; config/routes.rb#L275`

**Request**

Request fields: none

```bash
curl -i --request GET "https://testa2.aisle.co/V1/user/verify_user_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}"
```

**Response fields** (top level; type not stated unless shown)

- `mandatory` (seen on staging 2026-10-25)
- `invalid_account` (seen on staging 2026-10-25)
- `about` (seen on staging 2026-10-25)
- `age` (seen on staging 2026-10-25)
- `popular_profile` (seen on staging 2026-10-25)
- `is_likely_to_pay` (seen on staging 2026-10-25)
- `review_warning` (seen on staging 2026-10-25)
- `profile_state` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `verification_status` (seen on staging 2026-10-25)
- `has_intro_question` (seen on staging 2026-10-25)
- `has_mobile_number` (seen on staging 2026-10-25)
- `is_boost_active` (seen on staging 2026-10-25)
- `is_boost_available` (seen on staging 2026-10-25)
- `can_send_competitor_data` (seen on staging 2026-10-25)
- `has_concierge_subscription` (seen on staging 2026-10-25)
- `show_concierge_icon` (seen on staging 2026-10-25)
- `zendesk_url` (seen on staging 2026-10-25)
- `use_firebase_face_recognition` (seen on staging 2026-10-25)
- `show_update_app` (seen on staging 2026-10-25)
- `enable_instagram_connection` (seen on staging 2026-10-25)
- `selfie_verification_allowed` (seen on staging 2026-10-25)
- `selfie_verification_message` (seen on staging 2026-10-25)
- `display_watch_clip` (seen on staging 2026-10-25)
- `video_information_urls` (seen on staging 2026-10-25)
- `your_story_form_url` (seen on staging 2026-10-25)
- `attempts_left` (seen on staging 2026-10-25)
- `use_presigned_url` (seen on staging 2026-10-25)
- `image_inappropriate_message` (seen on staging 2026-10-25)
- `selfie_compression_size` (seen on staging 2026-10-25)
- `is_onboarding_phase_2` (seen on staging 2026-10-25)
- `application_stage_v2` (seen on staging 2026-10-25)
- `pre_discover_screen_text` (seen on staging 2026-10-25)
- `show_weekly` (seen on staging 2026-10-25)
- `version` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)
- `selfie_gesture` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `verify_user_v1`
2. `verify_users_details_v1`
3. `percentage_profile_complete`
4. `profile_details` — Rebuilds or reads the cached profile response.
5. `create_cache_response` — Rebuilds or reads the cached profile response.
6. `hydrate_first_name!` — Fills the first name into a cached profile response.
7. `get_first_name_for_user` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: GET /V1/user/verify_user_v1 with a NEW (onboarding-stage) user’s token → 200; also 200 for a freshly onboarded account (male set) before and >60 s after submit.

**What changed**

- 2026-10-25 — Response field added: `selfie_gesture` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `version` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_weekly` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `pre_discover_screen_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `application_stage_v2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_onboarding_phase_2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_compression_size` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `image_inappropriate_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_presigned_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `attempts_left` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `your_story_form_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `video_information_urls` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `display_watch_clip` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_allowed` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `enable_instagram_connection` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_update_app` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_firebase_face_recognition` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `zendesk_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_concierge_icon` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_concierge_subscription` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_send_competitor_data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_available` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_active` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_mobile_number` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_intro_question` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `verification_status` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_state` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `review_warning` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_likely_to_pay` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `popular_profile` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `age` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `about` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `invalid_account` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `mandatory` · seen on staging 2026-10-25

<a id="api-087"></a>

#### `POST /V1/user/verify_user_v1` — Verify user v1

**Verify user v1.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read (POST) · **Code** `app/controllers/v1/app_releases_controller.rb; config/routes.rb#L276`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/V1/user/verify_user_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `mandatory` (seen on staging 2026-10-25)
- `invalid_account` (seen on staging 2026-10-25)
- `about` (seen on staging 2026-10-25)
- `age` (seen on staging 2026-10-25)
- `popular_profile` (seen on staging 2026-10-25)
- `is_likely_to_pay` (seen on staging 2026-10-25)
- `review_warning` (seen on staging 2026-10-25)
- `profile_state` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `verification_status` (seen on staging 2026-10-25)
- `has_intro_question` (seen on staging 2026-10-25)
- `has_mobile_number` (seen on staging 2026-10-25)
- `is_boost_active` (seen on staging 2026-10-25)
- `is_boost_available` (seen on staging 2026-10-25)
- `can_send_competitor_data` (seen on staging 2026-10-25)
- `has_concierge_subscription` (seen on staging 2026-10-25)
- `show_concierge_icon` (seen on staging 2026-10-25)
- `zendesk_url` (seen on staging 2026-10-25)
- `use_firebase_face_recognition` (seen on staging 2026-10-25)
- `show_update_app` (seen on staging 2026-10-25)
- `enable_instagram_connection` (seen on staging 2026-10-25)
- `selfie_verification_allowed` (seen on staging 2026-10-25)
- `selfie_verification_message` (seen on staging 2026-10-25)
- `display_watch_clip` (seen on staging 2026-10-25)
- `video_information_urls` (seen on staging 2026-10-25)
- `your_story_form_url` (seen on staging 2026-10-25)
- `attempts_left` (seen on staging 2026-10-25)
- `use_presigned_url` (seen on staging 2026-10-25)
- `image_inappropriate_message` (seen on staging 2026-10-25)
- `selfie_compression_size` (seen on staging 2026-10-25)
- `is_onboarding_phase_2` (seen on staging 2026-10-25)
- `application_stage_v2` (seen on staging 2026-10-25)
- `pre_discover_screen_text` (seen on staging 2026-10-25)
- `show_weekly` (seen on staging 2026-10-25)
- `version` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)
- `selfie_gesture` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `verify_user_v1`
2. `verify_users_details_v1`
3. `percentage_profile_complete`
4. `profile_details` — Rebuilds or reads the cached profile response.
5. `create_cache_response` — Rebuilds or reads the cached profile response.
6. `hydrate_first_name!` — Fills the first name into a cached profile response.
7. `get_first_name_for_user` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `selfie_gesture` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `version` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_weekly` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `pre_discover_screen_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `application_stage_v2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_onboarding_phase_2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_compression_size` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `image_inappropriate_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_presigned_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `attempts_left` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `your_story_form_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `video_information_urls` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `display_watch_clip` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_allowed` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `enable_instagram_connection` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_update_app` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_firebase_face_recognition` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `zendesk_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_concierge_icon` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_concierge_subscription` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_send_competitor_data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_available` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_active` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_mobile_number` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_intro_question` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `verification_status` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_state` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `review_warning` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_likely_to_pay` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `popular_profile` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `age` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `about` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `invalid_account` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `mandatory` · seen on staging 2026-10-25

<a id="api-088"></a>

#### `GET /V1/user/verify_user` — Verify user

**Verify user.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/app_releases_controller.rb; config/routes.rb#L277`

**Request**

Request fields: none

```bash
curl -i --request GET "https://testa2.aisle.co/V1/user/verify_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}"
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `id` (seen on staging 2026-10-25)
- `application_stage` (seen on staging 2026-10-25)
- `application_stage_v2` (seen on staging 2026-10-25)
- `zendesk_url` (seen on staging 2026-10-25)
- `verification_status` (seen on staging 2026-10-25)
- `selfie_verification_allowed` (seen on staging 2026-10-25)
- `selfie_verification_message` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `auth_token` (seen on staging 2026-10-25)
- `selfie_compression_size` (seen on staging 2026-10-25)
- `popular_profile` (seen on staging 2026-10-25)
- `is_likely_to_pay` (seen on staging 2026-10-25)
- `meta_trigger_event_list` (seen on staging 2026-10-25)
- `move_image_upload_to_last_page` (seen on staging 2026-10-25)
- `attempts_left` (seen on staging 2026-10-25)
- `active_plan_type` (seen on staging 2026-10-25)
- `is_boost_active` (seen on staging 2026-10-25)
- `show_weekly` (seen on staging 2026-10-25)
- `can_send_competitor_data` (seen on staging 2026-10-25)
- `first_name` (seen on staging 2026-10-25)
- `avatar` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)
- `gender` (seen on staging 2026-10-25)
- `profile_state` (seen on staging 2026-10-25)
- `is_boost_available` (seen on staging 2026-10-25)
- `is_onboarding_phase_2` (seen on staging 2026-10-25)
- `use_presigned_url` (seen on staging 2026-10-25)
- `video_information_urls` (seen on staging 2026-10-25)
- `your_story_form_url` (seen on staging 2026-10-25)
- `age` (seen on staging 2026-10-25)
- `selfie_gesture` (seen on staging 2026-10-25)
- `mandatory` (seen on staging 2026-10-25)
- `invalid_account` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)
- `image_inappropriate_message` (seen on staging 2026-10-25)
- `pre_discover_screen_text` (seen on staging 2026-10-25)
- `show_complete_profile_popup` (seen on staging 2026-10-25)
- `use_liveliness_check` (seen on staging 2026-10-25)
- `is_liveness_verified` (seen on staging 2026-10-25)
- `active_algorithms` (seen on staging 2026-10-25)
- `success_stories` (seen on staging 2026-10-25)
- `can_import_contact` (seen on staging 2026-10-25)
- `pubnub_origin_link` (seen on staging 2026-10-25)
- `has_partial_work` (seen on staging 2026-10-25)
- `display_watch_clip` (seen on staging 2026-10-25)
- `last_android_constant_file_update` (seen on staging 2026-10-25)
- `last_ios_constant_file_update` (seen on staging 2026-10-25)
- `show_personalised_comment_popup` (seen on staging 2026-10-25)
- `personalised_comment_popup_text` (seen on staging 2026-10-25)
- `send_integrity_token` (seen on staging 2026-10-25)
- `store_kit_2_enabled` (seen on staging 2026-10-25)
- `show_discounted_pricing` (seen on staging 2026-10-25)
- `enable_multi_comment` (seen on staging 2026-10-25)
- `intro_offer_timer` (seen on staging 2026-10-25)
- `is_spark_enabled` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `verify_user`
2. `fetch_app_launch_info`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: GET /V1/user/verify_user with a NEW (onboarding-stage) user’s token → 200 incl. application_stage, application_stage_v2 (list of stages), selfie_compression_size.

**What changed**

- 2026-10-25 — Response field added: `is_spark_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `intro_offer_timer` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `enable_multi_comment` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_discounted_pricing` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `store_kit_2_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `send_integrity_token` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `personalised_comment_popup_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_personalised_comment_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `last_ios_constant_file_update` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `last_android_constant_file_update` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `display_watch_clip` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_partial_work` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `pubnub_origin_link` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_import_contact` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `success_stories` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `active_algorithms` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_liveness_verified` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_liveliness_check` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_complete_profile_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `pre_discover_screen_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `image_inappropriate_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `invalid_account` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `mandatory` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_gesture` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `age` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `your_story_form_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `video_information_urls` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `use_presigned_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_onboarding_phase_2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_available` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_state` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `gender` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `avatar` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_send_competitor_data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_weekly` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_active` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `active_plan_type` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `attempts_left` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `move_image_upload_to_last_page` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `meta_trigger_event_list` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_likely_to_pay` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `popular_profile` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_compression_size` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `auth_token` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_verification_allowed` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `verification_status` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `zendesk_url` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `application_stage_v2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `application_stage` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `id` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-119"></a>

#### `GET /web/users/profile_info` — Users profile info

**Users profile info.** Return one profile — your own or another member’s.

Personal data: First name (reads), Free text (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/web/users_controller.rb; config/routes.rb#L350`

**Request**

Request fields: `ref`

```bash
curl -i --request GET "https://testa2.aisle.co/web/users/profile_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "ref=$OTHER_REF"
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `Profile.fetch_profile_info`
2. `profile_details cache hydration`

_Free-text encryption — Free text_

1. `Request with free text` — Free-text encryption (Dev free-text API list (2026-10-23)): Profile info (returns the bio)
2. `PII service — free-text key` — Aisle creates or fetches an AES-256-GCM key; the text itself never goes to the PII service.
3. `Aisle encrypts / decrypts the text` — The encrypted text and its key_id are kept in the app database.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Free text | `—` | Encrypted by Aisle with a key from the PII service; there is no read switch. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `free_text_encryption_key` | read |
| App database | `encrypted text + key_id` | reads |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: no token → 401 (empty text/html body).

**What changed**

- 2026-10-25 — Response field added: `own_info` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-120"></a>

#### `GET /web/users/:ref` — Users by ref

**Users by ref.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/web/users_controller.rb; config/routes.rb#L351`

**Request**

Request fields: none

```bash
curl -i --request GET "https://testa2.aisle.co/web/users/${REF}" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json"
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `show`
2. `own_profile_web` — The owner’s full profile response.
3. `own_detailed_web` — The owner’s full profile response.
4. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-186"></a>

#### `GET /api/profile_data/:user_id` — Profile data

**Profile data.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Partner system (InfoEdge) · **Auth** INFOEDGE_PROFILE_API_TOKEN · **Operation** Read · **Code** `app/controllers/api/external_controller.rb; config/routes.rb#L672`

**Request**

Request fields: none

```bash
curl -i --request GET "https://testa2.aisle.co/api/profile_data/${USER_ID}" \
  --header "Authorization: Bearer ${INFOEDGE_PROFILE_API_TOKEN}" \
  --header "Accept: application/json"
```

**End-to-end flow**

_Code path — First name_

1. `profile_data`
2. `profile_details` — Rebuilds or reads the cached profile response.
3. `create_cache_response` — Rebuilds or reads the cached profile response.
4. `hydrate_first_name!` — Fills the first name into a cached profile response.
5. `get_first_name_for_user` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** The response omits first name, but profile_details still hydrates it internally. Uses INFOEDGE_PROFILE_API_TOKEN.
- **Known limitation:** The response leaves out the first name, although it is loaded internally.

<a id="area-g4"></a>

### Lists & discovery

Return lists of profiles, requests, likes, chats or events, with a first name per row. 21 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| GET | [`/V1/invites/all_requests`](#api-005) | List all requests |
| GET | [`/V1/invites/list_comments_with_pagination`](#api-006) | List comments with pagination |
| GET | [`/V1/invites/list_comments_and_likes`](#api-007) | List comments and likes |
| GET | [`/V1/invites/list_request_and_likes`](#api-008) | List request and likes |
| GET | [`/V1/users/matches_list_v2`](#api-014) | Matches list v2 |
| POST | [`/V1/users/matches_list_v3`](#api-015) | Matches list v2 |
| GET | [`/V1/users/fetch_concierge_list`](#api-019) | Fetch concierge list |
| GET | [`/V1/users/fetch_top_matched_profiles`](#api-020) | Fetch top matched profiles |
| GET | [`/V1/list_request_sent`](#api-047) | List request sent |
| GET | [`/V1/list_likes_received_v1`](#api-048) | List likes received v1 |
| GET | [`/V1/list_all_passed`](#api-049) | List all passed |
| POST | [`/V1/like_received`](#api-054) | List likes and requests received |
| GET | [`/V1/list_connected_profiles`](#api-063) | List connected profiles |
| GET | [`/V1/combined_messages_hidden_list`](#api-068) | Combined messages hidden list |
| POST | [`/V1/chat/chat_messages`](#api-069) | Chat messages |
| GET | [`/V1/speed_dating/event_info`](#api-101) | Event info |
| GET | [`/V1/advertisement/profiles_voted`](#api-106) | Profiles voted |
| GET | [`/V1/live_audio`](#api-107) | Live audio |
| GET | [`/web/invites/all_requests`](#api-116) | List all requests |
| GET | [`/web/list_likes_received`](#api-126) | Web list likes received |
| GET | [`/V1/users/test_profile_list`](#api-191) | Test profile list |

<a id="api-005"></a>

#### `GET /V1/invites/all_requests` — List all requests

**List all requests.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/invites_controller.rb; config/routes.rb#L58`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/invites/all_requests" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `invites` (seen on staging 2026-10-25)
- `total_invites` (seen on staging 2026-10-25)
- `totalPages` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `refresh_duration` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `list_all_requests`
2. `list_all_invitations`
3. `create_response`
4. `get_multiple_cache_data` — Loads many cached profile cards for a list.
5. `hydrate_first_names!` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.
6. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

_Code path — Phone_

1. `list_all_requests`
2. `list_all_invitations`
3. `is_test_user?`
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: GET /V1/invites/all_requests → 200 for a freshly onboarded synthetic account (male set), before and >60 s after submit.

**What changed**

- 2026-10-25 — Response field added: `refresh_duration` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `totalPages` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `total_invites` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `invites` · seen on staging 2026-10-25

<a id="api-006"></a>

#### `GET /V1/invites/list_comments_with_pagination` — List comments with pagination

**List comments with pagination.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/invites_controller.rb; config/routes.rb#L59`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/invites/list_comments_with_pagination" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `invites` (seen on staging 2026-10-25)
- `comment_next_cursor` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `list_comments_with_pagination`
2. `list_all_comments`
3. `create_response`
4. `get_multiple_cache_data` — Loads many cached profile cards for a list.
5. `hydrate_first_names!` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.
6. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

_Code path — Phone_

1. `list_comments_with_pagination`
2. `list_all_comments`
3. `fetch_all_comments`
4. `is_test_user?`
5. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `comment_next_cursor` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `invites` · seen on staging 2026-10-25

<a id="api-007"></a>

#### `GET /V1/invites/list_comments_and_likes` — List comments and likes

**List comments and likes.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/invites_controller.rb; config/routes.rb#L60`

**Request**

Request fields: `page`, `items_per_page`, `opened_from_pn` (optional · from code — confirm with Dev), `sort_by` (optional · from code — confirm with Dev)

```bash
curl -i --request GET "https://testa2.aisle.co/V1/invites/list_comments_and_likes" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `invites` (seen on staging 2026-10-25)
- `comment_next_cursor` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `users` (seen on staging 2026-10-25)
- `nextCursor` (seen on staging 2026-10-25)
- `subscribed_likes_display_text` (seen on staging 2026-10-25)
- `no_likes_message` (seen on staging 2026-10-25)
- `no_of_tiles_to_display` (seen on staging 2026-10-25)
- `complete_profile_check` (seen on staging 2026-10-25)
- `can_see_profile` (seen on staging 2026-10-25)
- `is_default_payment_concierge` (seen on staging 2026-10-25)
- `show_my_type_button` (seen on staging 2026-10-25)
- `sparks` (seen on staging 2026-10-25)
- `previously_recevied_spark` (seen on staging 2026-10-25)
- `show_popup` (seen on staging 2026-10-25)
- `popup` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `list_comments_and_likes`
2. `list_all_comments`
3. `create_response`
4. `get_multiple_cache_data` — Loads many cached profile cards for a list.
5. `hydrate_first_names!` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.
6. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

_Code path — Phone_

1. `list_comments_and_likes`
2. `list_all_comments`
3. `fetch_all_comments`
4. `is_test_user?`
5. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Request field added: `sort_by` · from code — confirm with Dev · `app/controllers/v1/invites_controller.rb:112 @004e72c`
- 2026-10-29 — Request field added: `opened_from_pn` · from code — confirm with Dev · `app/controllers/v1/invites_controller.rb:119 @004e72c`
- 2026-10-25 — Response field added: `popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `previously_recevied_spark` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `sparks` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_my_type_button` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_default_payment_concierge` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_see_profile` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `complete_profile_check` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `no_of_tiles_to_display` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `no_likes_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `subscribed_likes_display_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `nextCursor` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `users` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `comment_next_cursor` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `invites` · seen on staging 2026-10-25

<a id="api-008"></a>

#### `GET /V1/invites/list_request_and_likes` — List request and likes

**List request and likes.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/invites_controller.rb; config/routes.rb#L61`

**Request**

Request fields: `page`, `items_per_page`, `opened_from_pn` (optional · from code — confirm with Dev), `sort_by` (optional · from code — confirm with Dev)

```bash
curl -i --request GET "https://testa2.aisle.co/V1/invites/list_request_and_likes" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `invites` (seen on staging 2026-10-25)
- `total_invites` (seen on staging 2026-10-25)
- `totalPages` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `refresh_duration` (seen on staging 2026-10-25)
- `users` (seen on staging 2026-10-25)
- `nextCursor` (seen on staging 2026-10-25)
- `subscribed_likes_display_text` (seen on staging 2026-10-25)
- `no_likes_message` (seen on staging 2026-10-25)
- `no_of_tiles_to_display` (seen on staging 2026-10-25)
- `complete_profile_check` (seen on staging 2026-10-25)
- `can_see_profile` (seen on staging 2026-10-25)
- `is_default_payment_concierge` (seen on staging 2026-10-25)
- `show_my_type_button` (seen on staging 2026-10-25)
- `show_popup` (seen on staging 2026-10-25)
- `popup` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `list_request_and_likes`
2. `list_all_invitations`
3. `create_response`
4. `get_multiple_cache_data` — Loads many cached profile cards for a list.
5. `hydrate_first_names!` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.
6. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

_Code path — Phone_

1. `list_request_and_likes`
2. `list_all_invitations`
3. `is_test_user?`
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Request field added: `sort_by` · from code — confirm with Dev · `app/controllers/v1/invites_controller.rb:55 @004e72c`
- 2026-10-29 — Request field added: `opened_from_pn` · from code — confirm with Dev · `app/controllers/v1/invites_controller.rb:62 @004e72c`
- 2026-10-25 — Response field added: `popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_my_type_button` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_default_payment_concierge` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_see_profile` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `complete_profile_check` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `no_of_tiles_to_display` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `no_likes_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `subscribed_likes_display_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `nextCursor` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `users` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `refresh_duration` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `totalPages` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `total_invites` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `invites` · seen on staging 2026-10-25

<a id="api-014"></a>

#### `GET /V1/users/matches_list_v2` — Matches list v2

**Matches list v2.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L71`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/users/matches_list_v2" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `users_list` (seen on staging 2026-10-25)
- `suggestion_state` (seen on staging 2026-10-25)
- `show_foryou_tab` (seen on staging 2026-10-25)
- `suggestions_source` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `matches_list_v2`
2. `select_algorithm_for_discover_profile_list`
3. `fetch_discover_profile_list`
4. `create_home_page_response_v2`
5. `get_multiple_cache_data` — Loads many cached profile cards for a list.
6. `hydrate_first_names!` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.
7. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: GET /V1/users/matches_list_v2 → 200 for a freshly onboarded synthetic account (male set), before and >60 s after submit.

**What changed**

- 2026-10-25 — Response field added: `suggestions_source` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_foryou_tab` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `suggestion_state` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `users_list` · seen on staging 2026-10-25

<a id="api-015"></a>

#### `POST /V1/users/matches_list_v3` — Matches list v2

**Matches list v2.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L72`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/matches_list_v3" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "page": 1,
  "items_per_page": 10
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `users_list` (seen on staging 2026-10-25)
- `suggestion_state` (seen on staging 2026-10-25)
- `show_foryou_tab` (seen on staging 2026-10-25)
- `suggestions_source` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `matches_list_v2`
2. `select_algorithm_for_discover_profile_list`
3. `fetch_discover_profile_list`
4. `create_home_page_response_v2`
5. `get_multiple_cache_data` — Loads many cached profile cards for a list.
6. `hydrate_first_names!` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.
7. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** POST alias of the matches_list_v2 action.

**What changed**

- 2026-10-25 — Response field added: `suggestions_source` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_foryou_tab` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `suggestion_state` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `users_list` · seen on staging 2026-10-25

<a id="api-019"></a>

#### `GET /V1/users/fetch_concierge_list` — Fetch concierge list

**Fetch concierge list.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L77`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/users/fetch_concierge_list" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `users` (seen on staging 2026-10-25)
- `next_page` (seen on staging 2026-10-25)
- `nextCursor` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)
- `constant_messages` (seen on staging 2026-10-25)
- `banners_v2` (seen on staging 2026-10-25)
- `live_list` (seen on staging 2026-10-25)
- `total_profile_count` (seen on staging 2026-10-25)
- `search_filter` (seen on staging 2026-10-25)
- `can_enter_profile` (seen on staging 2026-10-25)
- `show_payment_box` (seen on staging 2026-10-25)
- `has_concierge_subscription` (seen on staging 2026-10-25)
- `box_message` (seen on staging 2026-10-25)
- `know_more_message` (seen on staging 2026-10-25)
- `know_more_message_2` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `fetch_concierge_list`
2. `fetch_concierge_profile_list`
3. `is_partial?`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `know_more_message_2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `know_more_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `box_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_concierge_subscription` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_payment_box` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_enter_profile` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `search_filter` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `total_profile_count` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `live_list` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `banners_v2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `constant_messages` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `own_info` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `nextCursor` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `next_page` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `users` · seen on staging 2026-10-25

<a id="api-020"></a>

#### `GET /V1/users/fetch_top_matched_profiles` — Fetch top matched profiles

**Fetch top matched profiles.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L78`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/users/fetch_top_matched_profiles" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `users` (seen on staging 2026-10-25)
- `next_refresh_time` (seen on staging 2026-10-25)
- `daily_requests_left` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `fetch_top_matched_profiles`
2. `fetch_top_matched_profiles`
3. `fetch_profiles_list`
4. `create_top_matches_response`
5. `get_multiple_cache_data` — Loads many cached profile cards for a list.
6. `hydrate_first_names!` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.
7. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `daily_requests_left` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `next_refresh_time` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `users` · seen on staging 2026-10-25

<a id="api-047"></a>

#### `GET /V1/list_request_sent` — List request sent

**List request sent.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L133`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/list_request_sent" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `users` (seen on staging 2026-10-25)
- `nextCursor_1` (seen on staging 2026-10-25)
- `nextCursor_2` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `list_request_sent`
2. `fetch_activity_list`
3. `fetch_own_info`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `own_info` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `nextCursor_2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `nextCursor_1` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `users` · seen on staging 2026-10-25

<a id="api-048"></a>

#### `GET /V1/list_likes_received_v1` — List likes received v1

**List likes received v1.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L134`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/list_likes_received_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `users` (seen on staging 2026-10-25)
- `nextCursor` (seen on staging 2026-10-25)
- `subscribed_likes_display_text` (seen on staging 2026-10-25)
- `no_likes_message` (seen on staging 2026-10-25)
- `no_of_tiles_to_display` (seen on staging 2026-10-25)
- `complete_profile_check` (seen on staging 2026-10-25)
- `can_see_profile` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `is_default_payment_concierge` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `UserLike.list_likes_received_v2`
2. `create_likes_received_api_response`
3. `profile cache name hydration`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `is_default_payment_concierge` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_see_profile` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `complete_profile_check` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `no_of_tiles_to_display` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `no_likes_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `subscribed_likes_display_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `nextCursor` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `users` · seen on staging 2026-10-25

<a id="api-049"></a>

#### `GET /V1/list_all_passed` — List all passed

**List all passed.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L135`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/list_all_passed" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `users` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `list_all_passed`
2. `list_passed_profiles`
3. `fetch_own_info`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `own_info` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `users` · seen on staging 2026-10-25

<a id="api-054"></a>

#### `POST /V1/like_received` — List likes and requests received

**List likes and requests received.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read (POST) · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L141`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/like_received" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "page": 1,
  "items_per_page": 10
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `users` (seen on staging 2026-10-25)
- `nextCursor_1` (seen on staging 2026-10-25)
- `nextCursor_2` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)
- `refresh_duration` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `list_likes_and_requests_received`
2. `fetch_likes_and_requests_recieved`
3. `fetch_own_info`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `refresh_duration` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `own_info` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `nextCursor_2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `nextCursor_1` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `users` · seen on staging 2026-10-25

<a id="api-063"></a>

#### `GET /V1/list_connected_profiles` — List connected profiles

**List connected profiles.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), Free text (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/messages_controller.rb; config/routes.rb#L173`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/list_connected_profiles" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `user_id` (seen on staging 2026-10-25)
- `conversations` (seen on staging 2026-10-25)
- `total_connections_count` (seen on staging 2026-10-25)
- `refresh_duration` (seen on staging 2026-10-25)
- `feedback_intro_popup` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `list_connected_profiles`
2. `all_active_conversations_v1`
3. `fetch_cached_conversations` — Rebuilds or reads the chat conversation cache.
4. `create_cached_response` — Rebuilds or reads the chat conversation cache.
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Phone_

1. `list_connected_profiles`
2. `all_active_conversations_v1`
3. `is_test_user?`
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

_Free-text encryption — Free text_

1. `Request with free text` — Free-text encryption (Dev free-text API list (2026-10-23)): Connection list (returns chat free text)
2. `PII service — free-text key` — Aisle creates or fetches an AES-256-GCM key; the text itself never goes to the PII service.
3. `Aisle encrypts / decrypts the text` — The encrypted text and its key_id are kept in the app database.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |
| Free text | `—` | Encrypted by Aisle with a key from the PII service; there is no read switch. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| PII database | `free_text_encryption_key` | read |
| App database | `encrypted text + key_id` | reads |
| Cache | `Conversation cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Phone impact is the is_test_user? branch; phone is not added to other members' response fields.
- **Observed on staging:** Observed 2026-10-23: no token → 401 {unauthorized_request}; a freshly onboarded synthetic account (male set) → 200 before and >60 s after submit.

**What changed**

- 2026-10-25 — Response field added: `feedback_intro_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `refresh_duration` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `total_connections_count` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `conversations` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user_id` · seen on staging 2026-10-25

<a id="api-068"></a>

#### `GET /V1/combined_messages_hidden_list` — Combined messages hidden list

**Combined messages hidden list.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/messages_controller.rb; config/routes.rb#L184`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/combined_messages_hidden_list" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `user_id` (seen on staging 2026-10-25)
- `conversations` (seen on staging 2026-10-25)
- `hidden_linked_users` (seen on staging 2026-10-25)
- `feedback_intro_popup` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `combined_messages_hidden_list`
2. `all_active_conversations`
3. `fetch_cached_conversations` — Rebuilds or reads the chat conversation cache.
4. `create_cached_response` — Rebuilds or reads the chat conversation cache.
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Phone_

1. `combined_messages_hidden_list`
2. `all_active_conversations`
3. `is_test_user?`
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Conversation cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Phone impact is the is_test_user? branch; phone is not added to other members' response fields.

**What changed**

- 2026-10-25 — Response field added: `feedback_intro_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `hidden_linked_users` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `conversations` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user_id` · seen on staging 2026-10-25

<a id="api-069"></a>

#### `POST /V1/chat/chat_messages` — Chat messages

**Chat messages.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Free text (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read (POST) · **Code** `app/controllers/v1/messages_controller.rb; config/routes.rb#L188`

**Request**

Request fields: `conversation_id`, `page`, `created_at`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/chat/chat_messages" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "conversation_id": "$CONVERSATION_ID",
  "page": 1,
  "created_at": "2026-10-16T00:00:00Z"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `chat_messages`
2. `fetch_chat_messages`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Free-text encryption — Free text_

1. `Request with free text` — Free-text encryption (Dev free-text API list (2026-10-23)): Conversation messages (returns chat free text)
2. `PII service — free-text key` — Aisle creates or fetches an AES-256-GCM key; the text itself never goes to the PII service.
3. `Aisle encrypts / decrypts the text` — The encrypted text and its key_id are kept in the app database.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Free text | `—` | Encrypted by Aisle with a key from the PII service; there is no read switch. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `free_text_encryption_key` | read |
| App database | `encrypted text + key_id` | reads |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: no token → 401 {unauthorized_request}.

<a id="api-101"></a>

#### `GET /V1/speed_dating/event_info` — Event info

**Event info.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/speed_dating_controller.rb; config/routes.rb#L302`

**Request**

Request fields: `event_id`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/speed_dating/event_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "event_id=$EVENT_ID"
```

**End-to-end flow**

_Code path — First name_

1. `event_info`
2. `fetch_event_info`
3. `fetch_user_list`
4. `get_cache_from_ref`
5. `create_cache_response` — Rebuilds or reads the cached profile response.
6. `hydrate_first_name!` — Fills the first name into a cached profile response.
7. `get_first_name_for_user` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-106"></a>

#### `GET /V1/advertisement/profiles_voted` — Profiles voted

**Profiles voted.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/advertisement_controller.rb; config/routes.rb#L310`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/advertisement/profiles_voted" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `profiles` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `profiles_voted`
2. `fetch_own_info`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `own_info` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profiles` · seen on staging 2026-10-25

<a id="api-107"></a>

#### `GET /V1/live_audio` — Live audio

**Live audio.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/live_audio_controller.rb; config/routes.rb#L312`

**Request**

Request fields: `page`, `app_launch`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/live_audio" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "app_launch=false"
```

**Response fields** (top level; type not stated unless shown)

- `live_list` (seen on staging 2026-10-25)
- `live_list_v1` (seen on staging 2026-10-25)
- `room_settings` (seen on staging 2026-10-25)
- `agora_data` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `index`
2. `fetch_all_live_audios`
3. `fill_room_cache!` — Rebuilds the live-audio room cache.
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Live-audio room cache` | rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `agora_data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `room_settings` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `live_list_v1` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `live_list` · seen on staging 2026-10-25

<a id="api-116"></a>

#### `GET /web/invites/all_requests` — List all requests

**List all requests.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/web/invites_controller.rb; config/routes.rb#L343`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/web/invites/all_requests" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `invites` (seen on staging 2026-10-25)
- `total_invites` (seen on staging 2026-10-25)
- `totalPages` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `refresh_duration` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `list_all_requests`
2. `list_all_invitations`
3. `create_response`
4. `get_multiple_cache_data` — Loads many cached profile cards for a list.
5. `hydrate_first_names!` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.
6. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

_Code path — Phone_

1. `list_all_requests`
2. `list_all_invitations`
3. `is_test_user?`
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `refresh_duration` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `totalPages` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `total_invites` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `invites` · seen on staging 2026-10-25

<a id="api-126"></a>

#### `GET /web/list_likes_received` — Web list likes received

**Web list likes received.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/web/like_controller.rb; config/routes.rb#L359`

**Request**

Request fields: `page`, `items_per_page`

```bash
curl -i --request GET "https://testa2.aisle.co/web/list_likes_received" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

**Response fields** (top level; type not stated unless shown)

- `users` (seen on staging 2026-10-25)
- `nextCursor` (seen on staging 2026-10-25)
- `subscribed_likes_display_text` (seen on staging 2026-10-25)
- `no_likes_message` (seen on staging 2026-10-25)
- `no_of_tiles_to_display` (seen on staging 2026-10-25)
- `complete_profile_check` (seen on staging 2026-10-25)
- `can_see_profile` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `is_default_payment_concierge` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `UserLike.list_likes_received_v2`
2. `create_likes_received_api_response`
3. `profile cache name hydration`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `is_default_payment_concierge` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_see_profile` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `complete_profile_check` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `no_of_tiles_to_display` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `no_likes_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `subscribed_likes_display_text` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `nextCursor` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `users` · seen on staging 2026-10-25

<a id="api-191"></a>

#### `GET /V1/users/test_profile_list` — Test profile list

**Test profile list.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L16`

**Request**

Request fields: none

```bash
curl -i --request GET "https://testa2.aisle.co/V1/users/test_profile_list" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json"
```

**Response fields** (top level; type not stated unless shown)

- `invites` (seen on staging 2026-10-25)
- `likes` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `TestApi invites/likes profile cache hydration`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `likes` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `invites` · seen on staging 2026-10-25

<a id="area-g5"></a>

### Interactions, chat & live audio

Likes, invites, accept / pass, reports, messages, calls and live audio. 30 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| POST | [`/V1/invites/send_request_to_profile`](#api-004) | Send request to profile |
| POST | [`/V1/invites/accept_request`](#api-009) | Accept request |
| POST | [`/V1/invites/pass_request`](#api-010) | Pass request |
| POST | [`/V1/like`](#api-046) | Like |
| POST | [`/V1/pass_user`](#api-050) | Pass user |
| POST | [`/V1/like_back`](#api-051) | Like back |
| POST | [`/V1/like_without_deduction`](#api-052) | Like without deduction |
| POST | [`/V1/like_sent`](#api-053) | Send request or like |
| POST | [`/V1/like_accept`](#api-055) | Accept request or like |
| POST | [`/V1/like_passed`](#api-056) | Pass request or like |
| POST | [`/V1/connect_linked_users`](#api-064) | Connect linked users |
| POST | [`/V1/messages/generate_agora_token`](#api-065) | Generate agora token |
| POST | [`/V1/messages/unlock_video_call`](#api-066) | Unlock video call |
| GET | [`/V1/messages/can_video_call`](#api-067) | Can video call |
| POST | [`/V1/report`](#api-098) | Report |
| POST | [`/V1/speed_dating/give_feedback`](#api-103) | Give feedback |
| POST | [`/V1/live_audio/go_live`](#api-108) | Go live |
| POST | [`/V1/live_audio/join_room`](#api-109) | Join room |
| POST | [`/V1/live_audio/send_request_to_talk`](#api-110) | Send request to talk |
| POST | [`/V1/live_audio/switch_speaker`](#api-111) | Switch speaker |
| POST | [`/V1/live_audio/leave_room`](#api-112) | Leave room |
| POST | [`/web/invites/accept_request_v1`](#api-117) | Accept request v1 |
| POST | [`/web/invites/pass_request`](#api-118) | Pass request |
| POST | [`/web/like`](#api-125) | Web like |
| POST | [`/web/pass_user`](#api-127) | Pass user |
| POST | [`/web/like_back`](#api-128) | Like back |
| POST | [`/web/connect_linked_users`](#api-132) | Connect linked users |
| POST | [`/web/report`](#api-135) | Web report |
| POST | [`/V1/messages/send`](#api-187) | Messages send |
| POST | [`/web/messages/send`](#api-188) | Messages send |

<a id="api-004"></a>

#### `POST /V1/invites/send_request_to_profile` — Send request to profile

**Send request to profile.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/invites_controller.rb; config/routes.rb#L57`

**Request**

Request fields: `ref`, `invitation_type`, `reply_message`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/invites/send_request_to_profile" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "invitation_type": "story",
  "reply_message": "Hello from the synthetic PII test."
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `send_request_to_profile`
2. `send_request`
3. `send_request_notification`
4. `send_request_push_notification!`
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-009"></a>

#### `POST /V1/invites/accept_request` — Accept request

**Accept request.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/invites_controller.rb; config/routes.rb#L62`

**Request**

Request fields: `id`, `invitation_type`, `message`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/invites/accept_request" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "id": "$REQUEST_ID",
  "invitation_type": "story",
  "message": "Hello"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `conversation_id` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `accept_request`
2. `accept_request`
3. `send_connection_push`
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `conversation_id` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-010"></a>

#### `POST /V1/invites/pass_request` — Pass request

**Pass request.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/invites_controller.rb; config/routes.rb#L63`

**Request**

Request fields: `id`, `invitation_type`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/invites/pass_request" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "id": "$REQUEST_ID",
  "invitation_type": "story"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `pass_request`
2. `pass_request`
3. `assign_negative_reaction`
4. `increment_negative_interaction!`
5. `assign_official_rating!`
6. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
7. `create_profile_response` — Rebuilds or reads the cached profile response.
8. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
9. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-046"></a>

#### `POST /V1/like` — Like

**Like.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L132`

**Request**

Request fields: `ref`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/like" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `create`
2. `like_user`
3. `like_user_back!`
4. `create_like_entry`
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-050"></a>

#### `POST /V1/pass_user` — Pass user

**Pass user.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L136`

**Request**

Request fields: `ref`, `tab_name`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/pass_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `pass_user`
2. `pass_user`
3. `assign_negative_reaction`
4. `increment_negative_interaction!`
5. `assign_official_rating!`
6. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
7. `create_profile_response` — Rebuilds or reads the cached profile response.
8. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
9. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-051"></a>

#### `POST /V1/like_back` — Like back

**Like back.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L137`

**Request**

Request fields: `ref`, `tab_name`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/like_back" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `like_back`
2. `like_user`
3. `like_user_back!`
4. `create_like_entry`
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-052"></a>

#### `POST /V1/like_without_deduction` — Like without deduction

**Like without deduction.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L138`

**Request**

Request fields: `ref`, `tab_name`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/like_without_deduction" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `like_without_deduction`
2. `like_user`
3. `like_user_back!`
4. `create_like_entry`
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-053"></a>

#### `POST /V1/like_sent` — Send request or like

**Send request or like.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L140`

**Request**

Request fields: `ref`, `tab_name`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/like_sent" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `send_request_or_like`
2. `send_request_or_like`
3. `like_user`
4. `like_user_back!`
5. `create_like_entry`
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-055"></a>

#### `POST /V1/like_accept` — Accept request or like

**Accept request or like.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L142`

**Request**

Request fields: `ref`, `tab_name`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/like_accept" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `accept_request_or_like`
2. `accept_request_or_like`
3. `accept_request`
4. `send_connection_push`
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-056"></a>

#### `POST /V1/like_passed` — Pass request or like

**Pass request or like.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L143`

**Request**

Request fields: `ref`, `tab_name`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/like_passed" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "likes"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `pass_request_or_like`
2. `pass_request_or_like`
3. `pass_user`
4. `assign_negative_reaction`
5. `increment_negative_interaction!`
6. `assign_official_rating!`
7. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
8. `create_profile_response` — Rebuilds or reads the cached profile response.
9. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
10. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-064"></a>

#### `POST /V1/connect_linked_users` — Connect linked users

**Connect linked users.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/messages_controller.rb; config/routes.rb#L176`

**Request**

Request fields: `ref`, `conversation_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/connect_linked_users" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "conversation_id": "$CONVERSATION_ID"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `conversation_id` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `connect_linked_users`
2. `convert_to_full_connection`
3. `fill_conversation_cache!` — Rebuilds or reads the chat conversation cache.
4. `create_cached_response` — Rebuilds or reads the chat conversation cache.
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Conversation cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `conversation_id` · seen on staging 2026-10-25

<a id="api-065"></a>

#### `POST /V1/messages/generate_agora_token` — Generate agora token

**Generate agora token.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/messages_controller.rb; config/routes.rb#L177`

**Request**

Request fields: `ref`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/messages/generate_agora_token" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `generate_agora_token`
2. `send_request`
3. `fill_conversation_cache!` — Rebuilds or reads the chat conversation cache.
4. `create_cached_response` — Rebuilds or reads the chat conversation cache.
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Conversation cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-066"></a>

#### `POST /V1/messages/unlock_video_call` — Unlock video call

**Unlock video call.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/messages_controller.rb; config/routes.rb#L181`

**Request**

Request fields: `conversation_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/messages/unlock_video_call" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "conversation_id": "$CONVERSATION_ID"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `can_call` (seen on staging 2026-10-25)
- `video_call_message` (seen on staging 2026-10-25)
- `call_enabled` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `unlock_video_call`
2. `can_video_call?`
3. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `call_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `video_call_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_call` · seen on staging 2026-10-25

<a id="api-067"></a>

#### `GET /V1/messages/can_video_call` — Can video call

**Can video call.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/messages_controller.rb; config/routes.rb#L183`

**Request**

Request fields: `conversation_id`

```bash
curl -i --request GET "https://testa2.aisle.co/V1/messages/can_video_call" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "conversation_id=$CONVERSATION_ID"
```

**Response fields** (top level; type not stated unless shown)

- `can_call` (seen on staging 2026-10-25)
- `video_call_message` (seen on staging 2026-10-25)
- `call_enabled` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `can_video_call`
2. `can_video_call?`
3. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `call_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `video_call_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_call` · seen on staging 2026-10-25

<a id="api-098"></a>

#### `POST /V1/report` — Report

**Report.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/report_controller.rb; config/routes.rb#L296`

**Request**

Request fields: `ref`, `report_option_id`, `message`, `tab_name`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/report" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "report_option_id": "$REPORT_OPTION_ID",
  "message": "Synthetic moderation report",
  "tab_name": "discover"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `create`
2. `report_user`
3. `add_entry`
4. `accept_like_or_invite`
5. `accept_request`
6. `send_connection_push`
7. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/report_controller.rb:7 @004e72c`

<a id="api-103"></a>

#### `POST /V1/speed_dating/give_feedback` — Give feedback

**Give feedback.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/speed_dating_controller.rb; config/routes.rb#L304`

**Request**

Request fields: `event_id`, `feedback_list`, `ref`, `option`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/speed_dating/give_feedback" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "event_id": "$EVENT_ID",
  "feedback_list": [
    {
      "ref": "$OTHER_REF",
      "option": "like"
    }
  ]
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `give_feedback`
2. `add_feedback`
3. `connect_users!`
4. `fill_conversation_cache!` — Rebuilds or reads the chat conversation cache.
5. `create_cached_response` — Rebuilds or reads the chat conversation cache.
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Phone_

1. `give_feedback`
2. `add_feedback`
3. `connect_users!`
4. `fetch_mobile_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Conversation cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Requires a completed event and booked participants. Mutual likes create a connection and messages containing the PII-derived full phone numbers.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/speed_dating_controller.rb:22 @004e72c`

<a id="api-108"></a>

#### `POST /V1/live_audio/go_live` — Go live

**Go live.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/live_audio_controller.rb; config/routes.rb#L313`

**Request**

Request fields: `always_online_enable`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/live_audio/go_live" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "always_online_enable": false
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `go_live`
2. `go_live`
3. `trigger_room_owner_online_update`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-109"></a>

#### `POST /V1/live_audio/join_room` — Join room

**Join room.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/live_audio_controller.rb; config/routes.rb#L314`

**Request**

Request fields: `room_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/live_audio/join_room" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "room_id": "$ROOM_ID"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `join_room`
2. `join_room`
3. `fetch_current_speaker_info`
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-110"></a>

#### `POST /V1/live_audio/send_request_to_talk` — Send request to talk

**Send request to talk.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/live_audio_controller.rb; config/routes.rb#L315`

**Request**

Request fields: `room_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/live_audio/send_request_to_talk" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "room_id": "$ROOM_ID"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `send_request_to_talk`
2. `send_request_to_talk`
3. `fill_room_cache!` — Rebuilds the live-audio room cache.
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Live-audio room cache` | rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-111"></a>

#### `POST /V1/live_audio/switch_speaker` — Switch speaker

**Switch speaker.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/live_audio_controller.rb; config/routes.rb#L316`

**Request**

Request fields: `room_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/live_audio/switch_speaker" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "room_id": "$ROOM_ID"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `switch_speaker`
2. `pass_speaker`
3. `create_speaker_passed_message`
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/live_audio_controller.rb:50 @004e72c`

<a id="api-112"></a>

#### `POST /V1/live_audio/leave_room` — Leave room

**Leave room.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/live_audio_controller.rb; config/routes.rb#L317`

**Request**

Request fields: `room_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/live_audio/leave_room" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "room_id": "$ROOM_ID"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `leave_room`
2. `leave_room`
3. `create_speaker_left_room_message`
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-117"></a>

#### `POST /web/invites/accept_request_v1` — Accept request v1

**Accept request v1.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/web/invites_controller.rb; config/routes.rb#L344`

**Request**

Request fields: `id`, `invitation_type`, `message`

```bash
curl -i --request POST "https://testa2.aisle.co/web/invites/accept_request_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "id": "$REQUEST_ID",
  "invitation_type": "story",
  "message": "Hello"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `accept_request_v1`
2. `accept_request`
3. `send_connection_push`
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-118"></a>

#### `POST /web/invites/pass_request` — Pass request

**Pass request.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/web/invites_controller.rb; config/routes.rb#L345`

**Request**

Request fields: `id`, `invitation_type`

```bash
curl -i --request POST "https://testa2.aisle.co/web/invites/pass_request" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "id": "$REQUEST_ID",
  "invitation_type": "story"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `pass_request`
2. `pass_request`
3. `assign_negative_reaction`
4. `increment_negative_interaction!`
5. `assign_official_rating!`
6. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
7. `create_profile_response` — Rebuilds or reads the cached profile response.
8. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
9. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-125"></a>

#### `POST /web/like` — Web like

**Web like.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/web/like_controller.rb; config/routes.rb#L358`

**Request**

Request fields: `ref`

```bash
curl -i --request POST "https://testa2.aisle.co/web/like" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `create`
2. `like_user`
3. `like_user_back!`
4. `create_like_entry`
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-127"></a>

#### `POST /web/pass_user` — Pass user

**Pass user.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/web/like_controller.rb; config/routes.rb#L360`

**Request**

Request fields: `ref`, `tab_name`

```bash
curl -i --request POST "https://testa2.aisle.co/web/pass_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `pass_user`
2. `pass_user`
3. `assign_negative_reaction`
4. `increment_negative_interaction!`
5. `assign_official_rating!`
6. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
7. `create_profile_response` — Rebuilds or reads the cached profile response.
8. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
9. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-128"></a>

#### `POST /web/like_back` — Like back

**Like back.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/web/like_controller.rb; config/routes.rb#L361`

**Request**

Request fields: `ref`, `tab_name`

```bash
curl -i --request POST "https://testa2.aisle.co/web/like_back" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `like_back`
2. `like_user`
3. `like_user_back!`
4. `create_like_entry`
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-132"></a>

#### `POST /web/connect_linked_users` — Connect linked users

**Connect linked users.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/web/messages_controller.rb; config/routes.rb#L377`

**Request**

Request fields: `ref`, `conversation_id`

```bash
curl -i --request POST "https://testa2.aisle.co/web/connect_linked_users" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "conversation_id": "$CONVERSATION_ID"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `conversation_id` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `connect_linked_users`
2. `convert_to_full_connection`
3. `fill_conversation_cache!` — Rebuilds or reads the chat conversation cache.
4. `create_cached_response` — Rebuilds or reads the chat conversation cache.
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Conversation cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `conversation_id` · seen on staging 2026-10-25

<a id="api-135"></a>

#### `POST /web/report` — Web report

**Web report.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/web/report_controller.rb; config/routes.rb#L397`

**Request**

Request fields: `ref`, `report_option_id`, `message`, `tab_name`

```bash
curl -i --request POST "https://testa2.aisle.co/web/report" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "report_option_id": "$REPORT_OPTION_ID",
  "message": "Synthetic moderation report",
  "tab_name": "discover"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `create`
2. `report_user`
3. `add_entry`
4. `accept_like_or_invite`
5. `accept_request`
6. `send_connection_push`
7. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/web/report_controller.rb:7 @004e72c`

<a id="api-187"></a>

#### `POST /V1/messages/send` — Messages send

**Messages send.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), Free text (writes), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/messages_controller.rb; config/routes.rb#L171`

**Request**

Request fields: `ref`, `text`, `previous_message`, `message_time_token`, `action_time_token`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/messages/send" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "text": "Synthetic PII test message",
  "previous_message": "",
  "message_time_token": "$MESSAGE_TIME_TOKEN",
  "action_time_token": "$ACTION_TIME_TOKEN"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `Chat::Conversation.send_message`
2. `ChatMessageWorker` — Background job: runs after the request has returned.
3. `Chat::Message callbacks and sender_name`

_Free-text encryption — Free text_

1. `Request with free text` — Free-text encryption (Dev free-text API list (2026-10-23)): encrypts text, previous_message — Chat message text and quoted previous message
2. `PII service — free-text key` — Aisle creates or fetches an AES-256-GCM key; the text itself never goes to the PII service.
3. `Aisle encrypts / decrypts the text` — The encrypted text and its key_id are kept in the app database.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Free text | `—` | Encrypted by Aisle with a key from the PII service; there is no read switch. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `free_text_encryption_key` | read / write |
| App database | `encrypted text + key_id` | writes |
| Background job | `ChatMessageWorker` | async |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Requires an existing active conversation. Message persistence runs on ChatMessageWorker; the sender name is used in downstream message/push payloads.
- **Observed on staging:** Observed 2026-10-23: no token → 401 {unauthorized_request}.
- **Known limitation:** Messages are saved by a background job (ChatMessageWorker), so a message can take a moment to appear.

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-188"></a>

#### `POST /web/messages/send` — Messages send

**Messages send.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/web/messages_controller.rb; config/routes.rb#L372`

**Request**

Request fields: `ref`, `text`

```bash
curl -i --request POST "https://testa2.aisle.co/web/messages/send" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "text": "Synthetic PII test message"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `Chat::Conversation.send_message`
2. `ChatMessageWorker` — Background job: runs after the request has returned.
3. `Chat::Message callbacks and sender_name`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Background job | `ChatMessageWorker` | async |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Requires an existing active conversation.

<a id="area-g6"></a>

### Profile updates

Update part of your own profile and return or re-cache it. 39 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| POST | [`/V1/users/about`](#api-022) | Users about |
| POST | [`/V1/users/add_meetup`](#api-023) | Add meetup |
| POST | [`/V1/users/update_interests`](#api-024) | Update interests |
| POST | [`/V1/users/update_interests_v2`](#api-025) | Update interests v2 |
| POST | [`/V1/users/update_traits`](#api-026) | Update traits |
| POST | [`/V1/users/mail_subscription`](#api-027) | Mail subscription |
| POST | [`/V1/users/sms_subscription`](#api-028) | Sms subscription |
| POST | [`/V1/users/deactivate_user`](#api-029) | Deactivate user |
| POST | [`/V1/users/activate_user`](#api-030) | Activate user |
| POST | [`/V1/users/verify_selfie_v1`](#api-031) | Verify selfie v1 |
| POST | [`/V1/users/toggle_profile_sharing`](#api-033) | Toggle profile sharing |
| POST | [`/V1/users/toggle_profile_incognito`](#api-034) | Toggle profile incognito |
| POST | [`/V1/users/toogle_concierge_badge_display`](#api-035) | Toggle concierge badge display |
| POST | [`/V1/users/update_settle_info`](#api-036) | Update settle info |
| POST | [`/V1/users/update_relationship_goal_info`](#api-037) | Update relationship goal info |
| POST | [`/V1/users/update_philosophy_info`](#api-038) | Update philosophy info |
| POST | [`/V1/users/update_mbti_info`](#api-039) | Update mbti info data |
| POST | [`/V1/users/update_audio_prompt`](#api-040) | Update audio prompt |
| POST | [`/V1/users/save_auto_pop_up_info`](#api-041) | Save auto pop up info |
| POST | [`/V1/users/user_name`](#api-042) | Set public user name |
| POST | [`/V1/users/public_profile`](#api-043) | Set profile public |
| POST | [`/V1/setting/update_preferences`](#api-044) | Update preferences |
| POST | [`/V1/setting/reset_preferences`](#api-045) | Reset preferences |
| POST | [`/V1/user/location`](#api-085) | Update location coordinates |
| POST | [`/V1/user/app_launch`](#api-089) | App launch |
| POST | [`/V1/images/upload_images_v2`](#api-090) | Upload images v2 |
| POST | [`/V1/images/edit_images`](#api-091) | Edit images |
| POST | [`/V1/subscription/boost_profile`](#api-097) | Boost profile |
| POST | [`/V1/introduction/edit_icebreaker`](#api-099) | Edit icebreaker |
| POST | [`/V1/introduction/edit_icebreaker_v1`](#api-100) | Edit icebreaker v1 |
| POST | [`/V1/advertisement/vote`](#api-105) | Advertisement vote |
| POST | [`/web/users/about`](#api-121) | Users about |
| POST | [`/web/users/update_settings`](#api-122) | Update settings |
| POST | [`/web/users/deactivate_user`](#api-123) | Deactivate user |
| POST | [`/web/users/activate_user`](#api-124) | Activate user |
| POST | [`/web/user/location`](#api-134) | Update location coordinates |
| POST | [`/V1/images/upload`](#code-030) | Create |
| POST | [`/V1/images/detect_face_in_image`](#code-031) | Detect face in image |
| POST | [`/V1/images/image_modifications`](#code-032) | Image modifications |

<a id="api-022"></a>

#### `POST /V1/users/about` — Users about

**Users about.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L84`

**Request**

Request fields: `about`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/about" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "about": "Synthetic profile story for PII regression testing."
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `about`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `about`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `about`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-023"></a>

#### `POST /V1/users/add_meetup` — Add meetup

**Add meetup.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L85`

**Request**

Request fields: `restaurant_id`, `restaurant_meal_type_id`, `day`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/add_meetup" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "restaurant_id": "$RESTAURANT_ID",
  "restaurant_meal_type_id": "$MEAL_TYPE_ID",
  "day": "Saturday"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `add_meetup`
2. `add`
3. `fill_cache!` — Rebuilds or reads the cached profile response.
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/users_controller.rb:295 @004e72c`

<a id="api-024"></a>

#### `POST /V1/users/update_interests` — Update interests

**Update interests.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L86`

**Request**

Request fields: `user_interests`, `interest_id`, `value`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/update_interests" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_interests": [
    {
      "interest_id": "$INTEREST_ID",
      "value": 1
    }
  ]
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_interests`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `update_interests`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `update_interests`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-025"></a>

#### `POST /V1/users/update_interests_v2` — Update interests v2

**Update interests v2.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L87`

**Request**

Request fields: `user_interests_v2`, `interest_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/update_interests_v2" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_interests_v2": [
    {
      "interest_id": "$INTEREST_V2_ID"
    }
  ]
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_interests_v2`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `update_interests_v2`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `update_interests_v2`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-026"></a>

#### `POST /V1/users/update_traits` — Update traits

**Update traits.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L88`

**Request**

Request fields: `user_traits`, `trait_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/update_traits" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_traits": [
    {
      "trait_id": "$TRAIT_ID"
    }
  ]
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_traits`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `update_traits`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `update_traits`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-027"></a>

#### `POST /V1/users/mail_subscription` — Mail subscription

**Mail subscription.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L89`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/mail_subscription" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `mail_subscription`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `mail_subscription`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `mail_subscription`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-028"></a>

#### `POST /V1/users/sms_subscription` — Sms subscription

**Sms subscription.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L90`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/sms_subscription" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `sms_subscription`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `sms_subscription`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `sms_subscription`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-029"></a>

#### `POST /V1/users/deactivate_user` — Deactivate user

**Deactivate user.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L91`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/deactivate_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `is_boost_available` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `deactivate_user`
2. `deactivate_profile`
3. `deactivated!`
4. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
5. `create_profile_response` — Rebuilds or reads the cached profile response.
6. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
7. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `is_boost_available` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-030"></a>

#### `POST /V1/users/activate_user` — Activate user

**Activate user.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L92`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/activate_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `is_boost_available` (seen on staging 2026-10-25)
- `profile_state` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `activate_user`
2. `activate_profile`
3. `pending!`
4. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
5. `create_profile_response` — Rebuilds or reads the cached profile response.
6. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
7. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `profile_state` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `is_boost_available` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-031"></a>

#### `POST /V1/users/verify_selfie_v1` — Verify selfie v1

**Verify selfie v1.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L93`

**Request**

Request fields: `selfie_url`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/verify_selfie_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "selfie_url": "$SELFIE_URL"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `is_backend_error` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `verify_selfie_v1`
2. `verify_user_selfie_based_on_app_version`
3. `fill_cache!` — Rebuilds or reads the cached profile response.
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Use a valid uploaded selfie and the current gesture. For a liveness flow, also supply the genuine liveness_response returned by the provider.

**What changed**

- 2026-10-29 — Response field added: `is_backend_error` · from code — confirm with Dev · `app/controllers/v1/users_controller.rb:250 @004e72c`

<a id="api-033"></a>

#### `POST /V1/users/toggle_profile_sharing` — Toggle profile sharing

**Toggle profile sharing.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L95`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/toggle_profile_sharing" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `toggle_profile_sharing`
2. `toggle_profile_sharing!`
3. `fill_cache!` — Rebuilds or reads the cached profile response.
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-034"></a>

#### `POST /V1/users/toggle_profile_incognito` — Toggle profile incognito

**Toggle profile incognito.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L96`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/toggle_profile_incognito" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `toggle_profile_incognito`
2. `toggle_profile_incognito!`
3. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-035"></a>

#### `POST /V1/users/toogle_concierge_badge_display` — Toggle concierge badge display

**Toggle concierge badge display.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L97`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/toogle_concierge_badge_display" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `toogle_concierge_badge_display`
2. `toogle_concierge_badge_display!`
3. `fill_cache!` — Rebuilds or reads the cached profile response.
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-036"></a>

#### `POST /V1/users/update_settle_info` — Update settle info

**Update settle info.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L101`

**Request**

Request fields: `settle_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/update_settle_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "settle_id": "$SETTLE_ID"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `user` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_settle_info`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `update_settle_info`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `update_settle_info`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-037"></a>

#### `POST /V1/users/update_relationship_goal_info` — Update relationship goal info

**Update relationship goal info.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L102`

**Request**

Request fields: `relationship_goal`, `id`, `optional_relationship_goal_message`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/update_relationship_goal_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "relationship_goal": {
    "id": "$RELATIONSHIP_GOAL_ID",
    "optional_relationship_goal_message": ""
  }
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `user` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_relationship_goal_info`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `update_relationship_goal_info`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `update_relationship_goal_info`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-038"></a>

#### `POST /V1/users/update_philosophy_info` — Update philosophy info

**Update philosophy info.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L103`

**Request**

Request fields: `preferences`, `id`, `value`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/update_philosophy_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "preferences": [
    {
      "id": "$PREFERENCE_ID",
      "value": 0
    }
  ]
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `user` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_philosophy_info`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `update_philosophy_info`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `update_philosophy_info`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-039"></a>

#### `POST /V1/users/update_mbti_info` — Update mbti info data

**Update mbti info data.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L104`

**Request**

Request fields: `mbti_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/update_mbti_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "mbti_id": "$MBTI_ID"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_mbti_info_data`
2. `update_profile_cache_by_mbti`
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-040"></a>

#### `POST /V1/users/update_audio_prompt` — Update audio prompt

**Update audio prompt.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L106`

**Request**

Request fields: `question_id`, `audio_url`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/update_audio_prompt" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "question_id": "$AUDIO_QUESTION_ID",
  "audio_url": "$AUDIO_URL"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `intro_questions` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_audio_prompt`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `update_audio_prompt`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `update_audio_prompt`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `intro_questions` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-041"></a>

#### `POST /V1/users/save_auto_pop_up_info` — Save auto pop up info

**Save auto pop up info.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L108`

**Request**

Request fields: `user_traits`, `trait_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/save_auto_pop_up_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_traits": [
    {
      "trait_id": "$TRAIT_ID"
    }
  ]
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `status` (seen on staging 2026-10-25)
- `has_settle` (seen on staging 2026-10-25)
- `has_traits` (seen on staging 2026-10-25)
- `has_philosophy` (seen on staging 2026-10-25)
- `has_interests` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `save_auto_pop_up_info`
2. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
3. `create_profile_response` — Rebuilds or reads the cached profile response.
4. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** This example exercises the traits branch; interests, work and philosophy are alternative popup branches.

**What changed**

- 2026-10-25 — Response field added: `has_interests` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_philosophy` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_traits` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_settle` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25

<a id="api-042"></a>

#### `POST /V1/users/user_name` — Set public user name

**Set public user name.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L113`

**Request**

Request fields: `user_name`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/user_name" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_name": "$PUBLIC_USER_NAME"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `set_public_user_name`
2. `set_user_name`
3. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-043"></a>

#### `POST /V1/users/public_profile` — Set profile public

**Set profile public.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L114`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/V1/users/public_profile" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)
- `link` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `set_profile_public`
2. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
3. `create_profile_response` — Rebuilds or reads the cached profile response.
4. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `link` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-044"></a>

#### `POST /V1/setting/update_preferences` — Update preferences

**Update preferences.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/setting_controller.rb; config/routes.rb#L128`

**Request**

Request fields: `age_from`, `age_to`, `allow_extended_age_range` (optional · from code — confirm with Dev), `allow_extended_distance_range` (optional · from code — confirm with Dev), `diet_ids` (optional · from code — confirm with Dev), `distance_limit` (optional · from code — confirm with Dev), `drinking` (optional · from code — confirm with Dev), `drinking_v1` (optional · from code — confirm with Dev), `drinking_v2` (optional · from code — confirm with Dev), `faith_ids` (optional · from code — confirm with Dev), `marital_statuses` (optional · from code — confirm with Dev), `marital_statuses_v1` (optional · from code — confirm with Dev), `max_height` (optional · from code — confirm with Dev), `mbti_list` (optional · from code — confirm with Dev), `min_height` (optional · from code — confirm with Dev), `mother_tongue_ids` (optional · from code — confirm with Dev), `smoking` (optional · from code — confirm with Dev), `smoking_v1` (optional · from code — confirm with Dev), `smoking_v2` (optional · from code — confirm with Dev), `work_experience` (optional · from code — confirm with Dev), `work_experience_v1` (optional · from code — confirm with Dev), `work_industry` (optional · from code — confirm with Dev), `work_industry_v1` (optional · from code — confirm with Dev), `work_qualification` (optional · from code — confirm with Dev), `work_qualification_v1` (optional · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/V1/setting/update_preferences" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "age_from": 25,
  "age_to": 35
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `settings` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_preferences`
2. `update_interested_faiths`
3. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Request field added: `work_qualification_v1` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:59 @004e72c`
- 2026-10-29 — Request field added: `work_qualification` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:56 @004e72c`
- 2026-10-29 — Request field added: `work_industry_v1` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:53 @004e72c`
- 2026-10-29 — Request field added: `work_industry` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:50 @004e72c`
- 2026-10-29 — Request field added: `work_experience_v1` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:65 @004e72c`
- 2026-10-29 — Request field added: `work_experience` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:62 @004e72c`
- 2026-10-29 — Request field added: `smoking_v2` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:38 @004e72c`
- 2026-10-29 — Request field added: `smoking_v1` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:35 @004e72c`
- 2026-10-29 — Request field added: `smoking` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:32 @004e72c`
- 2026-10-29 — Request field added: `mother_tongue_ids` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:20 @004e72c`
- 2026-10-29 — Request field added: `min_height` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:29 @004e72c`
- 2026-10-29 — Request field added: `mbti_list` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:68 @004e72c`
- 2026-10-29 — Request field added: `max_height` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:29 @004e72c`
- 2026-10-29 — Request field added: `marital_statuses_v1` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:26 @004e72c`
- 2026-10-29 — Request field added: `marital_statuses` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:23 @004e72c`
- 2026-10-29 — Request field added: `faith_ids` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:14 @004e72c`
- 2026-10-29 — Request field added: `drinking_v2` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:47 @004e72c`
- 2026-10-29 — Request field added: `drinking_v1` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:44 @004e72c`
- 2026-10-29 — Request field added: `drinking` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:41 @004e72c`
- 2026-10-29 — Request field added: `distance_limit` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:17 @004e72c`
- 2026-10-29 — Request field added: `diet_ids` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:85 @004e72c`
- 2026-10-29 — Request field added: `allow_extended_distance_range` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:76 @004e72c`
- 2026-10-29 — Request field added: `allow_extended_age_range` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:72 @004e72c`
- 2026-10-25 — Response field added: `settings` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-045"></a>

#### `POST /V1/setting/reset_preferences` — Reset preferences

**Reset preferences.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/setting_controller.rb; config/routes.rb#L129`

**Request**

Request fields: `only_reset` (optional · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/V1/setting/reset_preferences" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `reset_preferences`
2. `select_algorithm_for_discover_tab`
3. `fetch_discover_tab_tester_response`
4. `fetch_own_info`
5. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Request field added: `only_reset` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:106 @004e72c`

<a id="api-085"></a>

#### `POST /V1/user/location` — Update location coordinates

**Update location coordinates.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L272`

**Request**

Request fields: `latitude`, `longitude`, `is_location_spoofed`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/user/location" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "latitude": 12.9716,
  "longitude": 77.5946,
  "is_location_spoofed": false
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `refresh_profile_list` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_location_coordinates`
2. `update_location`
3. `update_residence_info`
4. `fill_cache!` — Rebuilds or reads the cached profile response.
5. `create_profile_response` — Rebuilds or reads the cached profile response.
6. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
7. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `refresh_profile_list` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-089"></a>

#### `POST /V1/user/app_launch` — App launch

**App launch.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/app_releases_controller.rb; config/routes.rb#L278`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/V1/user/app_launch" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `is_onboarding_phase_2` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `app_launch`
2. `record_app_launch_info`
3. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `app_launch`
2. `record_app_launch_info`
3. `update_last_seen_window`
4. `send_for_aws_moderation` — Content moderation and scammer check (only in some states).
5. `check_for_scammer_before_moderation!` — Content moderation and scammer check (only in some states).
6. `fetch_email_domain` — Reads the email domain for the scammer check during moderation.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: POST /V1/user/app_launch {} with a NEW (onboarding-stage) user’s token → 200.

**What changed**

- 2026-10-25 — Response field added: `is_onboarding_phase_2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-090"></a>

#### `POST /V1/images/upload_images_v2` — Upload images v2

**Upload images v2.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/images_controller.rb; config/routes.rb#L282`

**Request**

Request fields: `images`, `photo`, `photo_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/images/upload_images_v2" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "images": [
    {
      "photo": "$PHOTO_URL_1",
      "photo_id": "$PHOTO_ID_1"
    },
    {
      "photo": "$PHOTO_URL_2",
      "photo_id": "$PHOTO_ID_2"
    }
  ]
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `upload_images_v2`
2. `aws_moderation_for_images_by_inappropriate_profile`
3. `pending!`
4. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
5. `create_profile_response` — Rebuilds or reads the cached profile response.
6. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
7. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `upload_images_v2`
2. `aws_moderation_for_images_by_inappropriate_profile`
3. `send_for_aws_moderation` — Content moderation and scammer check (only in some states).
4. `check_for_scammer_before_moderation!` — Content moderation and scammer check (only in some states).
5. `fetch_email_domain` — Reads the email domain for the scammer check during moderation.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** This route requires an image-inappropriate profile. Name/email impact can occur in the moderation path.

<a id="api-091"></a>

#### `POST /V1/images/edit_images` — Edit images

**Edit images.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/images_controller.rb; config/routes.rb#L285`

**Request**

Request fields: `photos`, `photo`, `photo_id`, `status`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/images/edit_images" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "photos": [
    {
      "photo": "$PHOTO_URL_1",
      "photo_id": "$PHOTO_ID_1",
      "status": "avatar"
    },
    {
      "photo": "$PHOTO_URL_2",
      "photo_id": "$PHOTO_ID_2"
    }
  ]
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `edit_images`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `edit_images`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `edit_images`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-097"></a>

#### `POST /V1/subscription/boost_profile` — Boost profile

**Boost profile.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/subscription_controller.rb; config/routes.rb#L292`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/V1/subscription/boost_profile" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `boost_profile`
2. `activate_boost`
3. `boost_rating!`
4. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
5. `create_profile_response` — Rebuilds or reads the cached profile response.
6. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
7. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-099"></a>

#### `POST /V1/introduction/edit_icebreaker` — Edit icebreaker

**Edit icebreaker.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/introduction_controller.rb; config/routes.rb#L299`

**Request**

Request fields: `icebreakers`, `question_id`, `answer`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/introduction/edit_icebreaker" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "icebreakers": [
    {
      "question_id": "$QUESTION_ID",
      "answer": "Synthetic answer"
    }
  ]
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `icebreakers` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `edit_icebreaker`
2. `percentage_profile_complete`
3. `profile_details` — Rebuilds or reads the cached profile response.
4. `create_cache_response` — Rebuilds or reads the cached profile response.
5. `hydrate_first_name!` — Fills the first name into a cached profile response.
6. `get_first_name_for_user` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `icebreakers` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-100"></a>

#### `POST /V1/introduction/edit_icebreaker_v1` — Edit icebreaker v1

**Edit icebreaker v1.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/introduction_controller.rb; config/routes.rb#L300`

**Request**

Request fields: `question_id`, `answer`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/introduction/edit_icebreaker_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "question_id": "$QUESTION_ID",
  "answer": "Synthetic answer"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `icebreakers` (seen on staging 2026-10-25)
- `intro_questions` (seen on staging 2026-10-25)
- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `edit_icebreaker_v1`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `edit_icebreaker_v1`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `edit_icebreaker_v1`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `intro_questions` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `icebreakers` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-105"></a>

#### `POST /V1/advertisement/vote` — Advertisement vote

**Advertisement vote.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/advertisement_controller.rb; config/routes.rb#L309`

**Request**

Request fields: `option_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/advertisement/vote" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "option_id": "$POLL_OPTION_ID"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `vote`
2. `vote!`
3. `fill_cache!` — Rebuilds or reads the cached profile response.
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/advertisement_controller.rb:7 @004e72c`

<a id="api-121"></a>

#### `POST /web/users/about` — Users about

**Users about.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), Free text (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/web/users_controller.rb; config/routes.rb#L352`

**Request**

Request fields: `about`

```bash
curl -i --request POST "https://testa2.aisle.co/web/users/about" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "about": "Synthetic profile story for PII regression testing."
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `about`
2. `own_detailed_v1` — The owner’s full profile response.
3. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

_Code path — Email_

1. `about`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `about`
2. `own_detailed_v1` — The owner’s full profile response.
3. `own_general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
4. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

_Free-text encryption — Free text_

1. `Request with free text` — Free-text encryption (Dev free-text API list (2026-10-23)): encrypts about — Profile bio ("about")
2. `PII service — free-text key` — Aisle creates or fetches an AES-256-GCM key; the text itself never goes to the PII service.
3. `Aisle encrypts / decrypts the text` — The encrypted text and its key_id are kept in the app database.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |
| Free text | `—` | Encrypted by Aisle with a key from the PII service; there is no read switch. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| PII database | `free_text_encryption_key` | read / write |
| App database | `encrypted text + key_id` | writes |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: no token → 401 (empty text/html body).

**What changed**

- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25

<a id="api-122"></a>

#### `POST /web/users/update_settings` — Update settings

**Update settings.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/web/users_controller.rb; config/routes.rb#L353`

**Request**

Request fields: `age_from`, `age_to`

```bash
curl -i --request POST "https://testa2.aisle.co/web/users/update_settings" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "age_from": 25,
  "age_to": 35
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_settings`
2. `update_age`
3. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-123"></a>

#### `POST /web/users/deactivate_user` — Deactivate user

**Deactivate user.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/web/users_controller.rb; config/routes.rb#L354`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/web/users/deactivate_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `deactivate_user`
2. `deactivate_profile`
3. `deactivated!`
4. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
5. `create_profile_response` — Rebuilds or reads the cached profile response.
6. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
7. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-124"></a>

#### `POST /web/users/activate_user` — Activate user

**Activate user.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/web/users_controller.rb; config/routes.rb#L355`

**Request**

Request fields: none

```bash
curl -i --request POST "https://testa2.aisle.co/web/users/activate_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `activate_user`
2. `activate_profile`
3. `pending!`
4. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
5. `create_profile_response` — Rebuilds or reads the cached profile response.
6. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
7. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-134"></a>

#### `POST /web/user/location` — Update location coordinates

**Update location coordinates.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/web/users_controller.rb; config/routes.rb#L388`

**Request**

Request fields: `latitude`, `longitude`, `is_location_spoofed`

```bash
curl -i --request POST "https://testa2.aisle.co/web/user/location" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "latitude": 12.9716,
  "longitude": 77.5946,
  "is_location_spoofed": false
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `refresh_profile_list` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `update_location_coordinates`
2. `update_location`
3. `update_residence_info`
4. `fill_cache!` — Rebuilds or reads the cached profile response.
5. `create_profile_response` — Rebuilds or reads the cached profile response.
6. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
7. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `refresh_profile_list` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="code-030"></a>

#### `POST /V1/images/upload` — Create

**Create.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/images_controller.rb; config/routes.rb#L331`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:331` @004e72c → `v1/images#create` (`app/controllers/v1/images_controller.rb:7 @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** line 8 passes all params to Amazon::Url.upload_image — the fields read there are not determined; line 9 renders response — its full key set is built at run time

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:331 @004e72c`

<a id="code-031"></a>

#### `POST /V1/images/detect_face_in_image` — Detect face in image

**Detect face in image.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/images_controller.rb; config/routes.rb#L333`

**Request**

Request fields: `image_url` (optional · from code — confirm with Dev)

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:333` @004e72c → `v1/images#detect_face_in_image` (`app/controllers/v1/images_controller.rb:43 @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** line 45 renders response — its full key set is built at run time

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:333 @004e72c`

<a id="code-032"></a>

#### `POST /V1/images/image_modifications` — Image modifications

**Image modifications.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/images_controller.rb; config/routes.rb#L334`

**Request**

Request fields: `original_url` (optional · from code — confirm with Dev)

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:334` @004e72c → `v1/images#image_modifications` (`app/controllers/v1/images_controller.rb:48 @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** line 51 passes all params to image_optimizer_obj.image_modifications_api — the fields read there are not determined; line 52 renders response — its full key set is built at run time

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:334 @004e72c`

<a id="area-g7"></a>

### Payments — checkout

Start a payment: the provider’s customer details (name, email, phone) are built from personal data. 38 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| POST | [`/V1/payment/get_cashfree_request_params`](#api-073) | Get cashfree request params |
| POST | [`/V1/payment/get_cashfree_web_request_params`](#api-074) | Get cashfree web request params |
| POST | [`/V1/payment/get_payu_request_params`](#api-076) | Get payu request params |
| POST | [`/V1/payment/send_collect_request`](#api-077) | Send cashfree collect request |
| POST | [`/V1/payment/get_payment_link`](#api-078) | Send payment link |
| POST | [`/V1/payment/phone_pay/create_subscription`](#api-079) | Create phone pay subscription |
| POST | [`/V1/payment/phone_pay/one_time_payment`](#api-083) | Phone pay one time payment |
| POST | [`/V1/payment/phone_pay/create_phone_pay_subscription_web`](#api-084) | Create phone pay subscription web |
| POST | [`/V1/paint_bar_mixer/update_personal_details`](#api-104) | Update personal details |
| POST | [`/V1/payment/get_cashfree_request_params_web`](#api-189) | Get cashfree request params web |
| POST | [`/V1/payment/generate_qr_code`](#api-193) | Cashfree get upi qr code |
| POST | [`/V1/payment/send_web_purchase_link`](#api-194) | Payment send web purchase link |
| POST | [`/V1/payment/cashfree/subscription/create`](#code-002) | Create cashfree subscription |
| GET | [`/V1/payment/cashfree/subscription/status`](#code-003) | Cashfree subscription status |
| POST | [`/V1/payment/cashfree/subscription/cancel`](#code-004) | Cancel cashfree subscription |
| POST | [`/V1/payment/ms/activateAnySubscriptionWithExpiry`](#code-007) | Activate any subscription with expiry ms |
| POST | [`/V1/payment/ms/addExtraInvites`](#code-008) | Add extra invites ms |
| POST | [`/V1/payment/ms/addBoostToProfile`](#code-009) | Add boost to profile ms |
| POST | [`/V1/payment/ms/activePremiumSubscription`](#code-010) | Active premium subscription ms |
| POST | [`/V1/payment/ms/activateAnySubscription`](#code-011) | Activate any subscription ms |
| POST | [`/V1/payment/ms/enableExclusivity`](#code-012) | Enable exclusivity ms |
| POST | [`/V1/payment/ms/fetchUserIdFromIosIdentifier`](#code-013) | Fetch user id from ios identifier ms |
| POST | [`/V1/payment/ms/deactivateActiveSubscription`](#code-014) | Deactivate active subscription ms |
| POST | [`/V1/payment/ms/editUserSubscription`](#code-015) | Edit user subscription ms |
| POST | [`/V1/payment/ms/addConsumableDataGoogle`](#code-016) | Add consumable data google ms |
| POST | [`/V1/payment/ms/getAccountSubscription`](#code-017) | Get account subscription ms |
| POST | [`/V1/payment/ms/removeAccountSubscription`](#code-018) | Remove account subscription ms |
| POST | [`/V1/payment/ms/getActiveConciergeSubscription`](#code-019) | Get active concierge subscription ms |
| POST | [`/V1/payment/ms/getActiveAislePlusSubscription`](#code-020) | Get active aisle plus subscription ms |
| POST | [`/V1/payment/ms/getActivePremiumSubscriptionByGooglePlay`](#code-021) | Get active premium subscription by google play ms |
| POST | [`/V1/payment/ms/extendSubscription`](#code-022) | Extend subscription ms |
| POST | [`/V1/payment/ms/reduceSubscription`](#code-023) | Reduce subscription ms |
| POST | [`/V1/payment/ms/addConsummableDataGoogle`](#code-024) | Add consumable data google ms |
| POST | [`/V1/payment/ms/validateIosConsumable`](#code-025) | Validate ios consummable response ms |
| POST | [`/V1/payment/ms/getActiveSubscriptionByPlan`](#code-026) | Get active subscription by plan ms |
| POST | [`/V1/payment/ms/editUserSubscriptionPostAppleSubscriptions`](#code-027) | Edit user subscription post apple subscriptions ms |
| POST | [`/V1/payment/ms/saveToS3`](#code-028) | Save to s3 ms |
| POST | [`/V1/payment/ms/profileExists`](#code-029) | Profile exists ms |

<a id="api-073"></a>

#### `POST /V1/payment/get_cashfree_request_params` — Get cashfree request params

**Get cashfree request params.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L211`

**Request**

Request fields: `plan_id`, `conversation_id`, `external_transaction_token`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/get_cashfree_request_params" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "conversation_id": "$CONVERSATION_ID",
  "external_transaction_token": "$TRANSACTION_TOKEN"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `get_cashfree_request_params`
2. `fetch_order_token`
3. `new_cashfree_order_response`
4. `get_payment_session_id`
5. `fetch_payment_session_id`
6. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `get_cashfree_request_params`
2. `fetch_order_token`
3. `new_cashfree_order_response`
4. `get_payment_session_id`
5. `fetch_payment_session_id`
6. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `get_cashfree_request_params`
2. `fetch_order_token`
3. `new_cashfree_order_response`
4. `get_payment_session_id`
5. `fetch_payment_session_id`
6. `fetch_mobile_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Outside provider | `Cashfree` | called |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Uses a Cashfree-compatible plan. First name, email and full phone are read from the profile for the provider customer payload; do not pass them as replacement request fields.

<a id="api-074"></a>

#### `POST /V1/payment/get_cashfree_web_request_params` — Get cashfree web request params

**Get cashfree web request params.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L213`

**Request**

Request fields: `plan_id`, `return_url`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/get_cashfree_web_request_params" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "return_url": "https://example.com/payment-return"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `get_cashfree_web_request_params`
2. `fetch_web_order_token_v2`
3. `new_cashfree_order_response`
4. `get_payment_session_id`
5. `fetch_payment_session_id`
6. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `get_cashfree_web_request_params`
2. `fetch_web_order_token_v2`
3. `new_cashfree_order_response`
4. `get_payment_session_id`
5. `fetch_payment_session_id`
6. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `get_cashfree_web_request_params`
2. `fetch_web_order_token_v2`
3. `new_cashfree_order_response`
4. `get_payment_session_id`
5. `fetch_payment_session_id`
6. `fetch_mobile_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Outside provider | `Cashfree` | called |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-076"></a>

#### `POST /V1/payment/get_payu_request_params` — Get payu request params

**Get payu request params.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L220`

**Request**

Request fields: `id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/get_payu_request_params" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "id": "$PLAN_ID"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `get_payu_request_params`
2. `fetch_payment_request_params`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `get_payu_request_params`
2. `fetch_payment_request_params`
3. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `get_payu_request_params`
2. `fetch_payment_request_params`
3. `fetch_mobile_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Outside provider | `PayU` | called |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** The key is id, not plan_id. PII-derived name/email also participate in PayU hash generation.

<a id="api-077"></a>

#### `POST /V1/payment/send_collect_request` — Send cashfree collect request

**Send cashfree collect request.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L226`

**Request**

Request fields: `plan_id`, `vpa`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/send_collect_request" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "vpa": "synthetic@upi"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `send_cashfree_collect_request`
2. `send_collect_request`
3. `collect_request`
4. `get_upi_order_token`
5. `fetch_upi_order_token`
6. `create_payment_link_body_for_web`
7. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `send_cashfree_collect_request`
2. `send_collect_request`
3. `collect_request`
4. `get_upi_order_token`
5. `fetch_upi_order_token`
6. `create_payment_link_body_for_web`
7. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `send_cashfree_collect_request`
2. `send_collect_request`
3. `collect_request`
4. `get_upi_order_token`
5. `fetch_upi_order_token`
6. `create_payment_link_body_for_web`
7. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Outside provider | `Cashfree` | called |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-078"></a>

#### `POST /V1/payment/get_payment_link` — Send payment link

**Send payment link.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L227`

**Request**

Request fields: `plan_id`, `ruser`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/get_payment_link" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "ruser": false
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `send_payment_link`
2. `send_payment_link`
3. `fetch_payment_link`
4. `create_payment_link_body_for_web`
5. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `send_payment_link`
2. `send_payment_link`
3. `fetch_payment_link`
4. `create_payment_link_body_for_web`
5. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `send_payment_link`
2. `send_payment_link`
3. `fetch_payment_link`
4. `create_payment_link_body_for_web`
5. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-079"></a>

#### `POST /V1/payment/phone_pay/create_subscription` — Create phone pay subscription

**Create phone pay subscription.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L235`

**Request**

Request fields: `plan_id`, `phone_pe_flow`, `vpa`, `bought_from`, `is_upgrade`, `discount_percentage`, `device_os`, `external_transaction_token`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/phone_pay/create_subscription" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "phone_pe_flow": "collect",
  "vpa": "synthetic@upi",
  "bought_from": "discover",
  "is_upgrade": false,
  "discount_percentage": 0,
  "device_os": "ANDROID",
  "external_transaction_token": "$TRANSACTION_TOKEN"
}
JSON
```

**End-to-end flow**

_Code path — Phone_

1. `create_phone_pay_subscription`
2. `create_subscription_handler`
3. `fetch_phone_number_for_user` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Outside provider | `PhonePe` | called |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-083"></a>

#### `POST /V1/payment/phone_pay/one_time_payment` — Phone pay one time payment

**Phone pay one time payment.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L241`

**Request**

Request fields: `plan_id`, `product_id`, `bought_from`, `vpa`, `discount_percentage`, `conversation_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/phone_pay/one_time_payment" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "product_id": "$PRODUCT_ID",
  "bought_from": "discover",
  "vpa": "synthetic@upi",
  "discount_percentage": 0,
  "conversation_id": "$CONVERSATION_ID"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `transaction_id` (from code — confirm with Dev)

**End-to-end flow**

_Code path — Phone_

1. `phone_pay_one_time_payment`
2. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Outside provider | `PhonePe` | called |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `transaction_id` · from code — confirm with Dev · `app/controllers/v1/payment_controller.rb:364 @004e72c`
- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/payment_controller.rb:364 @004e72c`

<a id="api-084"></a>

#### `POST /V1/payment/phone_pay/create_phone_pay_subscription_web` — Create phone pay subscription web

**Create phone pay subscription web.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** Web JWT · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L247`

**Request**

Request fields: `plan_id`, `phone_pe_flow`, `vpa`, `bought_from`, `is_upgrade`, `discount_percentage`, `device_os`, `external_transaction_token`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/phone_pay/create_phone_pay_subscription_web" \
  --header "Authorization: Bearer ${WEB_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "phone_pe_flow": "collect",
  "vpa": "synthetic@upi",
  "bought_from": "discover",
  "is_upgrade": false,
  "discount_percentage": 0,
  "device_os": "ANDROID",
  "external_transaction_token": "$TRANSACTION_TOKEN"
}
JSON
```

**End-to-end flow**

_Code path — Phone_

1. `create_phone_pay_subscription_web`
2. `create_subscription_handler`
3. `fetch_phone_number_for_user` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Outside provider | `PhonePe` | called |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-104"></a>

#### `POST /V1/paint_bar_mixer/update_personal_details` — Update personal details

**Update personal details.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** Web JWT · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/speed_dating_controller.rb; config/routes.rb#L307`

**Request**

Request fields: `ref`, `personal_details`, `name`, `email`, `phone_number`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/paint_bar_mixer/update_personal_details" \
  --header "Authorization: Bearer ${WEB_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF",
  "personal_details": {
    "name": "Asha",
    "email": "asha@example.com",
    "phone_number": "+911012345678"
  }
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `update_personal_details`
2. `update_personal_details`
3. `fetch_web_order_token_v2`
4. `new_cashfree_order_response`
5. `get_payment_session_id`
6. `fetch_payment_session_id`
7. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `update_personal_details`
2. `update_personal_details`
3. `fetch_web_order_token_v2`
4. `new_cashfree_order_response`
5. `get_payment_session_id`
6. `fetch_payment_session_id`
7. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `update_personal_details`
2. `update_personal_details`
3. `fetch_web_order_token_v2`
4. `new_cashfree_order_response`
5. `get_payment_session_id`
6. `fetch_payment_session_id`
7. `fetch_mobile_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Outside provider | `Cashfree` | called |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-189"></a>

#### `POST /V1/payment/get_cashfree_request_params_web` — Get cashfree request params web

**Get cashfree request params web.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** Web JWT · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L214`

**Request**

Request fields: `plan_id`, `return_url`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/get_cashfree_request_params_web" \
  --header "Authorization: Bearer ${WEB_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "return_url": "https://example.com/payment-return"
}
JSON
```

**End-to-end flow**

_Code path — First name, Email, Phone_

1. `get_cashfree_request_params_web`
2. `get_cashfree_web_request_params`
3. `Cashfree customer fields`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Outside provider | `Cashfree` | called |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Alias of get_cashfree_web_request_params with authenticate_web_token instead of the normal app-token path.

<a id="api-193"></a>

#### `POST /V1/payment/generate_qr_code` — Cashfree get upi qr code

**Cashfree get upi qr code.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L225`

**Request**

Request fields: `plan_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/generate_qr_code" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID"
}
JSON
```

**End-to-end flow**

_Code path — First name, Email, Phone_

1. `Cashfree get_upi_qr_code`
2. `generate_qr_code`
3. `get_upi_order_token`
4. `create_payment_link_body_for_web`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Outside provider | `Cashfree` | called |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-194"></a>

#### `POST /V1/payment/send_web_purchase_link` — Payment send web purchase link

**Payment send web purchase link.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: Phone (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L228`

**Request**

Request fields: `app_store`, `device_type`, `trigger_type`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/send_web_purchase_link" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ios" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "app_store": "India",
  "device_type": "ios",
  "trigger_type": "purchase"
}
JSON
```

**End-to-end flow**

_Code path — Phone_

1. `Payment.send_web_purchase_link`
2. `SmsNotifierWorker` — Background job: runs after the request has returned.
3. `fetch_full_phone_number_for_user` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Background job | `SmsNotifierWorker` | async |
| Outside provider | `SMS provider` | called |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Use device_type=ios in the headers too. Requires an eligible male India iOS profile, no active subscription, and remaining SMS cooldown/daily allowance.

<a id="code-002"></a>

#### `POST /V1/payment/cashfree/subscription/create` — Create cashfree subscription

**Create cashfree subscription.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L230`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:230` @004e72c → `v1/payment#create_cashfree_subscription` (`app/controllers/v1/payment_controller.rb:276 @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** line 277 passes all params to Payment::Cashfree.create_cashfree_subscription — the fields read there are not determined; line 278 renders response — its full key set is built at run time

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:230 @004e72c`

<a id="code-003"></a>

#### `GET /V1/payment/cashfree/subscription/status` — Cashfree subscription status

**Cashfree subscription status.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L231`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:231` @004e72c → `v1/payment#cashfree_subscription_status` (`app/controllers/v1/payment_controller.rb:281 @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** line 282 passes all params to Payment::Cashfree.cashfree_subscription_status — the fields read there are not determined; line 283 renders response — its full key set is built at run time

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:231 @004e72c`

<a id="code-004"></a>

#### `POST /V1/payment/cashfree/subscription/cancel` — Cancel cashfree subscription

**Cancel cashfree subscription.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L232`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:232` @004e72c → `v1/payment#cancel_cashfree_subscription` (`app/controllers/v1/payment_controller.rb:286 @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** line 287 passes all params to Payment::Cashfree.cancel_cashfree_subscription — the fields read there are not determined; line 288 renders response — its full key set is built at run time

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:232 @004e72c`

<a id="code-007"></a>

#### `POST /V1/payment/ms/activateAnySubscriptionWithExpiry` — Activate any subscription with expiry ms

**Activate any subscription with expiry ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L285`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:285` @004e72c → `v1/payment#activate_any_subscription_with_expiry_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action activate_any_subscription_with_expiry_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:285 @004e72c`

<a id="code-008"></a>

#### `POST /V1/payment/ms/addExtraInvites` — Add extra invites ms

**Add extra invites ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L286`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:286` @004e72c → `v1/payment#add_extra_invites_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action add_extra_invites_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:286 @004e72c`

<a id="code-009"></a>

#### `POST /V1/payment/ms/addBoostToProfile` — Add boost to profile ms

**Add boost to profile ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L287`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:287` @004e72c → `v1/payment#add_boost_to_profile_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action add_boost_to_profile_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:287 @004e72c`

<a id="code-010"></a>

#### `POST /V1/payment/ms/activePremiumSubscription` — Active premium subscription ms

**Active premium subscription ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L288`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:288` @004e72c → `v1/payment#active_premium_subscription_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action active_premium_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:288 @004e72c`

<a id="code-011"></a>

#### `POST /V1/payment/ms/activateAnySubscription` — Activate any subscription ms

**Activate any subscription ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L289`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:289` @004e72c → `v1/payment#activate_any_subscription_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action activate_any_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:289 @004e72c`

<a id="code-012"></a>

#### `POST /V1/payment/ms/enableExclusivity` — Enable exclusivity ms

**Enable exclusivity ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L290`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:290` @004e72c → `v1/payment#enable_exclusivity_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action enable_exclusivity_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:290 @004e72c`

<a id="code-013"></a>

#### `POST /V1/payment/ms/fetchUserIdFromIosIdentifier` — Fetch user id from ios identifier ms

**Fetch user id from ios identifier ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L291`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:291` @004e72c → `v1/payment#fetch_user_id_from_ios_identifier_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action fetch_user_id_from_ios_identifier_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:291 @004e72c`

<a id="code-014"></a>

#### `POST /V1/payment/ms/deactivateActiveSubscription` — Deactivate active subscription ms

**Deactivate active subscription ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L292`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:292` @004e72c → `v1/payment#deactivate_active_subscription_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action deactivate_active_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:292 @004e72c`

<a id="code-015"></a>

#### `POST /V1/payment/ms/editUserSubscription` — Edit user subscription ms

**Edit user subscription ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L293`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:293` @004e72c → `v1/payment#edit_user_subscription_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action edit_user_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:293 @004e72c`

<a id="code-016"></a>

#### `POST /V1/payment/ms/addConsumableDataGoogle` — Add consumable data google ms

**Add consumable data google ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L294`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:294` @004e72c → `v1/payment#add_consumable_data_google_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action add_consumable_data_google_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:294 @004e72c`

<a id="code-017"></a>

#### `POST /V1/payment/ms/getAccountSubscription` — Get account subscription ms

**Get account subscription ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L295`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:295` @004e72c → `v1/payment#get_account_subscription_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action get_account_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:295 @004e72c`

<a id="code-018"></a>

#### `POST /V1/payment/ms/removeAccountSubscription` — Remove account subscription ms

**Remove account subscription ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L296`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:296` @004e72c → `v1/payment#remove_account_subscription_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action remove_account_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:296 @004e72c`

<a id="code-019"></a>

#### `POST /V1/payment/ms/getActiveConciergeSubscription` — Get active concierge subscription ms

**Get active concierge subscription ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L297`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:297` @004e72c → `v1/payment#get_active_concierge_subscription_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action get_active_concierge_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:297 @004e72c`

<a id="code-020"></a>

#### `POST /V1/payment/ms/getActiveAislePlusSubscription` — Get active aisle plus subscription ms

**Get active aisle plus subscription ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L298`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:298` @004e72c → `v1/payment#get_active_aisle_plus_subscription_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action get_active_aisle_plus_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:298 @004e72c`

<a id="code-021"></a>

#### `POST /V1/payment/ms/getActivePremiumSubscriptionByGooglePlay` — Get active premium subscription by google play ms

**Get active premium subscription by google play ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L299`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:299` @004e72c → `v1/payment#get_active_premium_subscription_by_google_play_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action get_active_premium_subscription_by_google_play_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:299 @004e72c`

<a id="code-022"></a>

#### `POST /V1/payment/ms/extendSubscription` — Extend subscription ms

**Extend subscription ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L300`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:300` @004e72c → `v1/payment#extend_subscription_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action extend_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:300 @004e72c`

<a id="code-023"></a>

#### `POST /V1/payment/ms/reduceSubscription` — Reduce subscription ms

**Reduce subscription ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L301`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:301` @004e72c → `v1/payment#reduce_subscription_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action reduce_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:301 @004e72c`

<a id="code-024"></a>

#### `POST /V1/payment/ms/addConsummableDataGoogle` — Add consumable data google ms

**Add consumable data google ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L302`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:302` @004e72c → `v1/payment#add_consumable_data_google_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action add_consumable_data_google_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:302 @004e72c`

<a id="code-025"></a>

#### `POST /V1/payment/ms/validateIosConsumable` — Validate ios consummable response ms

**Validate ios consummable response ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L303`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:303` @004e72c → `v1/payment#validate_ios_consummable_response_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action validate_ios_consummable_response_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:303 @004e72c`

<a id="code-026"></a>

#### `POST /V1/payment/ms/getActiveSubscriptionByPlan` — Get active subscription by plan ms

**Get active subscription by plan ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L304`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:304` @004e72c → `v1/payment#get_active_subscription_by_plan_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action get_active_subscription_by_plan_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:304 @004e72c`

<a id="code-027"></a>

#### `POST /V1/payment/ms/editUserSubscriptionPostAppleSubscriptions` — Edit user subscription post apple subscriptions ms

**Edit user subscription post apple subscriptions ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L305`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:305` @004e72c → `v1/payment#edit_user_subscription_post_apple_subscriptions_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action edit_user_subscription_post_apple_subscriptions_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:305 @004e72c`

<a id="code-028"></a>

#### `POST /V1/payment/ms/saveToS3` — Save to s3 ms

**Save to s3 ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L306`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:306` @004e72c → `v1/payment#save_to_s3_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action save_to_s3_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:306 @004e72c`

<a id="code-029"></a>

#### `POST /V1/payment/ms/profileExists` — Profile exists ms

**Profile exists ms.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L307`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:307` @004e72c → `v1/payment#profile_exists_ms` (`app/controllers/v1/payment_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action profile_exists_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:307 @004e72c`

<a id="area-g8"></a>

### Payments — verification

Verify or restore a payment; on success the profile cache is rebuilt. 11 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| POST | [`/V1/payment/verify_razorpay_payment_v1`](#api-070) | Verify razorpay payment v1 |
| POST | [`/V1/payment/verify_ios_payment_v1`](#api-071) | Verify ios payment v1 |
| POST | [`/V1/payment/verify_paytm_payment_v1`](#api-072) | Verify paytm payment v1 |
| POST | [`/V1/payment/verify_cashfree_payment`](#api-075) | Verify cashfree payment |
| POST | [`/V1/subscription/verify_android_payments`](#api-092) | Verify android payments |
| POST | [`/V1/subscription/restore_android_subscription`](#api-093) | Restore android subscription |
| POST | [`/V1/subscription/restore_ios_subscription_v1`](#api-096) | Restore ios subscription v1 |
| POST | [`/V1/speed_dating/book_event`](#api-102) | Book event |
| POST | [`/V1/freebies/claim`](#api-115) | Claim freebie |
| POST | [`/web/payment/verify_razorpay_payment`](#api-133) | Verify razorpay payment |
| POST | [`/V1/payment/verify_cashfree_payments_web`](#api-195) | Verify cashfree payments web |

<a id="api-070"></a>

#### `POST /V1/payment/verify_razorpay_payment_v1` — Verify razorpay payment v1

**Verify razorpay payment v1.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L199`

**Request**

Request fields: `payment_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/verify_razorpay_payment_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "payment_id": "$PAYMENT_ID"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `verify_razorpay_payment_v1`
2. `verify_by_payment_id`
3. `assign_plan_to_profile`
4. `activate_any_subscription` — Activates a subscription after a successful payment.
5. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
6. `fill_cache!` — Rebuilds or reads the cached profile response.
7. `create_profile_response` — Rebuilds or reads the cached profile response.
8. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
9. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `Razorpay` | called |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-071"></a>

#### `POST /V1/payment/verify_ios_payment_v1` — Verify ios payment v1

**Verify ios payment v1.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L208`

**Request**

Request fields: `productId`, `receiptdata`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/verify_ios_payment_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "productId": "$PRODUCT_ID",
  "receiptdata": "$APPLE_RECEIPT"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `verify_ios_payment_v1`
2. `verify_payment`
3. `restore_purchase`
4. `validate_receipt_data`
5. `validate_ios_consumable_response`
6. `activate_any_subscription` — Activates a subscription after a successful payment.
7. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
8. `fill_cache!` — Rebuilds or reads the cached profile response.
9. `create_profile_response` — Rebuilds or reads the cached profile response.
10. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
11. `select_f…`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `Apple` | called |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-072"></a>

#### `POST /V1/payment/verify_paytm_payment_v1` — Verify paytm payment v1

**Verify paytm payment v1.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L210`

**Request**

Request fields: `STATUS`, `ORDERID`, `TXNAMOUNT`, `CHECKSUMHASH`, `RESPMSG`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/verify_paytm_payment_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "STATUS": "TXN_SUCCESS",
  "ORDERID": "$ORDER_ID",
  "TXNAMOUNT": "$PAYMENT_AMOUNT",
  "CHECKSUMHASH": "$PAYTM_CHECKSUM",
  "RESPMSG": "Txn Success"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `verify_paytm_payment_v1`
2. `verify_by_order_id`
3. `assign_plan_to_profile`
4. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
5. `fill_cache!` — Rebuilds or reads the cached profile response.
6. `create_profile_response` — Rebuilds or reads the cached profile response.
7. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
8. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `Paytm` | called |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-075"></a>

#### `POST /V1/payment/verify_cashfree_payment` — Verify cashfree payment

**Verify cashfree payment.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L215`

**Request**

Request fields: `order_id`, `sort_by` (optional · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/verify_cashfree_payment" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "order_id": "$ORDER_ID"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `is_backend_error` (from code — confirm with Dev)
- `message` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `verify_cashfree_payment`
2. `verify_transaction`
3. `assign_plan_to_profile`
4. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
5. `fill_cache!` — Rebuilds or reads the cached profile response.
6. `create_profile_response` — Rebuilds or reads the cached profile response.
7. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
8. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `Cashfree` | called |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `message` · from code — confirm with Dev · `app/controllers/v1/payment_controller.rb:167 @004e72c`
- 2026-10-29 — Response field added: `is_backend_error` · from code — confirm with Dev · `app/controllers/v1/payment_controller.rb:166 @004e72c`
- 2026-10-29 — Request field added: `sort_by` · from code — confirm with Dev · `app/controllers/v1/payment_controller.rb:126 @004e72c`

<a id="api-092"></a>

#### `POST /V1/subscription/verify_android_payments` — Verify android payments

**Verify android payments.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/v1/subscription_controller.rb; config/routes.rb#L287`

**Request**

Request fields: `product_id`, `purchase_token`, `conversation_id` (optional · from code — confirm with Dev), `sort_by` (optional · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/V1/subscription/verify_android_payments" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "product_id": "$PRODUCT_ID",
  "purchase_token": "$PURCHASE_TOKEN"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `payment_type` (from code — confirm with Dev)
- `boost_left` (from code — confirm with Dev)
- `sparks_left` (from code — confirm with Dev)
- `extra_invites` (from code — confirm with Dev)
- `currency_code` (from code — confirm with Dev)
- `amount_in_currency` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `verify_android_payments`
2. `verify_android_payment`
3. `add_consummable_or_subscription`
4. `add_subscription_data`
5. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
6. `fill_cache!` — Rebuilds or reads the cached profile response.
7. `create_profile_response` — Rebuilds or reads the cached profile response.
8. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
9. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `Google Play` | called |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `amount_in_currency` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:35 @004e72c`
- 2026-10-29 — Response field added: `currency_code` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:35 @004e72c`
- 2026-10-29 — Response field added: `extra_invites` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:35 @004e72c`
- 2026-10-29 — Response field added: `sparks_left` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:35 @004e72c`
- 2026-10-29 — Response field added: `boost_left` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:35 @004e72c`
- 2026-10-29 — Response field added: `payment_type` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:35 @004e72c`
- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:35 @004e72c`
- 2026-10-29 — Request field added: `sort_by` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:26 @004e72c`
- 2026-10-29 — Request field added: `conversation_id` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:14 @004e72c`

<a id="api-093"></a>

#### `POST /V1/subscription/restore_android_subscription` — Restore android subscription

**Restore android subscription.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/v1/subscription_controller.rb; config/routes.rb#L288`

**Request**

Request fields: `product_id`, `purchase_token`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/subscription/restore_android_subscription" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "product_id": "$PRODUCT_ID",
  "purchase_token": "$PURCHASE_TOKEN"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `message` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `restore_android_subscription`
2. `restore_subscription_from_previous_user`
3. `transfer_active_subscription`
4. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
5. `fill_cache!` — Rebuilds or reads the cached profile response.
6. `create_profile_response` — Rebuilds or reads the cached profile response.
7. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
8. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `Google Play` | called |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `message` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:53 @004e72c`
- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:53 @004e72c`

<a id="api-096"></a>

#### `POST /V1/subscription/restore_ios_subscription_v1` — Restore ios subscription v1

**Restore ios subscription v1.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/v1/subscription_controller.rb; config/routes.rb#L291`

**Request**

Request fields: `productId`, `receiptdata`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/subscription/restore_ios_subscription_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "productId": "$PRODUCT_ID",
  "receiptdata": "$APPLE_RECEIPT"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `restore_ios_subscription_v1`
2. `restore_subscription_from_previous_user`
3. `transfer_active_subscription`
4. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
5. `fill_cache!` — Rebuilds or reads the cached profile response.
6. `create_profile_response` — Rebuilds or reads the cached profile response.
7. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
8. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `Apple` | called |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-102"></a>

#### `POST /V1/speed_dating/book_event` — Book event

**Book event.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/v1/speed_dating_controller.rb; config/routes.rb#L303`

**Request**

Request fields: `event_id`, `payment_id`, `ORDERID` (optional · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/V1/speed_dating/book_event" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "event_id": "$EVENT_ID",
  "payment_id": "$PAYMENT_ID"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `book_event`
2. `verify_payment`
3. `assign_plan_to_profile`
4. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
5. `fill_cache!` — Rebuilds or reads the cached profile response.
6. `create_profile_response` — Rebuilds or reads the cached profile response.
7. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
8. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Razorpay branch shown. If configured for Paytm, send ORDERID, STATUS, TXNAMOUNT, CHECKSUMHASH and RESPMSG from its verified callback instead.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/speed_dating_controller.rb:17 @004e72c`
- 2026-10-29 — Request field added: `ORDERID` · from code — confirm with Dev · `app/controllers/v1/speed_dating_controller.rb:12 @004e72c`

<a id="api-115"></a>

#### `POST /V1/freebies/claim` — Claim freebie

**Claim freebie.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/v1/freebie_controller.rb; config/routes.rb#L329`

**Request**

Request fields: `freebie_type`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/freebies/claim" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "freebie_type": "free_premium_female"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `data` (from code — confirm with Dev)
- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `claim_freebie`
2. `create_claim_entry`
3. `success_text`
4. `activate_any_subscription` — Activates a subscription after a successful payment.
5. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
6. `fill_cache!` — Rebuilds or reads the cached profile response.
7. `create_profile_response` — Rebuilds or reads the cached profile response.
8. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
9. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/freebie_controller.rb:6 @004e72c`
- 2026-10-29 — Response field added: `data` · from code — confirm with Dev · `app/controllers/v1/freebie_controller.rb:6 @004e72c`

<a id="api-133"></a>

#### `POST /web/payment/verify_razorpay_payment` — Verify razorpay payment

**Verify razorpay payment.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/web/payment_controller.rb; config/routes.rb#L384`

**Request**

Request fields: `payment_id`

```bash
curl -i --request POST "https://testa2.aisle.co/web/payment/verify_razorpay_payment" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "payment_id": "$PAYMENT_ID"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `verify_razorpay_payment`
2. `verify_payment`
3. `assign_plan_to_profile`
4. `activate_any_subscription` — Activates a subscription after a successful payment.
5. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
6. `fill_cache!` — Rebuilds or reads the cached profile response.
7. `create_profile_response` — Rebuilds or reads the cached profile response.
8. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
9. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `Razorpay` | called |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-195"></a>

#### `POST /V1/payment/verify_cashfree_payments_web` — Verify cashfree payments web

**Verify cashfree payments web.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L217`

**Request**

Request fields: `order_id`, `sort_by` (optional · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/verify_cashfree_payments_web" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "order_id": "$ORDER_ID"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `is_backend_error` (from code — confirm with Dev)
- `message` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `Alias of verify_cashfree_payment; successful subscription assignment can rebuild the profile cache`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Outside provider | `Cashfree` | called |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `message` · from code — confirm with Dev · `app/controllers/v1/payment_controller.rb:167 @004e72c`
- 2026-10-29 — Response field added: `is_backend_error` · from code — confirm with Dev · `app/controllers/v1/payment_controller.rb:166 @004e72c`
- 2026-10-29 — Request field added: `sort_by` · from code — confirm with Dev · `app/controllers/v1/payment_controller.rb:126 @004e72c`

<a id="area-g9"></a>

### Provider callbacks

Called by outside providers (PhonePe, Google Play, Apple, Pusher) — no user login. 10 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| POST | [`/V1/payment/phone_pay/mandate_create_callback`](#api-080) | Phone pay mandate create webhook |
| POST | [`/V1/payment/phone_pay/refund_callback`](#api-081) | Phone pay refund webhook |
| POST | [`/V1/payment/phone_pay/one_time_payment_callback`](#api-082) | Phone pay one time webhook |
| POST | [`/V1/payment/googleplay_webhook`](#api-094) | Googleplay webhook |
| POST | [`/V1/payment/apple_webhook_v2`](#api-095) | Apple webhook v2 |
| POST | [`/V1/pusher_presence_webhook`](#api-113) | Pusher presence webhook |
| GET | [`/V1/pusher_presence_webhook`](#api-114) | Pusher presence webhook |
| POST | [`/V1/messages/firebase_webhook`](#code-001) | Firebase webhook |
| POST | [`/V1/payment/cashfree/subscription/webhook`](#code-005) | Cashfree subscription webhook |
| POST | [`/V1/payment/cashfree/subscription/authorization_callback`](#code-006) | Cashfree subscription authorization callback |

<a id="api-080"></a>

#### `POST /V1/payment/phone_pay/mandate_create_callback` — Phone pay mandate create webhook

**Phone pay mandate create webhook.** Called by outside providers (PhonePe, Google Play, Apple, Pusher) — no user login.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Outside provider (callback) · **Auth** None — provider signature · **Operation** Callback / webhook · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L236`

**Request**

Request fields: `response`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/phone_pay/mandate_create_callback" \
  --header "X-VERIFY: ${PHONEPE_X_VERIFY}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "response": "$PHONEPE_RESPONSE_BASE64"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `phone_pay_mandate_create_webhook`
2. `handle_create_mandate_webhook`
3. `record_transaction`
4. `debit_amount`
5. `activate_any_subscription` — Activates a subscription after a successful payment.
6. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
7. `fill_cache!` — Rebuilds or reads the cached profile response.
8. `create_profile_response` — Rebuilds or reads the cached profile response.
9. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
10. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `PhonePe` | calls in |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Use the original provider callback response and its matching X-VERIFY value. A successful mandate callback can activate a subscription and refresh the profile cache.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/payment_controller.rb:341 @004e72c`

<a id="api-081"></a>

#### `POST /V1/payment/phone_pay/refund_callback` — Phone pay refund webhook

**Phone pay refund webhook.** Called by outside providers (PhonePe, Google Play, Apple, Pusher) — no user login.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Outside provider (callback) · **Auth** None — provider signature · **Operation** Callback / webhook · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L239`

**Request**

Request fields: `response`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/phone_pay/refund_callback" \
  --header "X-VERIFY: ${PHONEPE_X_VERIFY}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "response": "$PHONEPE_RESPONSE_BASE64"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `phone_pay_refund_webhook`
2. `check_for_duplicate_payments`
3. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
4. `fill_cache!` — Rebuilds or reads the cached profile response.
5. `create_profile_response` — Rebuilds or reads the cached profile response.
6. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
7. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `PhonePe` | calls in |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Use the original refund callback and its matching X-VERIFY value. Duplicate-payment reconciliation may reactivate another subscription.

<a id="api-082"></a>

#### `POST /V1/payment/phone_pay/one_time_payment_callback` — Phone pay one time webhook

**Phone pay one time webhook.** Called by outside providers (PhonePe, Google Play, Apple, Pusher) — no user login.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Outside provider (callback) · **Auth** None — provider signature · **Operation** Callback / webhook · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L240`

**Request**

Request fields: `response`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/phone_pay/one_time_payment_callback" \
  --header "X-VERIFY: ${PHONEPE_X_VERIFY}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "response": "$PHONEPE_RESPONSE_BASE64"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `phone_pay_one_time_webhook`
2. `one_time_payment_done`
3. `activate_any_subscription` — Activates a subscription after a successful payment.
4. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
5. `fill_cache!` — Rebuilds or reads the cached profile response.
6. `create_profile_response` — Rebuilds or reads the cached profile response.
7. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
8. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `PhonePe` | calls in |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Use the original successful payment callback and its matching X-VERIFY value.

<a id="api-094"></a>

#### `POST /V1/payment/googleplay_webhook` — Googleplay webhook

**Googleplay webhook.** Called by outside providers (PhonePe, Google Play, Apple, Pusher) — no user login.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Outside provider (callback) · **Auth** None — provider signature · **Operation** Callback / webhook · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L289`

**Request**

Request fields: `message`, `data`, `messageId`, `publishTime`, `subscription`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/googleplay_webhook" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "message": {
    "data": "$GOOGLE_RTDN_BASE64",
    "messageId": "$PUBSUB_MESSAGE_ID",
    "publishTime": "2026-10-16T00:00:00Z"
  },
  "subscription": "$PUBSUB_SUBSCRIPTION"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `googleplay_webhook`
2. `verify_googleplay_webhook_payment`
3. `add_consummable_or_subscription`
4. `add_subscription_data`
5. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
6. `fill_cache!` — Rebuilds or reads the cached profile response.
7. `create_profile_response` — Rebuilds or reads the cached profile response.
8. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
9. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `Google Play` | calls in |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** message.data is Base64 of the Google Real-time Developer Notification JSON for a genuine test purchase. Provider verification and matching purchase records are required to reach subscription activation.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/payment_controller.rb:218 @004e72c`

<a id="api-095"></a>

#### `POST /V1/payment/apple_webhook_v2` — Apple webhook v2

**Apple webhook v2.** Called by outside providers (PhonePe, Google Play, Apple, Pusher) — no user login.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Outside provider (callback) · **Auth** None — provider signature · **Operation** Callback / webhook · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L290`

**Request**

Request fields: `signedPayload`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/payment/apple_webhook_v2" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "signedPayload": "$APPLE_SIGNED_PAYLOAD"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `apple_webhook_v2`
2. `store_and_process_webhook`
3. `start_processing_notification`
4. `process_notification`
5. `renew`
6. `edit_user_subscription`
7. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
8. `fill_cache!` — Rebuilds or reads the cached profile response.
9. `create_profile_response` — Rebuilds or reads the cached profile response.
10. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
11. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `Apple` | calls in |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** signedPayload must be the genuine Apple server-notification JWS for a sandbox test transaction. An arbitrary JWT cannot exercise this flow.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/payment_controller.rb:224 @004e72c`

<a id="api-113"></a>

#### `POST /V1/pusher_presence_webhook` — Pusher presence webhook

**Pusher presence webhook.** Called by outside providers (PhonePe, Google Play, Apple, Pusher) — no user login.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Outside provider (callback) · **Auth** None — provider signature · **Operation** Callback / webhook · **Code** `app/controllers/v1/live_audio_controller.rb; config/routes.rb#L320`

**Request**

Request fields: `events`, `channel`, `name`, `user_id`, `channel_name` (optional · from code — confirm with Dev), `token` (optional · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/V1/pusher_presence_webhook" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "events": [
    {
      "channel": "presence-channel",
      "name": "member_removed",
      "user_id": "$USER_ID"
    }
  ]
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `pusher_presence_webhook`
2. `fill_room_cache!` — Rebuilds the live-audio room cache.
3. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Live-audio room cache` | rebuild |
| Outside provider | `Pusher` | calls in |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Use the presence-event branch without Authorization; adding an app token selects Pusher channel authentication instead. A matching live room is required for the cache-update branch.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/live_audio_controller.rb:92 @004e72c`
- 2026-10-29 — Request field added: `token` · from code — confirm with Dev · `app/controllers/v1/live_audio_controller.rb:65 @004e72c`
- 2026-10-29 — Request field added: `channel_name` · from code — confirm with Dev · `app/controllers/v1/live_audio_controller.rb:95 @004e72c`

<a id="api-114"></a>

#### `GET /V1/pusher_presence_webhook` — Pusher presence webhook

**Pusher presence webhook.** Called by outside providers (PhonePe, Google Play, Apple, Pusher) — no user login.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Outside provider (callback) · **Auth** None — provider signature · **Operation** Callback / webhook · **Code** `app/controllers/v1/live_audio_controller.rb; config/routes.rb#L321`

**Request**

Request fields: `events[0][channel]`, `events[0][name]`, `events[0][user_id]`, `channel_name` (optional · from code — confirm with Dev), `events` (optional, array · from code — confirm with Dev), `token` (optional · from code — confirm with Dev)

```bash
curl -i --request GET "https://testa2.aisle.co/V1/pusher_presence_webhook" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "events[0][channel]=presence-channel" \
  --data-urlencode "events[0][name]=member_removed" \
  --data-urlencode "events[0][user_id]=$USER_ID"
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `pusher_presence_webhook`
2. `fill_room_cache!` — Rebuilds the live-audio room cache.
3. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Live-audio room cache` | rebuild |
| Outside provider | `Pusher` | calls in |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Use the presence-event branch without Authorization; adding an app token selects Pusher channel authentication instead. A matching live room is required for the cache-update branch.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/live_audio_controller.rb:92 @004e72c`
- 2026-10-29 — Request field added: `token` · from code — confirm with Dev · `app/controllers/v1/live_audio_controller.rb:65 @004e72c`
- 2026-10-29 — Request field added: `events` · from code — confirm with Dev · `app/controllers/v1/live_audio_controller.rb:71 @004e72c`
- 2026-10-29 — Request field added: `channel_name` · from code — confirm with Dev · `app/controllers/v1/live_audio_controller.rb:95 @004e72c`

<a id="code-001"></a>

#### `POST /V1/messages/firebase_webhook` — Firebase webhook

**Firebase webhook.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/messages_controller.rb; config/routes.rb#L197`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:197` @004e72c → `v1/messages#firebase_webhook` (`app/controllers/v1/messages_controller.rb @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** action firebase_webhook is not defined in app/controllers/v1/messages_controller.rb (inherited or generated)

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:197 @004e72c`

<a id="code-005"></a>

#### `POST /V1/payment/cashfree/subscription/webhook` — Cashfree subscription webhook

**Cashfree subscription webhook.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L233`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:233` @004e72c → `v1/payment#cashfree_subscription_webhook` (`app/controllers/v1/payment_controller.rb:291 @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** line 294 renders response — its full key set is built at run time

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:233 @004e72c`

<a id="code-006"></a>

#### `POST /V1/payment/cashfree/subscription/authorization_callback` — Cashfree subscription authorization callback

**Cashfree subscription authorization callback.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L234`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:234` @004e72c → `v1/payment#cashfree_subscription_authorization_callback` (`app/controllers/v1/payment_controller.rb:297 @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** line 298 passes all params to Payment::Cashfree.cashfree_subscription_authorization_callback — the fields read there are not determined; line 299 renders response — its full key set is built at run time

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:234 @004e72c`

<a id="area-g10"></a>

### CMS / admin

Admin views, edits, search, curation, reviews, member activity and exports. 55 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| GET | [`/users/:ref`](#api-136) | Users by ref |
| POST | [`/users/send_misuse_email`](#api-137) | Send misuse email |
| GET | [`/admin/users/:ref`](#api-138) | Users by ref |
| POST | [`/admin/approve_and_edit`](#api-139) | Approve and edit |
| POST | [`/admin/update_profile`](#api-140) | Update profile |
| POST | [`/admin/disapprove`](#api-141) | Disapprove |
| GET | [`/admin/pending/curation_tab`](#api-142) | Curation tab |
| GET | [`/admin/pending/vip_tab`](#api-143) | Vip tab |
| GET | [`/admin/pending/people_hni_tab`](#api-144) | People hni tab |
| POST | [`/admin/pending/people_hni_tab`](#api-145) | People hni tab update profiles |
| POST | [`/admin/pending/curation_tab_update_profiles_state`](#api-146) | Curation tab update profiles state |
| POST | [`/admin/pending/vip_tab_update_profiles_state`](#api-147) | Vip tab update profiles state |
| GET | [`/admin/images/list_multiple_profiles_v1`](#api-148) | List multiple profiles v1 |
| POST | [`/admin/images/images_updates_tab`](#api-149) | Images updates tab |
| GET | [`/admin/images/list_auto_updates_images`](#api-150) | List auto updates images |
| POST | [`/admin/images/auto_updates_images_update`](#api-151) | Auto updates images update |
| GET | [`/admin/images/list_multiple_profiles_disapproved_v1`](#api-152) | List multiple profiles disapproved v1 |
| POST | [`/admin/images/approve_reject_multiple_photos_v1`](#api-153) | Approve reject multiple photos v1 |
| POST | [`/admin/images/approve_reject_multiple_photos_disapproved`](#api-154) | Approve reject multiple photos disapproved |
| POST | [`/admin/images/mark_selfie_verified`](#api-155) | Mark selfie verified |
| GET | [`/admin/reviews/list_multiple`](#api-156) | List multiple |
| GET | [`/admin/reviews/fetch_individual`](#api-157) | Fetch individual |
| POST | [`/admin/reviews/update_multiple`](#api-158) | Update multiple |
| POST | [`/admin/reviews/save`](#api-159) | Reviews save |
| GET | [`/admin/member/search`](#api-160) | Member search |
| GET | [`/admin/member/aws_moderated_list`](#api-161) | Aws moderated list |
| GET | [`/admin/member/feed`](#api-162) | Feed |
| GET | [`/admin/member/fetch_complete_info`](#api-163) | Fetch complete info |
| GET | [`/admin/member/fetch_bait_profile_info`](#api-164) | Fetch bait profile info |
| GET | [`/admin/member/fetch_connected_profiles`](#api-165) | Fetch connected profiles |
| GET | [`/admin/member/user_activity_v1`](#api-166) | User activity v1 |
| POST | [`/admin/members/ban_profile`](#api-167) | Ban profile |
| POST | [`/admin/members/inappropriate_profile`](#api-168) | Inappropriate profile |
| POST | [`/admin/members/review_update`](#api-169) | Review update |
| GET | [`/admin/members/autofeed`](#api-170) | Autofeed |
| GET | [`/admin/members/retry_curation_bucket_list`](#api-171) | Retry curation bucket list |
| GET | [`/admin/members/fetch_verified_profile`](#api-172) | Fetch verified profile |
| POST | [`/admin/members/update_verified_profile`](#api-173) | Update verified profile |
| POST | [`/admin/members/refund_payment`](#api-174) | Refund payment |
| POST | [`/admin/members/toggle_subscription`](#api-175) | Toggle subscription |
| POST | [`/admin/members/capture_payment`](#api-176) | Capture payment |
| POST | [`/admin/members/correct_profile_location`](#api-177) | Correct profile location |
| GET | [`/admin/members/search_profiles`](#api-178) | Search profiles |
| GET | [`/admin/members/download_profile_details`](#api-179) | Download profile details |
| POST | [`/admin/members/approve_disapprove_banned_profiles`](#api-180) | Approve disapprove banned profiles |
| GET | [`/admin/connections/fetch_messages`](#api-181) | Fetch messages |
| POST | [`/admin/payments/subscription_transfer`](#api-182) | Subscription transfer |
| POST | [`/admin/payments/capture_android_payment`](#api-183) | Capture android payment |
| GET | [`/admin/stories`](#api-184) | Admin stories |
| GET | [`/admin/reports`](#api-185) | Admin reports |
| GET | [`/bangalore745/irl`](#api-192) | ActiveAdmin IRL content |
| POST | [`/admin/members/autofeed_update`](#api-209) | Members autofeed update |
| GET | [`/admin/member/fetch_spark_purchase_history`](#code-033) | Fetch spark purchase history |
| GET | [`/admin/members/download_account_data`](#code-034) | Download account data |
| GET | [`/admin/stories/fetch_deleted_reasons`](#code-035) | Fetch deleted reasons |

<a id="api-136"></a>

#### `GET /users/:ref` — Users by ref

**Users by ref.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS (browser session) · **Auth** Admin browser session cookie · **Operation** Read (admin) · **Code** `app/controllers/users_controller.rb; config/routes.rb#L418`

**Request**

Request fields: none

```bash
curl -i --request GET "https://testa2.aisle.co/users/${REF}" \
  --cookie "${ADMIN_SESSION_COOKIE}" \
  --header "Accept: application/json"
```

**End-to-end flow**

_Code path — First name, Email, Phone_

1. `Profile.get_specific_user_for_admin` — Admin (CMS) view of a profile.
2. `detailed_for_admin serializer`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-137"></a>

#### `POST /users/send_misuse_email` — Send misuse email

**Send misuse email.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS (browser session) · **Auth** Admin browser session cookie · **Operation** Admin action · **Code** `app/controllers/users_controller.rb; config/routes.rb#L420`

**Request**

Request fields: `ref`

```bash
curl -i --request POST "https://testa2.aisle.co/users/send_misuse_email" \
  --cookie "${ADMIN_SESSION_COOKIE}" \
  --header "X-CSRF-Token: ${CSRF_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `send_misuse_email`
2. `send_about_warning`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `send_misuse_email`
2. `send_about_warning`
3. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Requires a logged-in admin browser session and a pending review with warning allowance.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/users_controller.rb:36 @004e72c`

<a id="api-138"></a>

#### `GET /admin/users/:ref` — Users by ref

**Users by ref.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/pending_controller.rb; config/routes.rb#L569`

**Request**

Request fields: none

```bash
curl -i --request GET "https://testa2.aisle.co/admin/users/${REF}" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json"
```

**End-to-end flow**

_Code path — First name, Email, Phone_

1. `Profile.get_specific_user_for_admin` — Admin (CMS) view of a profile.
2. `detailed_for_admin serializer`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-139"></a>

#### `POST /admin/approve_and_edit` — Approve and edit

**Approve and edit.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Write / update PII · **Code** `app/controllers/admin/pending_controller.rb; config/routes.rb#L570`

**Request**

Request fields: `ref`, `first_name`, `gender`, `photos`, `photo`, `photo_id`, `can_save`, `date_of_birth`, `phone_code_id`, `fetch_only_number`, `about`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/approve_and_edit" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF",
  "first_name": "Asha",
  "gender": "Female",
  "photos": [
    {
      "photo": "$PHOTO_URL_1",
      "photo_id": "$PHOTO_ID_1",
      "can_save": true
    },
    {
      "photo": "$PHOTO_URL_2",
      "photo_id": "$PHOTO_ID_2",
      "can_save": true
    }
  ],
  "date_of_birth": "1996-01-15",
  "phone_code_id": "$PHONE_CODE_ID",
  "fetch_only_number": "1012345678",
  "about": "Synthetic profile story"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `approve_and_edit`
2. `update_profile_data`
3. `update_application_by_admin!`
4. `assign_first_name` — Normalises the name, writes it to the PII service (best effort) and sets the local field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Non-associate admin access is required for first-name edits. The separate local phone update does not write PHONE PII; see migration gaps.
- **Known limitation:** Admin phone edits change only the local number. The PII service keeps the old phone, which is shown when the phone switch is on.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/pending_controller.rb:39 @004e72c`

<a id="api-140"></a>

#### `POST /admin/update_profile` — Update profile

**Update profile.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Write / update PII · **Code** `app/controllers/admin/updated_controller.rb; config/routes.rb#L571`

**Request**

Request fields: `ref`, `first_name`, `gender`, `photos`, `photo`, `photo_id`, `can_save`, `date_of_birth`, `phone_code_id`, `fetch_only_number`, `about`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/update_profile" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF",
  "first_name": "Asha",
  "gender": "Female",
  "photos": [
    {
      "photo": "$PHOTO_URL_1",
      "photo_id": "$PHOTO_ID_1",
      "can_save": true
    },
    {
      "photo": "$PHOTO_URL_2",
      "photo_id": "$PHOTO_ID_2",
      "can_save": true
    }
  ],
  "date_of_birth": "1996-01-15",
  "phone_code_id": "$PHONE_CODE_ID",
  "fetch_only_number": "1012345678",
  "about": "Synthetic profile story"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `update_profile`
2. `update_profile_data`
3. `update_application_by_admin!`
4. `assign_first_name` — Normalises the name, writes it to the PII service (best effort) and sets the local field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Non-associate admin access is required for first-name edits. The separate local phone update does not write PHONE PII; see migration gaps.
- **Known limitation:** Admin phone edits change only the local number. The PII service keeps the old phone, which is shown when the phone switch is on.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/updated_controller.rb:5 @004e72c`

<a id="api-141"></a>

#### `POST /admin/disapprove` — Disapprove

**Disapprove.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/pending_controller.rb; config/routes.rb#L572`

**Request**

Request fields: `ref`, `isSuspicious`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/disapprove" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF",
  "isSuspicious": false
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `disapprove`
2. `disapprove_profile`
3. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/pending_controller.rb:49 @004e72c`

<a id="api-142"></a>

#### `GET /admin/pending/curation_tab` — Curation tab

**Curation tab.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/pending_controller.rb; config/routes.rb#L573`

**Request**

Request fields: `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/pending/curation_tab" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `curation_tab`
2. `pending_profile_list`
3. `curation_tab_pending`
4. `get_flags_raised`
5. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-143"></a>

#### `GET /admin/pending/vip_tab` — Vip tab

**Vip tab.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/pending_controller.rb; config/routes.rb#L574`

**Request**

Request fields: `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/pending/vip_tab" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `vip_tab`
2. `fetch_vip_users`
3. `curation_tab_pending`
4. `get_flags_raised`
5. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-144"></a>

#### `GET /admin/pending/people_hni_tab` — People hni tab

**People hni tab.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/pending_controller.rb; config/routes.rb#L575`

**Request**

Request fields: `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/pending/people_hni_tab" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `people_hni_tab`
2. `people_hni_tab_list`
3. `curation_tab_pending`
4. `get_flags_raised`
5. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-145"></a>

#### `POST /admin/pending/people_hni_tab` — People hni tab update profiles

**People hni tab update profiles.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/pending_controller.rb; config/routes.rb#L576`

**Request**

Request fields: `approve`, `ref`, `first_name`, `gender`, `photos`, `photo`, `photo_id`, `can_save`, `disapprove`, `inappropriate`, `banned`, `page`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/pending/people_hni_tab" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "photos": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "disapprove": [],
  "inappropriate": [],
  "banned": [],
  "page": 1
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `people_hni_tab_update_profiles`
2. `update_hni_registry`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Curation/VIP batch writes are processed asynchronously by Admin::Curation. HNI updates are immediate. Select a profile in the corresponding queue.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/pending_controller.rb:60 @004e72c`

<a id="api-146"></a>

#### `POST /admin/pending/curation_tab_update_profiles_state` — Curation tab update profiles state

**Curation tab update profiles state.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/pending_controller.rb; config/routes.rb#L577`

**Request**

Request fields: `approve`, `ref`, `first_name`, `gender`, `photos`, `photo`, `photo_id`, `can_save`, `disapprove`, `inappropriate`, `banned`, `page`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/pending/curation_tab_update_profiles_state" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "photos": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "disapprove": [],
  "inappropriate": [],
  "banned": [],
  "page": 1
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `curation_tab_update_profiles_state`
2. `add_to_list`
3. `pending_profile_list`
4. `curation_tab_pending`
5. `get_flags_raised`
6. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Curation/VIP batch writes are processed asynchronously by Admin::Curation. HNI updates are immediate. Select a profile in the corresponding queue.

<a id="api-147"></a>

#### `POST /admin/pending/vip_tab_update_profiles_state` — Vip tab update profiles state

**Vip tab update profiles state.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/pending_controller.rb; config/routes.rb#L580`

**Request**

Request fields: `approve`, `ref`, `first_name`, `gender`, `photos`, `photo`, `photo_id`, `can_save`, `disapprove`, `inappropriate`, `banned`, `page`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/pending/vip_tab_update_profiles_state" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "photos": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "disapprove": [],
  "inappropriate": [],
  "banned": [],
  "page": 1
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `vip_tab_update_profiles_state`
2. `add_to_list`
3. `pending_profile_list`
4. `curation_tab_pending`
5. `get_flags_raised`
6. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Curation/VIP batch writes are processed asynchronously by Admin::Curation. HNI updates are immediate. Select a profile in the corresponding queue.

<a id="api-148"></a>

#### `GET /admin/images/list_multiple_profiles_v1` — List multiple profiles v1

**List multiple profiles v1.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/images_controller.rb; config/routes.rb#L585`

**Request**

Request fields: `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/images/list_multiple_profiles_v1" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `list_multiple_profiles_v1`
2. `fetch_pending_image_list`
3. `pending_image_response_1`
4. `get_first_name_for_user` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-149"></a>

#### `POST /admin/images/images_updates_tab` — Images updates tab

**Images updates tab.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Write / update PII · **Code** `app/controllers/admin/images_controller.rb; config/routes.rb#L586`

**Request**

Request fields: `tab`, `approve`, `ref`, `first_name`, `gender`, `updated_images`, `photo`, `photo_id`, `can_save`, `reject`, `banned`, `inappropriate`, `page`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/images/images_updates_tab" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "tab": "updates",
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "updated_images": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "reject": [],
  "banned": [],
  "inappropriate": [],
  "page": 1
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `images_updates_tab`
2. `update_profile_images`
3. `assign_first_name` — Normalises the name, writes it to the PII service (best effort) and sets the local field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** First-name changes in approve/reject items require gender to be supplied as well. auto_updates_images_update forces tab=auto_updates_images.

<a id="api-150"></a>

#### `GET /admin/images/list_auto_updates_images` — List auto updates images

**List auto updates images.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/images_controller.rb; config/routes.rb#L587`

**Request**

Request fields: `page`, `date` (optional · from code — confirm with Dev)

```bash
curl -i --request GET "https://testa2.aisle.co/admin/images/list_auto_updates_images" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `list_auto_updates_images`
2. `fetch_pending_auto_updates_images`
3. `pending_image_response_1`
4. `get_first_name_for_user` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Request field added: `date` · from code — confirm with Dev · `app/controllers/admin/images_controller.rb:41 @004e72c`

<a id="api-151"></a>

#### `POST /admin/images/auto_updates_images_update` — Auto updates images update

**Auto updates images update.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Write / update PII · **Code** `app/controllers/admin/images_controller.rb; config/routes.rb#L588`

**Request**

Request fields: `tab`, `approve`, `ref`, `first_name`, `gender`, `updated_images`, `photo`, `photo_id`, `can_save`, `reject`, `banned`, `inappropriate`, `page`, `date` (optional · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/admin/images/auto_updates_images_update" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "tab": "updates",
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "updated_images": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "reject": [],
  "banned": [],
  "inappropriate": [],
  "page": 1
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `auto_updates_images_update`
2. `update_profile_images`
3. `assign_first_name` — Normalises the name, writes it to the PII service (best effort) and sets the local field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** First-name changes in approve/reject items require gender to be supplied as well. auto_updates_images_update forces tab=auto_updates_images.

**What changed**

- 2026-10-29 — Request field added: `date` · from code — confirm with Dev · `app/controllers/admin/images_controller.rb:48 @004e72c`

<a id="api-152"></a>

#### `GET /admin/images/list_multiple_profiles_disapproved_v1` — List multiple profiles disapproved v1

**List multiple profiles disapproved v1.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/images_controller.rb; config/routes.rb#L590`

**Request**

Request fields: `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/images/list_multiple_profiles_disapproved_v1" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `list_multiple_profiles_disapproved_v1`
2. `fetch_pending_image_update_disapproved_profile_list_2`
3. `curation_tab_disapproved`
4. `get_first_name_for_user` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-153"></a>

#### `POST /admin/images/approve_reject_multiple_photos_v1` — Approve reject multiple photos v1

**Approve reject multiple photos v1.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Write / update PII · **Code** `app/controllers/admin/images_controller.rb; config/routes.rb#L591`

**Request**

Request fields: `tab`, `approve`, `ref`, `first_name`, `gender`, `updated_images`, `photo`, `photo_id`, `can_save`, `reject`, `banned`, `inappropriate`, `page`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/images/approve_reject_multiple_photos_v1" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "tab": "updates",
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "updated_images": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "reject": [],
  "banned": [],
  "inappropriate": [],
  "page": 1
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `approve_reject_multiple_photos_v1`
2. `update_profile_images`
3. `assign_first_name` — Normalises the name, writes it to the PII service (best effort) and sets the local field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** First-name changes in approve/reject items require gender to be supplied as well. auto_updates_images_update forces tab=auto_updates_images.

**What changed**

- 2026-10-29 — Response field added: `page` · from code — confirm with Dev · `app/controllers/admin/images_controller.rb:55 @004e72c`
- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/images_controller.rb:55 @004e72c`

<a id="api-154"></a>

#### `POST /admin/images/approve_reject_multiple_photos_disapproved` — Approve reject multiple photos disapproved

**Approve reject multiple photos disapproved.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Write / update PII · **Code** `app/controllers/admin/images_controller.rb; config/routes.rb#L592`

**Request**

Request fields: `tab`, `approve`, `ref`, `first_name`, `gender`, `updated_images`, `photo`, `photo_id`, `can_save`, `reject`, `banned`, `inappropriate`, `page`, `approve_profile` (optional, array · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/admin/images/approve_reject_multiple_photos_disapproved" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "tab": "updates",
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "updated_images": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "reject": [],
  "banned": [],
  "inappropriate": [],
  "page": 1
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `approve_reject_multiple_photos_disapproved`
2. `assign_first_name` — Normalises the name, writes it to the PII service (best effort) and sets the local field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** First-name changes in approve/reject items require gender to be supplied as well. auto_updates_images_update forces tab=auto_updates_images.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/images_controller.rb:124 @004e72c`
- 2026-10-29 — Request field added: `approve_profile` · from code — confirm with Dev · `app/controllers/admin/images_controller.rb:107 @004e72c`

<a id="api-155"></a>

#### `POST /admin/images/mark_selfie_verified` — Mark selfie verified

**Mark selfie verified.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/images_controller.rb; config/routes.rb#L593`

**Request**

Request fields: `ref`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/images/mark_selfie_verified" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `mark_selfie_verified`
2. `verify_selfie_admin`
3. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/images_controller.rb:132 @004e72c`

<a id="api-156"></a>

#### `GET /admin/reviews/list_multiple` — List multiple

**List multiple.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/reviews_controller.rb; config/routes.rb#L600`

**Request**

Request fields: `page`, `message_type`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/reviews/list_multiple" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "message_type=story"
```

**Response fields** (top level; type not stated unless shown)

- `reviews` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)
- `total_pages` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `list_multiple`
2. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `total_pages` · from code — confirm with Dev · `app/controllers/admin/reviews_controller.rb:29 @004e72c`
- 2026-10-29 — Response field added: `page` · from code — confirm with Dev · `app/controllers/admin/reviews_controller.rb:29 @004e72c`
- 2026-10-29 — Response field added: `reviews` · from code — confirm with Dev · `app/controllers/admin/reviews_controller.rb:29 @004e72c`

<a id="api-157"></a>

#### `GET /admin/reviews/fetch_individual` — Fetch individual

**Fetch individual.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/reviews_controller.rb; config/routes.rb#L601`

**Request**

Request fields: `page`, `message_type`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/reviews/fetch_individual" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "message_type=story"
```

**Response fields** (top level; type not stated unless shown)

- `review_data` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)
- `total_pages` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `fetch_individual`
2. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Phone_

1. `fetch_individual`
2. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `total_pages` · from code — confirm with Dev · `app/controllers/admin/reviews_controller.rb:35 @004e72c`
- 2026-10-29 — Response field added: `page` · from code — confirm with Dev · `app/controllers/admin/reviews_controller.rb:35 @004e72c`
- 2026-10-29 — Response field added: `review_data` · from code — confirm with Dev · `app/controllers/admin/reviews_controller.rb:35 @004e72c`

<a id="api-158"></a>

#### `POST /admin/reviews/update_multiple` — Update multiple

**Update multiple.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/reviews_controller.rb; config/routes.rb#L602`

**Request**

Request fields: `profile_data_update_list`, `review_id`, `text`, `send_email`, `dismissed`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/reviews/update_multiple" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "profile_data_update_list": [
    {
      "review_id": "$REVIEW_ID",
      "text": "Synthetic corrected story",
      "send_email": true
    }
  ],
  "dismissed": []
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `update_multiple`
2. `update_individual`
3. `send_about_warning`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `update_multiple`
2. `update_individual`
3. `send_about_warning`
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/reviews_controller.rb:79 @004e72c`

<a id="api-159"></a>

#### `POST /admin/reviews/save` — Reviews save

**Reviews save.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/reviews_controller.rb; config/routes.rb#L605`

**Request**

Request fields: `review_id`, `text`, `send_email`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/reviews/save" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "review_id": "$REVIEW_ID",
  "text": "Synthetic corrected story",
  "send_email": true
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `save`
2. `update_individual`
3. `send_about_warning`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `save`
2. `update_individual`
3. `send_about_warning`
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/reviews_controller.rb:110 @004e72c`

<a id="api-160"></a>

#### `GET /admin/member/search` — Member search

**Member search.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Search · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L607`

**Request**

Request fields: `first_name`, `email`, `phone_number`, `page`, `invoice_id` (optional · from code — confirm with Dev)

```bash
curl -i --request GET "https://testa2.aisle.co/admin/member/search" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "first_name=Asha" \
  --data-urlencode "email=asha@example.com" \
  --data-urlencode "phone_number=1012345678" \
  --data-urlencode "page=1"
```

**Response fields** (top level; type not stated unless shown)

- `profile_list` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)
- `total_pages` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `search`
2. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `search`
2. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `search`
2. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Filters combine. First-name and email search use PII service search; phone search still uses local SQL. Run each filter separately as well as combined.
- **Known limitation:** First-name and email filters use PII-service search even when the read switches are off; phone search still uses the local table.

**What changed**

- 2026-10-29 — Response field added: `total_pages` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:25 @004e72c`
- 2026-10-29 — Response field added: `page` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:25 @004e72c`
- 2026-10-29 — Response field added: `profile_list` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:25 @004e72c`
- 2026-10-29 — Request field added: `invoice_id` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:5 @004e72c`

<a id="api-161"></a>

#### `GET /admin/member/aws_moderated_list` — Aws moderated list

**Aws moderated list.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L608`

**Request**

Request fields: `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/member/aws_moderated_list" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

**Response fields** (top level; type not stated unless shown)

- `moderation_list` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)
- `total_pages` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `aws_moderated_list`
2. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `total_pages` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:195 @004e72c`
- 2026-10-29 — Response field added: `page` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:195 @004e72c`
- 2026-10-29 — Response field added: `moderation_list` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:195 @004e72c`

<a id="api-162"></a>

#### `GET /admin/member/feed` — Feed

**Feed.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L609`

**Request**

Request fields: `page`, `type`, `profile_state` (optional · from code — confirm with Dev)

```bash
curl -i --request GET "https://testa2.aisle.co/admin/member/feed" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "type=auto_curate"
```

**Response fields** (top level; type not stated unless shown)

- `profile_list` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)
- `total_pages` (from code — confirm with Dev)
- `total_profiles` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `feed`
2. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `total_profiles` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:228 @004e72c`
- 2026-10-29 — Response field added: `total_pages` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:228 @004e72c`
- 2026-10-29 — Response field added: `page` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:228 @004e72c`
- 2026-10-29 — Response field added: `profile_list` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:228 @004e72c`
- 2026-10-29 — Request field added: `profile_state` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:202 @004e72c`

<a id="api-163"></a>

#### `GET /admin/member/fetch_complete_info` — Fetch complete info

**Fetch complete info.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Batch read · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L610`

**Request**

Request fields: `ref`, `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/member/fetch_complete_info" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "ref=$REF" \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `fetch_complete_info`
2. `fetch_complete_details`
3. `fetch_connected_users_info`
4. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

_Code path — Email_

1. `fetch_complete_info`
2. `fetch_complete_details`
3. `admin_complete_details` — Admin (CMS) view of a profile.
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `fetch_complete_info`
2. `fetch_complete_details`
3. `admin_complete_details` — Admin (CMS) view of a profile.
4. `fetch_only_number_with_phone_code_name` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.
5. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-164"></a>

#### `GET /admin/member/fetch_bait_profile_info` — Fetch bait profile info

**Fetch bait profile info.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Batch read · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L615`

**Request**

Request fields: `state`, `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/member/fetch_bait_profile_info" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "state=pending" \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `fetch_bait_profile_info`
2. `fetch_by_latest_interaction`
3. `fetch_complete_details`
4. `fetch_connected_users_info`
5. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

_Code path — Email_

1. `fetch_bait_profile_info`
2. `fetch_by_latest_interaction`
3. `fetch_complete_details`
4. `admin_complete_details` — Admin (CMS) view of a profile.
5. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `fetch_bait_profile_info`
2. `fetch_by_latest_interaction`
3. `fetch_complete_details`
4. `admin_complete_details` — Admin (CMS) view of a profile.
5. `fetch_only_number_with_phone_code_name` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.
6. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Returns the latest interaction feed; ref is not a filter for this action.

<a id="api-165"></a>

#### `GET /admin/member/fetch_connected_profiles` — Fetch connected profiles

**Fetch connected profiles.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Batch read · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L616`

**Request**

Request fields: `ref`, `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/member/fetch_connected_profiles" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "ref=$REF" \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `fetch_connected_profiles`
2. `fetch_connected_users_info`
3. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-166"></a>

#### `GET /admin/member/user_activity_v1` — User activity v1

**User activity v1.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L617`

**Request**

Request fields: `ref`, `filter`, `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/member/user_activity_v1" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "ref=$REF" \
  --data-urlencode "filter=likes_sent" \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `user_activity_v1`
2. `user_reported_activity`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Repeat for likes_received, likes_passed, likes_linked, likes_connection, replies_sent, invites_sent, replies_received, invites_received, replies_linked, replies_connection, blocked_by, blocked_self, reports, invites_sent_accepted, invites_received_accepted, invites_sent_passed, invites_received_passed, user_passed.

<a id="api-167"></a>

#### `POST /admin/members/ban_profile` — Ban profile

**Ban profile.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L619`

**Request**

Request fields: `ref`, `reason`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/members/ban_profile" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF",
  "reason": "Synthetic moderation test"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `ban_profile`
2. `ban_user`
3. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:158 @004e72c`

<a id="api-168"></a>

#### `POST /admin/members/inappropriate_profile` — Inappropriate profile

**Inappropriate profile.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L620`

**Request**

Request fields: `ref`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/members/inappropriate_profile" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `inappropriate_profile`
2. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
3. `create_profile_response` — Rebuilds or reads the cached profile response.
4. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:170 @004e72c`

<a id="api-169"></a>

#### `POST /admin/members/review_update` — Review update

**Review update.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L621`

**Request**

Request fields: `review_failed_refs`, `review_passed_refs`, `image_updates`, `skip_render` (optional · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/admin/members/review_update" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "review_failed_refs": [],
  "review_passed_refs": [
    "$REF"
  ],
  "image_updates": []
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `review_update`
2. `approveImages`
3. `sync_profile_to_kafka` — Publishes the updated profile to Kafka (only in some states).
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** The changed name access is in conditional profile-save/image-cache side effects.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:300 @004e72c`
- 2026-10-29 — Request field added: `skip_render` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:299 @004e72c`

<a id="api-170"></a>

#### `GET /admin/members/autofeed` — Autofeed

**Autofeed.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L622`

**Request**

Request fields: `page`, `profile_state`, `bucket` (optional · from code — confirm with Dev), `date` (optional · from code — confirm with Dev)

```bash
curl -i --request GET "https://testa2.aisle.co/admin/members/autofeed" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "profile_state=approved"
```

**Response fields** (top level; type not stated unless shown)

- `profiles` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)
- `total_pages` (from code — confirm with Dev)
- `total_profiles` (from code — confirm with Dev)
- `total_profiles_all_states` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `autofeed`
2. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `total_profiles_all_states` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:348 @004e72c`
- 2026-10-29 — Response field added: `total_profiles` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:348 @004e72c`
- 2026-10-29 — Response field added: `total_pages` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:348 @004e72c`
- 2026-10-29 — Response field added: `page` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:348 @004e72c`
- 2026-10-29 — Response field added: `profiles` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:348 @004e72c`
- 2026-10-29 — Request field added: `date` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:308 @004e72c`
- 2026-10-29 — Request field added: `bucket` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:307 @004e72c`

<a id="api-171"></a>

#### `GET /admin/members/retry_curation_bucket_list` — Retry curation bucket list

**Retry curation bucket list.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L624`

**Request**

Request fields: `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/members/retry_curation_bucket_list" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `retry_curation_bucket_list`
2. `fetch_failed_review_profile_list`
3. `curation_tab_pending`
4. `get_flags_raised`
5. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-172"></a>

#### `GET /admin/members/fetch_verified_profile` — Fetch verified profile

**Fetch verified profile.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L625`

**Request**

Request fields: `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/members/fetch_verified_profile" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `fetch_verified_profile`
2. `fetch_verified_not_admin_approved_profiles_list`
3. `verified_account`
4. `curation_tab_pending`
5. `get_flags_raised`
6. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-173"></a>

#### `POST /admin/members/update_verified_profile` — Update verified profile

**Update verified profile.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L626`

**Request**

Request fields: `approve`, `disapprove`, `ban`, `page`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/members/update_verified_profile" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "approve": [
    "$REF"
  ],
  "disapprove": [],
  "ban": [],
  "page": 1
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `update_verified_profile`
2. `update_verified_profiles_list`
3. `fill_cache!` — Rebuilds or reads the cached profile response.
4. `create_profile_response` — Rebuilds or reads the cached profile response.
5. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
6. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-174"></a>

#### `POST /admin/members/refund_payment` — Refund payment

**Refund payment.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L628`

**Request**

Request fields: `otp`, `order_id`, `payment_gateway`, `is_partial_refund`, `refund_reason`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/members/refund_payment" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "otp": "$ADMIN_OTP",
  "order_id": "$ORDER_ID",
  "payment_gateway": "$PAYMENT_GATEWAY_ENUM",
  "is_partial_refund": false,
  "refund_reason": "Synthetic test refund"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `message` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `refund_payment`
2. `initiate_refund`
3. `refund_subscription`
4. `check_for_duplicate_payments`
5. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
6. `fill_cache!` — Rebuilds or reads the cached profile response.
7. `create_profile_response` — Rebuilds or reads the cached profile response.
8. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
9. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `message` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:401 @004e72c`
- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:401 @004e72c`

<a id="api-175"></a>

#### `POST /admin/members/toggle_subscription` — Toggle subscription

**Toggle subscription.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L631`

**Request**

Request fields: `id`, `end_date`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/members/toggle_subscription" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "id": "$SUBSCRIPTION_ID",
  "end_date": "31/12/2026"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `is_active` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `toggle_subscription`
2. `fill_cache!` — Rebuilds or reads the cached profile response.
3. `create_profile_response` — Rebuilds or reads the cached profile response.
4. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
5. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** end_date is required when enabling an inactive subscription. Toggling an active subscription removes it.

**What changed**

- 2026-10-29 — Response field added: `is_active` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:468 @004e72c`
- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:468 @004e72c`

<a id="api-176"></a>

#### `POST /admin/members/capture_payment` — Capture payment

**Capture payment.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L633`

**Request**

Request fields: `ref`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/members/capture_payment" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `message` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `capture_payment`
2. `cms_restore_purchase`
3. `restore_purchase`
4. `validate_receipt_data`
5. `validate_ios_consumable_response`
6. `activate_any_subscription` — Activates a subscription after a successful payment.
7. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
8. `fill_cache!` — Rebuilds or reads the cached profile response.
9. `create_profile_response` — Rebuilds or reads the cached profile response.
10. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
11. `select_f…`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed**

- 2026-10-29 — Response field added: `message` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:579 @004e72c`
- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:579 @004e72c`

<a id="api-177"></a>

#### `POST /admin/members/correct_profile_location` — Correct profile location

**Correct profile location.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Batch read · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L634`

**Request**

Request fields: `ref`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/members/correct_profile_location" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `correct_profile_location`
2. `fetch_complete_details`
3. `fetch_connected_users_info`
4. `get_first_names_for_users` — Loads first names for many profiles in one go; keeps the cached name if the PII service returns nothing.

_Code path — Email_

1. `correct_profile_location`
2. `fetch_complete_details`
3. `admin_complete_details` — Admin (CMS) view of a profile.
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `correct_profile_location`
2. `fetch_complete_details`
3. `admin_complete_details` — Admin (CMS) view of a profile.
4. `fetch_only_number_with_phone_code_name` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.
5. `fetch_only_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** The server recalculates the location; this action does not consume caller-supplied latitude/longitude.

<a id="api-178"></a>

#### `GET /admin/members/search_profiles` — Search profiles

**Search profiles.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Search · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L636`

**Request**

Request fields: `first_name`, `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/members/search_profiles" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "first_name=Asha" \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `search_profiles`
2. `search_profiles_by_params`
3. `profile_response_cms` — Admin (CMS) view of a profile.
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Known limitation:** Filters first names locally but shows the PII-service name in the results, so the two can differ.

<a id="api-179"></a>

#### `GET /admin/members/download_profile_details` — Download profile details

**Download profile details.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L637`

**Request**

Request fields: `ref`, `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/members/download_profile_details" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "ref=$REF" \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `download_profile_details`
2. `fetch_profile_data_cms`
3. `create_profile_json_for_cyber_cell`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `download_profile_details`
2. `fetch_profile_data_cms`
3. `create_profile_json_for_cyber_cell`
4. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `download_profile_details`
2. `fetch_profile_data_cms`
3. `create_profile_json_for_cyber_cell`
4. `fetch_mobile_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-180"></a>

#### `POST /admin/members/approve_disapprove_banned_profiles` — Approve disapprove banned profiles

**Approve disapprove banned profiles.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Write / update PII · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L639`

**Request**

Request fields: `type`, `approve`, `ref`, `first_name`, `gender`, `photos`, `photo`, `photo_id`, `can_save`, `disapprove`, `inappropriate`, `editedImages`, `banned`, `visible_refs`, `moveToFeed`, `skip_render` (optional · from code — confirm with Dev)

```bash
curl -i --request POST "https://testa2.aisle.co/admin/members/approve_disapprove_banned_profiles" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "type": "auto_curate",
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "photos": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "disapprove": [],
  "inappropriate": [],
  "editedImages": [],
  "banned": [],
  "visible_refs": [],
  "moveToFeed": false
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

1. `approve_disapprove_banned_profiles`
2. `approve_profile`
3. `assign_first_name` — Normalises the name, writes it to the PII service (best effort) and sets the local field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Use type=auto_curate to exercise the changed first-name assignment in the auto-curated batch path. Test approve, disapprove, inappropriate and editedImages with separate profiles.

**What changed**

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:723 @004e72c`
- 2026-10-29 — Request field added: `skip_render` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:722 @004e72c`

<a id="api-181"></a>

#### `GET /admin/connections/fetch_messages` — Fetch messages

**Fetch messages.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/connections_controller.rb; config/routes.rb#L645`

**Request**

Request fields: `current_user_ref`, `other_user_ref`, `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/connections/fetch_messages" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "current_user_ref=$REF" \
  --data-urlencode "other_user_ref=$OTHER_REF" \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `fetch_messages`
2. `fetch_two_user_connection_details`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-182"></a>

#### `POST /admin/payments/subscription_transfer` — Subscription transfer

**Subscription transfer.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/payments_controller.rb; config/routes.rb#L650`

**Request**

Request fields: `old_user_ref`, `new_user_ref`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/payments/subscription_transfer" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "old_user_ref": "$REF",
  "new_user_ref": "$OTHER_REF"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `subscription_transfer`
2. `transfer_active_subscription`
3. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
4. `fill_cache!` — Rebuilds or reads the cached profile response.
5. `create_profile_response` — Rebuilds or reads the cached profile response.
6. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
7. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-183"></a>

#### `POST /admin/payments/capture_android_payment` — Capture android payment

**Capture android payment.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Admin action · **Code** `app/controllers/admin/payments_controller.rb; config/routes.rb#L651`

**Request**

Request fields: `ref`, `product_id`, `purchase_token`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/payments/capture_android_payment" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF",
  "product_id": "$PRODUCT_ID",
  "purchase_token": "$PURCHASE_TOKEN"
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `capture_android_payment`
2. `capture_android_payment_cms`
3. `verify_android_payment`
4. `add_consummable_or_subscription`
5. `add_subscription_data`
6. `activate_any_subscription_with_expiry` — Activates a subscription after a successful payment.
7. `fill_cache!` — Rebuilds or reads the cached profile response.
8. `create_profile_response` — Rebuilds or reads the cached profile response.
9. `general_information` — Builds the “general information” block of a profile (own_ = the owner’s view, which includes email and phone).
10. `select_first_name` — Picks the first name to show to other people — respects the hide-name setting.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `Google Play` | called |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="api-184"></a>

#### `GET /admin/stories` — Admin stories

**Admin stories.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/stories_controller.rb; config/routes.rb#L661`

**Request**

Request fields: `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/stories" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `index`
2. `fetch_all`
3. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

_Code path — Email_

1. `index`
2. `fetch_all`
3. `fetch_email` — Reads the email: needs a local email_id, then reads the PII service when ALLOW_PII_EMAIL_READ is on.

_Code path — Phone_

1. `index`
2. `fetch_all`
3. `fetch_mobile_number` — Reads the phone: national number from the PII service when ALLOW_PII_PHONE_NUMBER_READ is on; the country code is always local.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Deleted-account stories include name, email and full phone via profile helpers.

<a id="api-185"></a>

#### `GET /admin/reports` — Admin reports

**Admin reports.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/reports_controller.rb; config/routes.rb#L662`

**Request**

Request fields: `page`

```bash
curl -i --request GET "https://testa2.aisle.co/admin/reports" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

**End-to-end flow**

_Code path — First name_

1. `index`
2. `fetch_all`
3. `fetch_by_latest_reported`
4. `get_first_name` — Reads one first name: from the PII service when ALLOW_PII_FIRST_NAME_READ is on, otherwise the local profile field.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Reporter and reported-profile names use get_first_name.

<a id="api-192"></a>

#### `GET /bangalore745/irl` — ActiveAdmin IRL content

**ActiveAdmin IRL content.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

**Called by** CMS (browser session) · **Auth** Admin browser session cookie · **Operation** Read (admin) · **Code** `app/admin/irl.rb`

**Request**

Request fields: none

```bash
curl -i --request GET "https://testa2.aisle.co/bangalore745/irl" \
  --cookie "${ADMIN_SESSION_COOKIE}" \
  --header "Accept: text/html"
```

**End-to-end flow**

_Code path — First name, Email, Phone_

1. `ActiveAdmin IRL content`
2. `get_first_name / fetch_email / fetch_mobile_number`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| App database | `account_emails.name (via profiles.email_id)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** HTML ActiveAdmin page, not a JSON API. Requires a browser session with admin-level access.

<a id="api-209"></a>

#### `POST /admin/members/autofeed_update` — Members autofeed update

**Members autofeed update.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (writes), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Write / update PII · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L623`

**Request**

Request fields: `approve`, `ref`, `first_name`, `gender`, `photos`, `photo`, `photo_id`, `can_save`, `reject`, `inappropriate`, `page`

```bash
curl -i --request POST "https://testa2.aisle.co/admin/members/autofeed_update" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "photos": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "reject": [],
  "inappropriate": [],
  "page": 1
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `MembersController.autofeed_update`
2. `auto_curated_profiles`
3. `assign_first_name; normalized approve/reject/inappropriate arrays`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** The controller normalizes approve/reject/inappropriate and forces type=auto_curate, moveToFeed=true. Repeat with reject and inappropriate decisions on separate profiles.

<a id="code-033"></a>

#### `GET /admin/member/fetch_spark_purchase_history` — Fetch spark purchase history

**Fetch spark purchase history.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L662`

**Request**

Request fields: `ref` (optional · from code — confirm with Dev)

**Response fields** (top level; type not stated unless shown)

- `spark_purchase_history` (from code — confirm with Dev)

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:662` @004e72c → `admin/members#fetch_spark_purchase_history` (`app/controllers/admin/members_controller.rb:83 @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:662 @004e72c`

<a id="code-034"></a>

#### `GET /admin/members/download_account_data` — Download account data

**Download account data.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L686`

**Request**

Request fields: `export_id` (optional · from code — confirm with Dev), `ref` (optional · from code — confirm with Dev)

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `export_id` (from code — confirm with Dev)
- `reused` (from code — confirm with Dev)

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:686` @004e72c → `admin/members#download_account_data` (`app/controllers/admin/members_controller.rb:604 @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:686 @004e72c`

<a id="code-035"></a>

#### `GET /admin/stories/fetch_deleted_reasons` — Fetch deleted reasons

**Fetch deleted reasons.** Found in the Aisle code; not yet in a Dev API document — from code, confirm with Dev.

Purpose and personal data: not stated.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** not stated · **Auth** not stated · **Operation** not stated · **Code** `app/controllers/admin/stories_controller.rb; config/routes.rb#L704`

**Request**

Request fields: none

**End-to-end flow**

Not stated.

**What it reads and writes**

Not stated.

**Good to know**

- **From code — confirm with Dev:** Found in `config/routes.rb:704` @004e72c → `admin/stories#fetch_deleted_reasons` (`app/controllers/admin/stories_controller.rb:8 @004e72c`). No Dev API document lists this route yet, so its purpose, authentication, caller, personal data, flow and data stores are not stated.
- **Not determined from the code:** line 10 renders response — its full key set is built at run time

**What changed**

- 2026-10-29 — Endpoint added (found in code) · from code — confirm with Dev · `config/routes.rb:704 @004e72c`

<a id="area-m1"></a>

### PII service (direct)

Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness. 13 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| POST | [`/V1/api/v1/pii-test`](#api-199) | PII service |
| POST | [`/V1/api/v1/pii-test/read`](#api-200) | Read |
| POST | [`/V1/api/v1/pii-test/batch/read`](#api-201) | Batch read |
| POST | [`/V1/api/v1/pii-test/NAME/search`](#api-202) | NAME search |
| POST | [`/V1/api/v1/pii-test/EMAIL/search`](#api-203) | EMAIL search |
| POST | [`/V1/api/v1/pii-test/PHONE/search`](#api-204) | PHONE search |
| POST | [`/V1/api/v1/pii-test/transient/phones`](#api-205) | Transient phones |
| POST | [`/V1/api/v1/pii-test/transient/phones/resolve`](#api-206) | Phones resolve |
| POST | [`/V1/api/v1/pii-test/transient/phones/promote`](#api-207) | Phones promote |
| GET | [`/V1/api/v1/pii-test/health/ready`](#api-210) | Health ready |
| POST | [`/V1/api/v1/pii-test/free-text/keys`](#api-211) | Free-text keys |
| POST | [`/V1/api/v1/pii-test/free-text/keys/read`](#api-212) | Keys read |
| POST | [`/V1/api/v1/pii-test/free-text/keys/revoke`](#m1-revokefreetextkey) | Keys revoke |

<a id="api-199"></a>

#### `POST /V1/api/v1/pii-test` — PII service

**PII service.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: First name (writes), Email (writes), Phone (writes), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct)

**Request**

Request fields: `user_id`, `field`, `value`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/api/v1/pii-test" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "$USER_ID",
  "field": "PHONE",
  "value": "1012345678"
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)
- `data` (seen on staging 2026-10-25)
- `error` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `PiiTestController` — PII test-route controller (TEST_TOKEN).
2. `ProxyClient` — Signs the request and forwards it to the PII service; skips the app’s caches.
3. `NAME service contract`

_Code path — Email_

1. `PiiTestController` — PII test-route controller (TEST_TOKEN).
2. `ProxyClient` — Signs the request and forwards it to the PII service; skips the app’s caches.
3. `EMAIL service contract`

_Code path — Phone_

1. `PiiTestController` — PII test-route controller (TEST_TOKEN).
2. `ProxyClient` — Signs the request and forwards it to the PII service; skips the app’s caches.
3. `PHONE service contract`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| PII database | `user_pii_field_value (field_name = EMAIL)` | write (upsert) |
| PII database | `user_pii_field_value (field_name = PHONE)` | write (upsert) |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Tip:** Writes through these routes go straight to the PII service and skip the app’s caches — app screens can keep showing the old value until the cache expires.

**What changed**

- 2026-10-25 — Response field added: `error` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-200"></a>

#### `POST /V1/api/v1/pii-test/read` — Read

**Read.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: First name (reads), Email (reads), Phone (reads), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct)

**Request**

Request fields: `user_id`, `field_names`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/api/v1/pii-test/read" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "$USER_ID",
  "field_names": [
    "PHONE"
  ]
}
JSON
```

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)
- `data` (seen on staging 2026-10-25)
- `error` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

1. `PiiTestController` — PII test-route controller (TEST_TOKEN).
2. `ProxyClient` — Signs the request and forwards it to the PII service; skips the app’s caches.
3. `NAME service contract`

_Code path — Email_

1. `PiiTestController` — PII test-route controller (TEST_TOKEN).
2. `ProxyClient` — Signs the request and forwards it to the PII service; skips the app’s caches.
3. `EMAIL service contract`

_Code path — Phone_

1. `PiiTestController` — PII test-route controller (TEST_TOKEN).
2. `ProxyClient` — Signs the request and forwards it to the PII service; skips the app’s caches.
3. `PHONE service contract`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Tip:** Writes through these routes go straight to the PII service and skip the app’s caches — app screens can keep showing the old value until the cache expires.

**What changed**

- 2026-10-25 — Response field added: `error` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25

<a id="api-201"></a>

#### `POST /V1/api/v1/pii-test/batch/read` — Batch read

**Batch read.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: First name (reads), Email (reads), Phone (reads), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct)

**Request**

Request fields: `user_ids`, `fields`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/api/v1/pii-test/batch/read" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_ids": [
    "$USER_ID",
    "$OTHER_USER_ID"
  ],
  "fields": [
    "PHONE"
  ]
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `PiiTestController` — PII test-route controller (TEST_TOKEN).
2. `ProxyClient` — Signs the request and forwards it to the PII service; skips the app’s caches.
3. `NAME service contract`

_Code path — Email_

1. `PiiTestController` — PII test-route controller (TEST_TOKEN).
2. `ProxyClient` — Signs the request and forwards it to the PII service; skips the app’s caches.
3. `EMAIL service contract`

_Code path — Phone_

1. `PiiTestController` — PII test-route controller (TEST_TOKEN).
2. `ProxyClient` — Signs the request and forwards it to the PII service; skips the app’s caches.
3. `PHONE service contract`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Tip:** Writes through these routes go straight to the PII service and skip the app’s caches — app screens can keep showing the old value until the cache expires.

<a id="api-202"></a>

#### `POST /V1/api/v1/pii-test/NAME/search` — NAME search

**NAME search.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: First name (reads), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct) · **Code** `config/routes.rb`

**Request**

Request fields: `value`, `limit`, `include_values`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/api/v1/pii-test/NAME/search" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "value": "Asha",
  "limit": 10,
  "include_values": false
}
JSON
```

**End-to-end flow**

_Code path — First name_

1. `PiiTestController` — PII test-route controller (TEST_TOKEN).
2. `ProxyClient` — Signs the request and forwards it to the PII service; skips the app’s caches.
3. `NAME service contract`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| First name | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.
- **Tip:** Writes through these routes go straight to the PII service and skip the app’s caches — app screens can keep showing the old value until the cache expires.

<a id="api-203"></a>

#### `POST /V1/api/v1/pii-test/EMAIL/search` — EMAIL search

**EMAIL search.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: Email (reads), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct) · **Code** `config/routes.rb`

**Request**

Request fields: `value`, `limit`, `include_values`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/api/v1/pii-test/EMAIL/search" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "value": "asha@example.com",
  "limit": 10,
  "include_values": false
}
JSON
```

**End-to-end flow**

_Code path — Email_

1. `PiiTestController` — PII test-route controller (TEST_TOKEN).
2. `ProxyClient` — Signs the request and forwards it to the PII service; skips the app’s caches.
3. `EMAIL service contract`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| Email | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.
- **Tip:** Writes through these routes go straight to the PII service and skip the app’s caches — app screens can keep showing the old value until the cache expires.

<a id="api-204"></a>

#### `POST /V1/api/v1/pii-test/PHONE/search` — PHONE search

**PHONE search.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: Phone (reads), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct) · **Code** `config/routes.rb`

**Request**

Request fields: `value`, `limit`, `include_values`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/api/v1/pii-test/PHONE/search" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "value": "1012345678",
  "limit": 10,
  "include_values": false
}
JSON
```

**End-to-end flow**

_Code path — Phone_

1. `PiiTestController` — PII test-route controller (TEST_TOKEN).
2. `ProxyClient` — Signs the request and forwards it to the PII service; skips the app’s caches.
3. `PHONE service contract`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.
- **Tip:** Writes through these routes go straight to the PII service and skip the app’s caches — app screens can keep showing the old value until the cache expires.

<a id="api-205"></a>

#### `POST /V1/api/v1/pii-test/transient/phones` — Transient phones

**Transient phones.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: Phone (reads), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct) · **Code** `app/controllers/v1/pii_test_controller.rb; config/routes.rb#L29`

**Request**

Request fields: `phone`, `ttl_seconds`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/api/v1/pii-test/transient/phones" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "phone": "+911012345678",
  "ttl_seconds": 300
}
JSON
```

**End-to-end flow**

_Code path — Phone_

1. `PiiTestController transient-phone proxy; separate from normal OTP/login`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.
- **Tip:** Writes through these routes go straight to the PII service and skip the app’s caches — app screens can keep showing the old value until the cache expires.

<a id="api-206"></a>

#### `POST /V1/api/v1/pii-test/transient/phones/resolve` — Phones resolve

**Phones resolve.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: Phone (reads), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct) · **Code** `app/controllers/v1/pii_test_controller.rb; config/routes.rb#L30`

**Request**

Request fields: `transient_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/api/v1/pii-test/transient/phones/resolve" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "transient_id": "$TRANSIENT_ID"
}
JSON
```

**End-to-end flow**

_Code path — Phone_

1. `PiiTestController transient-phone proxy; separate from normal OTP/login`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.
- **Tip:** Writes through these routes go straight to the PII service and skip the app’s caches — app screens can keep showing the old value until the cache expires.

<a id="api-207"></a>

#### `POST /V1/api/v1/pii-test/transient/phones/promote` — Phones promote

**Phones promote.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: Phone (reads), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct) · **Code** `app/controllers/v1/pii_test_controller.rb; config/routes.rb#L31`

**Request**

Request fields: `transient_id`, `user_id`

```bash
curl -i --request POST "https://testa2.aisle.co/V1/api/v1/pii-test/transient/phones/promote" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "transient_id": "$TRANSIENT_ID",
  "user_id": "$USER_ID"
}
JSON
```

**End-to-end flow**

_Code path — Phone_

1. `PiiTestController transient-phone proxy; separate from normal OTP/login`

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.
- **Tip:** Writes through these routes go straight to the PII service and skip the app’s caches — app screens can keep showing the old value until the cache expires.

<a id="api-210"></a>

#### `GET /V1/api/v1/pii-test/health/ready` — Health ready

**Health ready.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

It does not read or write personal data itself.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct) · **Code** `Aisle PII facade (Milestone 1) — see m1/docs/aisle-api.md`

**Request**

Request fields: none

```bash
curl -i -X GET "https://testa2.aisle.co/V1/api/v1/pii-test/health/ready" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}"
```

**End-to-end flow**

1. `Request with free text` — Free-text encryption (Dev free-text API list (2026-10-23)): PII facade readiness (Milestone 1 route)
2. `PII service — free-text key` — Aisle creates or fetches an AES-256-GCM key; the text itself never goes to the PII service.
3. `Aisle encrypts / decrypts the text` — The encrypted text and its key_id are kept in the app database.

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| — | `—` | — |

**Good to know**

- **From the developers:** PII facade readiness (Milestone 1 route)

<a id="api-211"></a>

#### `POST /V1/api/v1/pii-test/free-text/keys` — Free-text keys

**Free-text keys.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: Free text (writes), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct) · **Code** `Aisle PII facade (Milestone 1) — see m1/docs/aisle-api.md`

**Request**

Request fields: none

```bash
curl -i -X POST "https://testa2.aisle.co/V1/api/v1/pii-test/free-text/keys" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
}
JSON
```

**End-to-end flow**

_Free-text encryption — Free text_

1. `Request with free text` — Free-text encryption (Dev free-text API list (2026-10-23)): Create a free-text key (Milestone 1 route)
2. `PII service — free-text key` — Aisle creates or fetches an AES-256-GCM key; the text itself never goes to the PII service.
3. `Aisle encrypts / decrypts the text` — The encrypted text and its key_id are kept in the app database.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| Free text | `—` | Encrypted by Aisle with a key from the PII service; there is no read switch. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `free_text_encryption_key` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Create a free-text key (Milestone 1 route)

<a id="api-212"></a>

#### `POST /V1/api/v1/pii-test/free-text/keys/read` — Keys read

**Keys read.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: Free text (reads), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct) · **Code** `Aisle PII facade (Milestone 1) — see m1/docs/aisle-api.md`

**Request**

Request fields: `key_id`

```bash
curl -i -X POST "https://testa2.aisle.co/V1/api/v1/pii-test/free-text/keys/read" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "key_id": "${FREE_TEXT_KEY_ID}"
}
JSON
```

**End-to-end flow**

_Free-text encryption — Free text_

1. `Request with free text` — Free-text encryption (Dev free-text API list (2026-10-23)): Read a free-text key by key_id (Milestone 1)
2. `PII service — free-text key` — Aisle creates or fetches an AES-256-GCM key; the text itself never goes to the PII service.
3. `Aisle encrypts / decrypts the text` — The encrypted text and its key_id are kept in the app database.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| Free text | `—` | Encrypted by Aisle with a key from the PII service; there is no read switch. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `free_text_encryption_key` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Read a free-text key by key_id (Milestone 1)

<a id="m1-revokefreetextkey"></a>

#### `POST /V1/api/v1/pii-test/free-text/keys/revoke` — Keys revoke

**Keys revoke.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: Free text (writes), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII service (direct) · **Code** `PII service route (Aisle facade)`

**Request**

Request fields: `key_id`

```bash
curl -i -X POST "https://testa2.aisle.co/V1/api/v1/pii-test/free-text/keys/revoke" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "key_id": "${FREE_TEXT_KEY_ID}"
}
JSON
```

**End-to-end flow**

_Free-text encryption — Free text_

1. `Request with free text` — RevokeFreeTextKey
2. `PII service — free-text key` — Aisle creates or fetches an AES-256-GCM key; the text itself never goes to the PII service.
3. `Aisle encrypts / decrypts the text` — The encrypted text and its key_id are kept in the app database.

**Read switches**

| Field | Read switch | Behaviour |
| --- | --- | --- |
| Free text | `—` | Encrypted by Aisle with a key from the PII service; there is no read switch. |

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `free_text_encryption_key` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |
