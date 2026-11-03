<!-- GENERATED FILE — do not edit by hand. Source: PII_Automation_Framework scripts/api-docs/export.ts · `npm run docs:api` -->

# Aisle API Documentation

Every Aisle API: what it does, how to call it, the path a request takes through the code, and which data it reads and writes. 588 endpoints · staging `https://testa2.aisle.co` · generated 2026-11-03.

The same content is published as a website from the [API_Guide](https://github.com/vidheybhogadi/API_Guide) repository.

This Markdown is a digest that GitHub can render: example requests (curl), step explanations and full change histories are on the [website](https://aisleapidocs.netlify.app/), and endpoints documented from the code (marked _from code_ below) are listed here and described there.

## Contents

- Guides: [How a request travels](#architecture) · [Authentication](#authentication) · [Personal data](#personal-data) · [Where the data lives](#data-stores) · [Glossary](#glossary)
- [First-name service routes](#area-g1) — 5 endpoints
- [Sign-up, login & account](#area-g2) — 26 endpoints
- [Profiles](#area-g3) — 14 endpoints
- [Lists & discovery](#area-g4) — 26 endpoints
- [Interactions, chat & live audio](#area-g5) — 55 endpoints
- [Profile updates](#area-g6) — 53 endpoints
- [Payments — checkout](#area-g7) — 29 endpoints
- [Payments — verification](#area-g8) — 49 endpoints
- [Provider callbacks](#area-g9) — 22 endpoints
- [CMS / admin](#area-g10) — 93 endpoints
- [PII service (direct)](#area-m1) — 13 endpoints
- [App config & integrations](#area-g11) — 68 endpoints
- [Internal dashboard](#area-g12) — 135 endpoints

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
| CMS admin token + `webcms: true` | 88 CMS endpoints | An OTP-verified admin with permission for the action. |
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
| First name | 214 | `ALLOW_PII_FIRST_NAME_READ` | On: read from the PII service, with no fallback to the local field. Off: the local profile field. Writes go to both. |
| Email | 60 | `ALLOW_PII_EMAIL_READ` | Needs a local email_id first. On: read from the PII service. Onboarding is the only email write. |
| Phone | 72 | `ALLOW_PII_PHONE_NUMBER_READ` | On: national number from the PII service plus the local country code. Only a new user’s first login writes it. |
| Free text | 15 | `—` | Encrypted by Aisle with a key from the PII service; there is no read switch. |

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `user_id` (seen on staging 2026-10-25)
- `first_name` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`read_first_name` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `user_id` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)
- `first_name` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`write_first_name` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 4; all on the website)

- 2026-10-25 — Response field added: `first_name` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user_id` · seen on staging 2026-10-25

<a id="api-003"></a>

#### `POST /V1/pii_integration/profile_first_names` — Profile first names

**Profile first names.** Read and write first names directly in the PII service (test token).

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** Batch read · **Code** `app/controllers/v1/pii_integration_controller.rb; config/routes.rb#L21`

**Request**

Request fields: `refs`

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `requested_ref_count` (seen on staging 2026-10-25)
- `returned_ref_count` (seen on staging 2026-10-25)
- `profiles` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`profile_first_names` → `get_multiple_cache_data` → `hydrate_first_names!` → `get_first_names_for_users`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-19: unknown ref → 200 {status, requested_ref_count, returned_ref_count, profiles:{<ref>:null}}; empty refs → 400.

**What changed** (latest 3 of 4; all on the website)

- 2026-10-25 — Response field added: `profiles` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `returned_ref_count` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `requested_ref_count` · seen on staging 2026-10-25

<a id="api-190"></a>

#### `POST /V1/pii_integration/first_names/batch` — Batch

**Batch.** Read and write first names directly in the PII service (test token).

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** Batch read · **Code** `app/controllers/v1/pii_integration_controller.rb; config/routes.rb#L20`

**Request**

Request fields: `user_ids`

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `requested_user_count` (seen on staging 2026-10-25)
- `returned_user_count` (seen on staging 2026-10-25)
- `first_names` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`Pii::FieldStore.get_first_names`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-19: unknown user_ids → 200 {status, requested_user_count, returned_user_count, first_names:{}}; empty user_ids → 400.

**What changed** (latest 3 of 4; all on the website)

- 2026-10-25 — Response field added: `first_names` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `returned_user_count` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `requested_user_count` · seen on staging 2026-10-25

<a id="api-208"></a>

#### `POST /V1/pii_integration/profile_first_name_source` — Profile first name source

**Profile first name source.** Read and write first names directly in the PII service (test token).

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** Read (name source diagnostic) · **Code** `app/controllers/v1/pii_integration_controller.rb; config/routes.rb#L22`

**Request**

Request fields: `first_name` (optional · from code — confirm with Dev), `ref` (optional, string · from code — confirm with Dev), `user_id` (optional, string · from code — confirm with Dev)

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

`Declared route; profile_first_name_source action is absent (broken)`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 13; all on the website)

- 2026-10-29 — Request field added: `user_id` · from code — confirm with Dev · `app/controllers/v1/pii_integration_controller.rb:125 @004e72c (via profile_from_params)`
- 2026-10-29 — Request field added: `ref` · from code — confirm with Dev · `app/controllers/v1/pii_integration_controller.rb:127 @004e72c (via profile_from_params)`
- 2026-10-29 — Request field added: `first_name` · from code — confirm with Dev · `app/controllers/v1/pii_integration_controller.rb:92 @004e72c`

<a id="area-g2"></a>

### Sign-up, login & account

Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data. 26 endpoints.

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
| POST | [`/V1/users/phone_number_login`](https://aisleapidocs.netlify.app/#/aisle/code-036) | Test login: check phone number _(from code)_ |
| POST | [`/V1/users/verify_otp`](https://aisleapidocs.netlify.app/#/aisle/code-037) | Test login: verify OTP _(from code)_ |
| GET | [`/V1/users/firebase_token`](https://aisleapidocs.netlify.app/#/aisle/code-038) | Get Firebase token _(from code)_ |
| POST | [`/V1/user/addDevice`](https://aisleapidocs.netlify.app/#/aisle/code-039) | Register device and push token _(from code)_ |
| POST | [`/V1/signout_api`](https://aisleapidocs.netlify.app/#/aisle/code-040) | Sign out _(from code)_ |
| POST | [`/V1/sessions/login_with_phone_number`](https://aisleapidocs.netlify.app/#/aisle/code-041) | Request login OTP _(from code)_ |
| POST | [`/V1/sessions/login_initiated`](https://aisleapidocs.netlify.app/#/aisle/code-042) | Log login attempt _(from code)_ |
| POST | [`/V1/sessions/fetch_login_response_web`](https://aisleapidocs.netlify.app/#/aisle/code-043) | Web login response _(from code)_ |
| POST | [`/V1/device/decode_integrity_token`](https://aisleapidocs.netlify.app/#/aisle/code-044) | Check device integrity _(from code)_ |
| POST | [`/V1/account_journey/update_community_message_agreed`](https://aisleapidocs.netlify.app/#/aisle/code-045) | Accept community guidelines _(from code)_ |
| POST | [`/web/auth/:provider/callback`](https://aisleapidocs.netlify.app/#/aisle/code-046) | Web: social login callback _(from code)_ |
| POST | [`/web/user/addDevice`](https://aisleapidocs.netlify.app/#/aisle/code-047) | Web: register device FCM token _(from code)_ |
| POST | [`/web/sessions/logout`](https://aisleapidocs.netlify.app/#/aisle/code-048) | Web: log out device _(from code)_ |

<a id="api-032"></a>

#### `POST /V1/users/toggle_hide_name` — Toggle hide name

**Toggle hide name.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (hide/unhide name) · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L94`

**Request**

Request fields: none

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `first_name` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`toggle_hide_name` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

`update_profile` → `submit_profile` → `update_application_information!` → `get_first_name`

_Code path — Email_

`update_profile` → `submit_profile` → `update_application_information!` → `Account::Email.add_email/search_user_ids`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 60; all on the website)

- 2026-10-25 — Response field added: `is_spark_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_complete_profile_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_gesture` · seen on staging 2026-10-25

<a id="api-058"></a>

#### `POST /V1/user/edit` — Edit profile

**Edit profile.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (writes), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Write / update PII · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L154`

**Request**

Request fields: `data`, `general_information`, `first_name`, `photos`, `photo`, `photo_id`, `status`, `user_traits`, `trait_id`, `user_interests_v2`, `interest_id`, `preferences`, `partial_work`, `work_title`, `industry`, `college`, `graduation_year`, `audio_prompt`, `question_id`, `audio_url`

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)
- `intro_questions` (seen on staging 2026-10-25)
- `discover_profile_order` (seen on staging 2026-10-25)
- `audio_prompts` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`edit_profile` → `edit_profile_details` → `get_first_name`

_Code path — Email_

`edit_profile` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`edit_profile` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 5; all on the website)

- 2026-10-25 — Response field added: `audio_prompts` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `discover_profile_order` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `intro_questions` · seen on staging 2026-10-25

<a id="api-059"></a>

#### `POST /V1/user/delete` — Delete account

**Delete account.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (reads), Email (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Delete account (reads PII for cleanup) · **Code** `app/controllers/v1/sessions_controller.rb; config/routes.rb#L155`

**Request**

Request fields: `reason_id`, `note`

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`delete_account` → `delete_all_account_info` → `get_first_name`

_Code path — Email_

`delete_account` → `delete_all_account_info` → `fetch_email`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`verify_number_login_v1` → `verify_login_with_number` → `login_from_phone_number` → `login_response_v1` → `send_for_aws_moderation` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

_Code path — Email_

`verify_number_login_v1` → `verify_login_with_number` → `login_from_phone_number` → `login_response_v1` → `send_for_aws_moderation` → `check_for_scammer_before_moderation!` → `fetch_email_domain`

_Code path — Phone_

`verify_number_login_v1` → `verify_login_with_number` → `login_from_phone_number` → `write_pii_phone_number_for_user`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)
- `is_invite_available` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_profile_web` → `submit_profile_web` → `update_application_information_web!` → `get_first_name`

_Code path — Email_

`update_profile_web` → `submit_profile_web` → `update_application_information_web!` → `Account::Email.add_email/search_user_ids`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`create_login_response_v1` → `login_from_phone_number_v1` → `login_response_v1` → `send_for_aws_moderation` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

_Code path — Email_

`create_login_response_v1` → `login_from_phone_number_v1` → `login_response_v1` → `send_for_aws_moderation` → `check_for_scammer_before_moderation!` → `fetch_email_domain`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

`update_profile` → `submit_profile` → `update_application_information!` → `get_first_name`

_Code path — Email_

`update_profile` → `submit_profile` → `update_application_information!` → `Account::Email.add_email/search_user_ids`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 60; all on the website)

- 2026-10-25 — Response field added: `is_spark_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_complete_profile_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_gesture` · seen on staging 2026-10-25

<a id="api-130"></a>

#### `POST /web/user/edit` — Edit profile

**Edit profile.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (writes), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Write / update PII · **Code** `app/controllers/web/users_controller.rb; config/routes.rb#L366`

**Request**

Request fields: `data`, `general_information`, `first_name`, `photos`, `photo`, `photo_id`, `status`, `user_traits`, `trait_id`, `user_interests_v2`, `interest_id`, `preferences`, `partial_work`, `work_title`, `industry`, `college`, `graduation_year`, `audio_prompt`, `question_id`, `audio_url`, `data.about` (optional · from code — confirm with Dev), `data.user_interests` (optional · from code — confirm with Dev), `device_type` (optional · from code — confirm with Dev)

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`edit_profile` → `edit_profile_details` → `get_first_name`

_Code path — Email_

`edit_profile` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`edit_profile` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 4; all on the website)

- 2026-10-29 — Request field added: `device_type` · from code — confirm with Dev · `app/controllers/web/users_controller.rb:34 @004e72c`
- 2026-10-29 — Request field added: `data.user_interests` · from code — confirm with Dev · `app/controllers/web/users_controller.rb:37 @004e72c`
- 2026-10-29 — Request field added: `data.about` · from code — confirm with Dev · `app/controllers/web/users_controller.rb:38 @004e72c`

<a id="api-131"></a>

#### `POST /web/user/delete` — Delete account

**Delete account.** Sign-up, phone login, profile edit, hide-name, delete and reset — the flows that write personal data.

Personal data: First name (reads), Email (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Delete account (reads PII for cleanup) · **Code** `app/controllers/web/sessions_controller.rb; config/routes.rb#L367`

**Request**

Request fields: `reason_id`, `note`

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`delete_account` → `delete_all_account_info` → `get_first_name`

_Code path — Email_

`delete_account` → `delete_all_account_info` → `fetch_email`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name, Email_

`User.delete_older_account` → `delete_all_account_info` → `deletion email name and recipient`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name, Email_

`User.delete_current_account` → `delete_all_account_info` → `deletion email name and recipient`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

`User.reset_profile` → `copied/new Profile save callbacks and subscription/cache refresh`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** Copies compatibility fields to a new user/profile. It does not explicitly seed the new user's NAME, EMAIL or PHONE service rows; see migration gaps.
- **Known limitation:** Copies local fields to a new user but does not create PII-service records for it.

**What changed** (latest 3 of 59; all on the website)

- 2026-10-25 — Response field added: `show_complete_profile_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `selfie_gesture` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `personalised_comment_popup_text` · seen on staging 2026-10-25

<a id="area-g3"></a>

### Profiles

Return one profile — your own or another member’s. 14 endpoints.

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
| GET | [`/V1/users/fetch_settings`](https://aisleapidocs.netlify.app/#/aisle/code-049) | Get own settings _(from code)_ |

<a id="api-011"></a>

#### `GET /V1/users/profile_info` — Users profile info

**Users profile info.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L68`

**Request**

Request fields: `ref`, `conversation_id` (optional · from code — confirm with Dev)

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)
- `intro_questions` (seen on staging 2026-10-25)
- `exclusivity` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`Profile.fetch_profile_info` → `profile_details cache hydration`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 6; all on the website)

- 2026-10-29 — Response field added: `exclusivity` · from code — confirm with Dev · `app/controllers/v1/users_controller.rb:103 @004e72c`
- 2026-10-29 — Request field added: `conversation_id` · from code — confirm with Dev · `app/controllers/v1/users_controller.rb:103 @004e72c`
- 2026-10-25 — Response field added: `intro_questions` · seen on staging 2026-10-25

<a id="api-012"></a>

#### `GET /V1/users/profile_info_web` — Web profile info

**Web profile info.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** None — provider signature · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L69`

**Request**

Request fields: `user_name`

**End-to-end flow**

_Code path — First name_

`web_profile_info` → `fetch_web_profile_info` → `profile_details` → `create_cache_response` → `hydrate_first_name!` → `get_first_name_for_user`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

`fetch_own_info` → `fetch_own_info` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-19: no token → 401 {unauthorized_request:true}. Observed 2026-10-23: a NEW (onboarding-stage) user’s valid token → 401 {unauthorized_request} — a 401 here is not proof of a credential problem; an ONBOARDED user’s token → 200 {user_id, first_name, profile_state, gender, hide_first_name, …} (no email), before and >60 s after submit with the male photo set.

**What changed** (latest 3 of 67; all on the website)

- 2026-10-25 — Response field added: `intro_offer_timer` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_discounted_pricing` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `like_tab_my_type` · seen on staging 2026-10-25

<a id="api-016"></a>

#### `GET /V1/users/discover_profile_list_v2` — Discover profile list v2

**Discover profile list v2.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L73`

**Request**

Request fields: `page`, `items_per_page`, `ps` (optional · from code — confirm with Dev)

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

`discover_profile_list_v2` → `get_profile_from_link_ref` → `fetch_recommended_profile_header_text` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 15; all on the website)

- 2026-10-29 — Request field added: `ps` · from code — confirm with Dev · `app/controllers/v1/users_controller.rb:51 @004e72c`
- 2026-10-25 — Response field added: `free_premium_female` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `incognito_mode_cards` · seen on staging 2026-10-25

<a id="api-017"></a>

#### `GET /V1/users/meta_for_discover` — Meta for discover

**Meta for discover.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L75`

**Request**

Request fields: `ps` (optional · from code — confirm with Dev)

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

`meta_for_discover` → `fetch_meta_for_discover_tab` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 63; all on the website)

- 2026-10-29 — Request field added: `ps` · from code — confirm with Dev · `app/controllers/v1/users_controller.rb:27 @004e72c`
- 2026-10-25 — Response field added: `traits` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `relationship_goals` · seen on staging 2026-10-25

<a id="api-018"></a>

#### `GET /V1/users/get_shareable_link` — Get shareable link

**Get shareable link.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L76`

**Request**

Request fields: `recommended_profile_ref`

**Response fields** (top level; type not stated unless shown)

- `link` (seen on staging 2026-10-25)
- `preview_text` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`get_shareable_link` → `get_link` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `intro_questions` (seen on staging 2026-10-25)
- `audio_prompts` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`show` → `get_specific_user` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`show` → `get_specific_user` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`show` → `get_specific_user` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

`verify_user_v1` → `verify_users_details_v1` → `percentage_profile_complete` → `profile_details` → `create_cache_response` → `hydrate_first_name!` → `get_first_name_for_user`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: GET /V1/user/verify_user_v1 with a NEW (onboarding-stage) user’s token → 200; also 200 for a freshly onboarded account (male set) before and >60 s after submit.

**What changed** (latest 3 of 38; all on the website)

- 2026-10-25 — Response field added: `selfie_gesture` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `version` · seen on staging 2026-10-25

<a id="api-087"></a>

#### `POST /V1/user/verify_user_v1` — Verify user v1

**Verify user v1.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read (POST) · **Code** `app/controllers/v1/app_releases_controller.rb; config/routes.rb#L276`

**Request**

Request fields: none

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

`verify_user_v1` → `verify_users_details_v1` → `percentage_profile_complete` → `profile_details` → `create_cache_response` → `hydrate_first_name!` → `get_first_name_for_user`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 38; all on the website)

- 2026-10-25 — Response field added: `selfie_gesture` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `version` · seen on staging 2026-10-25

<a id="api-088"></a>

#### `GET /V1/user/verify_user` — Verify user

**Verify user.** Return one profile — your own or another member’s.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/app_releases_controller.rb; config/routes.rb#L277`

**Request**

Request fields: none

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

`verify_user` → `fetch_app_launch_info` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: GET /V1/user/verify_user with a NEW (onboarding-stage) user’s token → 200 incl. application_stage, application_stage_v2 (list of stages), selfie_compression_size.

**What changed** (latest 3 of 57; all on the website)

- 2026-10-25 — Response field added: `is_spark_enabled` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `intro_offer_timer` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `enable_multi_comment` · seen on staging 2026-10-25

<a id="api-119"></a>

#### `GET /web/users/profile_info` — Users profile info

**Users profile info.** Return one profile — your own or another member’s.

Personal data: First name (reads), Free text (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/web/users_controller.rb; config/routes.rb#L350`

**Request**

Request fields: `ref`

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`Profile.fetch_profile_info` → `profile_details cache hydration`

_Free-text encryption — Free text_

`Request with free text` → `PII service — free-text key` → `Aisle encrypts / decrypts the text`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Free text `—` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`show` → `own_profile_web` → `own_detailed_web` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`profile_data` → `profile_details` → `create_cache_response` → `hydrate_first_name!` → `get_first_name_for_user`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

Return lists of profiles, requests, likes, chats or events, with a first name per row. 26 endpoints.

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
| GET | [`/V1/users/my_discover_refs`](https://aisleapidocs.netlify.app/#/aisle/code-050) | Discover profile refs _(from code)_ |
| GET | [`/V1/contact/fetch_contact_list`](https://aisleapidocs.netlify.app/#/aisle/code-051) | List imported contacts _(from code)_ |
| GET | [`/V1/events`](https://aisleapidocs.netlify.app/#/aisle/code-052) | Fetch badge counts (backup) _(from code)_ |
| GET | [`/V1/sparks/list_received`](https://aisleapidocs.netlify.app/#/aisle/code-053) | List received Sparks _(from code)_ |
| GET | [`/web/combined_messages_list`](https://aisleapidocs.netlify.app/#/aisle/code-054) | Web: combined messages list _(from code)_ |

<a id="api-005"></a>

#### `GET /V1/invites/all_requests` — List all requests

**List all requests.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/invites_controller.rb; config/routes.rb#L58`

**Request**

Request fields: `page`, `items_per_page`

**Response fields** (top level; type not stated unless shown)

- `invites` (seen on staging 2026-10-25)
- `total_invites` (seen on staging 2026-10-25)
- `totalPages` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `refresh_duration` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`list_all_requests` → `list_all_invitations` → `create_response` → `get_multiple_cache_data` → `hydrate_first_names!` → `get_first_names_for_users`

_Code path — Phone_

`list_all_requests` → `list_all_invitations` → `is_test_user?` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 5; all on the website)

- 2026-10-25 — Response field added: `refresh_duration` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `totalPages` · seen on staging 2026-10-25

<a id="api-006"></a>

#### `GET /V1/invites/list_comments_with_pagination` — List comments with pagination

**List comments with pagination.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/invites_controller.rb; config/routes.rb#L59`

**Request**

Request fields: `page`, `items_per_page`

**Response fields** (top level; type not stated unless shown)

- `invites` (seen on staging 2026-10-25)
- `comment_next_cursor` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`list_comments_with_pagination` → `list_all_comments` → `create_response` → `get_multiple_cache_data` → `hydrate_first_names!` → `get_first_names_for_users`

_Code path — Phone_

`list_comments_with_pagination` → `list_all_comments` → `fetch_all_comments` → `is_test_user?` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

`list_comments_and_likes` → `list_all_comments` → `create_response` → `get_multiple_cache_data` → `hydrate_first_names!` → `get_first_names_for_users`

_Code path — Phone_

`list_comments_and_likes` → `list_all_comments` → `fetch_all_comments` → `is_test_user?` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 18; all on the website)

- 2026-10-29 — Request field added: `sort_by` · from code — confirm with Dev · `app/controllers/v1/invites_controller.rb:112 @004e72c`
- 2026-10-29 — Request field added: `opened_from_pn` · from code — confirm with Dev · `app/controllers/v1/invites_controller.rb:119 @004e72c`
- 2026-10-25 — Response field added: `popup` · seen on staging 2026-10-25

<a id="api-008"></a>

#### `GET /V1/invites/list_request_and_likes` — List request and likes

**List request and likes.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/invites_controller.rb; config/routes.rb#L61`

**Request**

Request fields: `page`, `items_per_page`, `opened_from_pn` (optional · from code — confirm with Dev), `sort_by` (optional · from code — confirm with Dev)

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

`list_request_and_likes` → `list_all_invitations` → `create_response` → `get_multiple_cache_data` → `hydrate_first_names!` → `get_first_names_for_users`

_Code path — Phone_

`list_request_and_likes` → `list_all_invitations` → `is_test_user?` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 18; all on the website)

- 2026-10-29 — Request field added: `sort_by` · from code — confirm with Dev · `app/controllers/v1/invites_controller.rb:55 @004e72c`
- 2026-10-29 — Request field added: `opened_from_pn` · from code — confirm with Dev · `app/controllers/v1/invites_controller.rb:62 @004e72c`
- 2026-10-25 — Response field added: `popup` · seen on staging 2026-10-25

<a id="api-014"></a>

#### `GET /V1/users/matches_list_v2` — Matches list v2

**Matches list v2.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L71`

**Request**

Request fields: `page`, `items_per_page`

**Response fields** (top level; type not stated unless shown)

- `users_list` (seen on staging 2026-10-25)
- `suggestion_state` (seen on staging 2026-10-25)
- `show_foryou_tab` (seen on staging 2026-10-25)
- `suggestions_source` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`matches_list_v2` → `select_algorithm_for_discover_profile_list` → `fetch_discover_profile_list` → `create_home_page_response_v2` → `get_multiple_cache_data` → `hydrate_first_names!` → `get_first_names_for_users`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Observed on staging:** Observed 2026-10-23: GET /V1/users/matches_list_v2 → 200 for a freshly onboarded synthetic account (male set), before and >60 s after submit.

**What changed** (latest 3 of 4; all on the website)

- 2026-10-25 — Response field added: `suggestions_source` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_foryou_tab` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `suggestion_state` · seen on staging 2026-10-25

<a id="api-015"></a>

#### `POST /V1/users/matches_list_v3` — Matches list v2

**Matches list v2.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L72`

**Request**

Request fields: `page`, `items_per_page`

**Response fields** (top level; type not stated unless shown)

- `users_list` (seen on staging 2026-10-25)
- `suggestion_state` (seen on staging 2026-10-25)
- `show_foryou_tab` (seen on staging 2026-10-25)
- `suggestions_source` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`matches_list_v2` → `select_algorithm_for_discover_profile_list` → `fetch_discover_profile_list` → `create_home_page_response_v2` → `get_multiple_cache_data` → `hydrate_first_names!` → `get_first_names_for_users`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** POST alias of the matches_list_v2 action.

**What changed** (latest 3 of 4; all on the website)

- 2026-10-25 — Response field added: `suggestions_source` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `show_foryou_tab` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `suggestion_state` · seen on staging 2026-10-25

<a id="api-019"></a>

#### `GET /V1/users/fetch_concierge_list` — Fetch concierge list

**Fetch concierge list.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L77`

**Request**

Request fields: `page`, `items_per_page`

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

`fetch_concierge_list` → `fetch_concierge_profile_list` → `is_partial?` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 16; all on the website)

- 2026-10-25 — Response field added: `know_more_message_2` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `know_more_message` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `box_message` · seen on staging 2026-10-25

<a id="api-020"></a>

#### `GET /V1/users/fetch_top_matched_profiles` — Fetch top matched profiles

**Fetch top matched profiles.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L78`

**Request**

Request fields: `page`, `items_per_page`

**Response fields** (top level; type not stated unless shown)

- `users` (seen on staging 2026-10-25)
- `next_refresh_time` (seen on staging 2026-10-25)
- `daily_requests_left` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`fetch_top_matched_profiles` → `fetch_top_matched_profiles` → `fetch_profiles_list` → `create_top_matches_response` → `get_multiple_cache_data` → `hydrate_first_names!` → `get_first_names_for_users`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `users` (seen on staging 2026-10-25)
- `nextCursor_1` (seen on staging 2026-10-25)
- `nextCursor_2` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`list_request_sent` → `fetch_activity_list` → `fetch_own_info` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 5; all on the website)

- 2026-10-25 — Response field added: `own_info` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `nextCursor_2` · seen on staging 2026-10-25

<a id="api-048"></a>

#### `GET /V1/list_likes_received_v1` — List likes received v1

**List likes received v1.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L134`

**Request**

Request fields: `page`, `items_per_page`

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

`UserLike.list_likes_received_v2` → `create_likes_received_api_response` → `profile cache name hydration`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 9; all on the website)

- 2026-10-25 — Response field added: `is_default_payment_concierge` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_see_profile` · seen on staging 2026-10-25

<a id="api-049"></a>

#### `GET /V1/list_all_passed` — List all passed

**List all passed.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/like_controller.rb; config/routes.rb#L135`

**Request**

Request fields: `page`, `items_per_page`

**Response fields** (top level; type not stated unless shown)

- `users` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`list_all_passed` → `list_passed_profiles` → `fetch_own_info` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `users` (seen on staging 2026-10-25)
- `nextCursor_1` (seen on staging 2026-10-25)
- `nextCursor_2` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)
- `refresh_duration` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`list_likes_and_requests_received` → `fetch_likes_and_requests_recieved` → `fetch_own_info` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 6; all on the website)

- 2026-10-25 — Response field added: `refresh_duration` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `own_info` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25

<a id="api-063"></a>

#### `GET /V1/list_connected_profiles` — List connected profiles

**List connected profiles.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), Free text (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/messages_controller.rb; config/routes.rb#L173`

**Request**

Request fields: `page`, `items_per_page`

**Response fields** (top level; type not stated unless shown)

- `user_id` (seen on staging 2026-10-25)
- `conversations` (seen on staging 2026-10-25)
- `total_connections_count` (seen on staging 2026-10-25)
- `refresh_duration` (seen on staging 2026-10-25)
- `feedback_intro_popup` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`list_connected_profiles` → `all_active_conversations_v1` → `fetch_cached_conversations` → `create_cached_response` → `select_first_name`

_Code path — Phone_

`list_connected_profiles` → `all_active_conversations_v1` → `is_test_user?` → `fetch_only_number`

_Free-text encryption — Free text_

`Request with free text` → `PII service — free-text key` → `Aisle encrypts / decrypts the text`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` · Free text `—` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 5; all on the website)

- 2026-10-25 — Response field added: `feedback_intro_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `refresh_duration` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `total_connections_count` · seen on staging 2026-10-25

<a id="api-068"></a>

#### `GET /V1/combined_messages_hidden_list` — Combined messages hidden list

**Combined messages hidden list.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/v1/messages_controller.rb; config/routes.rb#L184`

**Request**

Request fields: `page`, `items_per_page`

**Response fields** (top level; type not stated unless shown)

- `user_id` (seen on staging 2026-10-25)
- `conversations` (seen on staging 2026-10-25)
- `hidden_linked_users` (seen on staging 2026-10-25)
- `feedback_intro_popup` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`combined_messages_hidden_list` → `all_active_conversations` → `fetch_cached_conversations` → `create_cached_response` → `select_first_name`

_Code path — Phone_

`combined_messages_hidden_list` → `all_active_conversations` → `is_test_user?` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 4; all on the website)

- 2026-10-25 — Response field added: `feedback_intro_popup` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `hidden_linked_users` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `conversations` · seen on staging 2026-10-25

<a id="api-069"></a>

#### `POST /V1/chat/chat_messages` — Chat messages

**Chat messages.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Free text (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Read (POST) · **Code** `app/controllers/v1/messages_controller.rb; config/routes.rb#L188`

**Request**

Request fields: `conversation_id`, `page`, `created_at`

**End-to-end flow**

_Code path — First name_

`chat_messages` → `fetch_chat_messages` → `get_first_name`

_Free-text encryption — Free text_

`Request with free text` → `PII service — free-text key` → `Aisle encrypts / decrypts the text`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Free text `—` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`event_info` → `fetch_event_info` → `fetch_user_list` → `get_cache_from_ref` → `create_cache_response` → `hydrate_first_name!` → `get_first_name_for_user`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `profiles` (seen on staging 2026-10-25)
- `own_info` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`profiles_voted` → `fetch_own_info` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `live_list` (seen on staging 2026-10-25)
- `live_list_v1` (seen on staging 2026-10-25)
- `room_settings` (seen on staging 2026-10-25)
- `agora_data` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`index` → `fetch_all_live_audios` → `fill_room_cache!` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Live-audio room cache` | rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 4; all on the website)

- 2026-10-25 — Response field added: `agora_data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `room_settings` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `live_list_v1` · seen on staging 2026-10-25

<a id="api-116"></a>

#### `GET /web/invites/all_requests` — List all requests

**List all requests.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Batch read · **Code** `app/controllers/web/invites_controller.rb; config/routes.rb#L343`

**Request**

Request fields: `page`, `items_per_page`

**Response fields** (top level; type not stated unless shown)

- `invites` (seen on staging 2026-10-25)
- `total_invites` (seen on staging 2026-10-25)
- `totalPages` (seen on staging 2026-10-25)
- `report_options` (seen on staging 2026-10-25)
- `refresh_duration` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`list_all_requests` → `list_all_invitations` → `create_response` → `get_multiple_cache_data` → `hydrate_first_names!` → `get_first_names_for_users`

_Code path — Phone_

`list_all_requests` → `list_all_invitations` → `is_test_user?` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| App database | `sms_notification_phone_numbers.number (via users.phone_number_id)` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 5; all on the website)

- 2026-10-25 — Response field added: `refresh_duration` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `totalPages` · seen on staging 2026-10-25

<a id="api-126"></a>

#### `GET /web/list_likes_received` — Web list likes received

**Web list likes received.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Web app · **Auth** User JWT (app) · **Operation** Read · **Code** `app/controllers/web/like_controller.rb; config/routes.rb#L359`

**Request**

Request fields: `page`, `items_per_page`

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

`UserLike.list_likes_received_v2` → `create_likes_received_api_response` → `profile cache name hydration`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 9; all on the website)

- 2026-10-25 — Response field added: `is_default_payment_concierge` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `report_options` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `can_see_profile` · seen on staging 2026-10-25

<a id="api-191"></a>

#### `GET /V1/users/test_profile_list` — Test profile list

**Test profile list.** Return lists of profiles, requests, likes, chats or events, with a first name per row.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** Read · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L16`

**Request**

Request fields: none

**Response fields** (top level; type not stated unless shown)

- `invites` (seen on staging 2026-10-25)
- `likes` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`TestApi invites/likes profile cache hydration`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

Likes, invites, accept / pass, reports, messages, calls and live audio. 55 endpoints.

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
| POST | [`/V1/events/message`](https://aisleapidocs.netlify.app/#/aisle/code-055) | Publish message-sent event _(from code)_ |
| POST | [`/V1/invites/like_and_request_seen`](https://aisleapidocs.netlify.app/#/aisle/code-056) | Mark likes and requests seen _(from code)_ |
| POST | [`/V1/like_multiple_profiles`](https://aisleapidocs.netlify.app/#/aisle/code-057) | Like multiple profiles _(from code)_ |
| POST | [`/V1/sparks/send`](https://aisleapidocs.netlify.app/#/aisle/code-058) | Send a Spark _(from code)_ |
| POST | [`/V1/sparks/accept`](https://aisleapidocs.netlify.app/#/aisle/code-059) | Accept a Spark _(from code)_ |
| POST | [`/V1/sparks/reject`](https://aisleapidocs.netlify.app/#/aisle/code-060) | Reject a Spark _(from code)_ |
| POST | [`/V1/messages/:ref/read`](https://aisleapidocs.netlify.app/#/aisle/code-061) | Mark conversation read _(from code)_ |
| POST | [`/V1/messages/seen`](https://aisleapidocs.netlify.app/#/aisle/code-062) | Mark all chats seen _(from code)_ |
| POST | [`/V1/chat/seen`](https://aisleapidocs.netlify.app/#/aisle/code-063) | Mark all chats seen _(from code)_ |
| GET | [`/V1/messages/agora_channel_status`](https://aisleapidocs.netlify.app/#/aisle/code-064) | Check video call channel _(from code)_ |
| POST | [`/V1/messages/mark_video_request_missed`](https://aisleapidocs.netlify.app/#/aisle/code-065) | Mark video call missed _(from code)_ |
| POST | [`/V1/messages/mark_video_request_declined`](https://aisleapidocs.netlify.app/#/aisle/code-066) | Decline video call _(from code)_ |
| POST | [`/V1/messages/unmatch_user`](https://aisleapidocs.netlify.app/#/aisle/code-067) | Unmatch a connection _(from code)_ |
| POST | [`/V1/chat/like_message`](https://aisleapidocs.netlify.app/#/aisle/code-068) | Like a chat message _(from code)_ |
| POST | [`/V1/chat/unlike_message`](https://aisleapidocs.netlify.app/#/aisle/code-069) | Unlike a chat message _(from code)_ |
| POST | [`/V1/chat/date_feedback/event`](https://aisleapidocs.netlify.app/#/aisle/code-070) | Post date feedback event _(from code)_ |
| GET | [`/V1/pubnub/grant_token`](https://aisleapidocs.netlify.app/#/aisle/code-071) | Get PubNub chat token _(from code)_ |
| POST | [`/V1/sharing/create`](https://aisleapidocs.netlify.app/#/aisle/code-072) | Create profile sharing _(from code)_ |
| GET | [`/V1/sharing/list`](https://aisleapidocs.netlify.app/#/aisle/code-073) | List profile sharings _(from code)_ |
| POST | [`/V1/sharing/toggle_checked`](https://aisleapidocs.netlify.app/#/aisle/code-074) | Toggle sharing checked _(from code)_ |
| GET | [`/V1/live_audio/refresh_agora_token`](https://aisleapidocs.netlify.app/#/aisle/code-075) | Refresh live audio token _(from code)_ |
| POST | [`/web/invites/seen_v1`](https://aisleapidocs.netlify.app/#/aisle/code-076) | Web: mark invitations seen _(from code)_ |
| POST | [`/web/messages/:ref/read`](https://aisleapidocs.netlify.app/#/aisle/code-077) | Web: mark conversation read _(from code)_ |
| POST | [`/web/messages/seen_v1`](https://aisleapidocs.netlify.app/#/aisle/code-078) | Web: mark message seen _(from code)_ |
| POST | [`/web/messages/seen_all`](https://aisleapidocs.netlify.app/#/aisle/code-079) | Web: mark all chats seen _(from code)_ |

<a id="api-004"></a>

#### `POST /V1/invites/send_request_to_profile` — Send request to profile

**Send request to profile.** Likes, invites, accept / pass, reports, messages, calls and live audio.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Action → reads name · **Code** `app/controllers/v1/invites_controller.rb; config/routes.rb#L57`

**Request**

Request fields: `ref`, `invitation_type`, `reply_message`

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`send_request_to_profile` → `send_request` → `send_request_notification` → `send_request_push_notification!` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `conversation_id` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`accept_request` → `accept_request` → `send_connection_push` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`pass_request` → `pass_request` → `assign_negative_reaction` → `increment_negative_interaction!` → `assign_official_rating!` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`create` → `like_user` → `like_user_back!` → `create_like_entry` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`pass_user` → `pass_user` → `assign_negative_reaction` → `increment_negative_interaction!` → `assign_official_rating!` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`like_back` → `like_user` → `like_user_back!` → `create_like_entry` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`like_without_deduction` → `like_user` → `like_user_back!` → `create_like_entry` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`send_request_or_like` → `send_request_or_like` → `like_user` → `like_user_back!` → `create_like_entry` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`accept_request_or_like` → `accept_request_or_like` → `accept_request` → `send_connection_push` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`pass_request_or_like` → `pass_request_or_like` → `pass_user` → `assign_negative_reaction` → `increment_negative_interaction!` → `assign_official_rating!` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `conversation_id` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`connect_linked_users` → `convert_to_full_connection` → `fill_conversation_cache!` → `create_cached_response` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`generate_agora_token` → `send_request` → `fill_conversation_cache!` → `create_cached_response` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `can_call` (seen on staging 2026-10-25)
- `video_call_message` (seen on staging 2026-10-25)
- `call_enabled` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`unlock_video_call` → `can_video_call?` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `can_call` (seen on staging 2026-10-25)
- `video_call_message` (seen on staging 2026-10-25)
- `call_enabled` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`can_video_call` → `can_video_call?` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`create` → `report_user` → `add_entry` → `accept_like_or_invite` → `accept_request` → `send_connection_push` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`give_feedback` → `add_feedback` → `connect_users!` → `fill_conversation_cache!` → `create_cached_response` → `select_first_name`

_Code path — Phone_

`give_feedback` → `add_feedback` → `connect_users!` → `fetch_mobile_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`go_live` → `go_live` → `trigger_room_owner_online_update` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`join_room` → `join_room` → `fetch_current_speaker_info` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`send_request_to_talk` → `send_request_to_talk` → `fill_room_cache!` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`switch_speaker` → `pass_speaker` → `create_speaker_passed_message` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`leave_room` → `leave_room` → `create_speaker_left_room_message` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`accept_request_v1` → `accept_request` → `send_connection_push` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`pass_request` → `pass_request` → `assign_negative_reaction` → `increment_negative_interaction!` → `assign_official_rating!` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`create` → `like_user` → `like_user_back!` → `create_like_entry` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`pass_user` → `pass_user` → `assign_negative_reaction` → `increment_negative_interaction!` → `assign_official_rating!` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`like_back` → `like_user` → `like_user_back!` → `create_like_entry` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `conversation_id` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`connect_linked_users` → `convert_to_full_connection` → `fill_conversation_cache!` → `create_cached_response` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`create` → `report_user` → `add_entry` → `accept_like_or_invite` → `accept_request` → `send_connection_push` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`Chat::Conversation.send_message` → `ChatMessageWorker` → `Chat::Message callbacks and sender_name`

_Free-text encryption — Free text_

`Request with free text` → `PII service — free-text key` → `Aisle encrypts / decrypts the text`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Free text `—` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`Chat::Conversation.send_message` → `ChatMessageWorker` → `Chat::Message callbacks and sender_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

Update part of your own profile and return or re-cache it. 53 endpoints.

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
| POST | [`/V1/images/upload`](https://aisleapidocs.netlify.app/#/aisle/code-030) | Upload photo files _(from code)_ |
| POST | [`/V1/images/detect_face_in_image`](https://aisleapidocs.netlify.app/#/aisle/code-031) | Detect face in image _(from code)_ |
| POST | [`/V1/images/image_modifications`](https://aisleapidocs.netlify.app/#/aisle/code-032) | Image modifications (broken) _(from code)_ |
| POST | [`/V1/users/select_survey_option`](https://aisleapidocs.netlify.app/#/aisle/code-080) | Answer survey _(from code)_ |
| POST | [`/V1/users/upload_audio_url`](https://aisleapidocs.netlify.app/#/aisle/code-081) | Upload audio file _(from code)_ |
| POST | [`/V1/users/check_user_name`](https://aisleapidocs.netlify.app/#/aisle/code-082) | Check public username _(from code)_ |
| POST | [`/V1/contact/import_contacts`](https://aisleapidocs.netlify.app/#/aisle/code-083) | Import phone contacts _(from code)_ |
| POST | [`/V1/contact/delete_imported_contacts`](https://aisleapidocs.netlify.app/#/aisle/code-084) | Delete imported contacts _(from code)_ |
| POST | [`/V1/contact/hide_contacts`](https://aisleapidocs.netlify.app/#/aisle/code-085) | Hide contacts _(from code)_ |
| POST | [`/V1/contact/unhide_contacts`](https://aisleapidocs.netlify.app/#/aisle/code-086) | Unhide contacts _(from code)_ |
| GET | [`/V1/images/fetch_images`](https://aisleapidocs.netlify.app/#/aisle/code-087) | Photos for re-upload _(from code)_ |
| GET | [`/V1/images/fetch_presigned_url`](https://aisleapidocs.netlify.app/#/aisle/code-088) | Get photo upload URLs _(from code)_ |
| POST | [`/V1/images`](https://aisleapidocs.netlify.app/#/aisle/code-089) | Upload photo files _(from code)_ |
| POST | [`/V1/live_audio/update_room_settings`](https://aisleapidocs.netlify.app/#/aisle/code-090) | Update live audio settings _(from code)_ |
| POST | [`/web/images`](https://aisleapidocs.netlify.app/#/aisle/code-091) | Web: upload images _(from code)_ |
| POST | [`/web/review/mark_read`](https://aisleapidocs.netlify.app/#/aisle/code-092) | Web: mark review warning read _(from code)_ |
| POST | [`/web/introduction`](https://aisleapidocs.netlify.app/#/aisle/code-093) | Web: create introduction _(from code)_ |

<a id="api-022"></a>

#### `POST /V1/users/about` — Users about

**Users about.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L84`

**Request**

Request fields: `about`

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`about` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`about` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`about` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`add_meetup` → `add` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_interests` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`update_interests` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`update_interests` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_interests_v2` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`update_interests_v2` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`update_interests_v2` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_traits` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`update_traits` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`update_traits` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`mail_subscription` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`mail_subscription` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`mail_subscription` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`sms_subscription` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`sms_subscription` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`sms_subscription` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `is_boost_available` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`deactivate_user` → `deactivate_profile` → `deactivated!` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `is_boost_available` (seen on staging 2026-10-25)
- `profile_state` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`activate_user` → `activate_profile` → `pending!` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `is_backend_error` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`verify_selfie_v1` → `verify_user_selfie_based_on_app_version` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`toggle_profile_sharing` → `toggle_profile_sharing!` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`toggle_profile_incognito` → `toggle_profile_incognito!` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`toogle_concierge_badge_display` → `toogle_concierge_badge_display!` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `user` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_settle_info` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`update_settle_info` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`update_settle_info` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `user` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_relationship_goal_info` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`update_relationship_goal_info` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`update_relationship_goal_info` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `user` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_philosophy_info` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`update_philosophy_info` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`update_philosophy_info` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_mbti_info_data` → `update_profile_cache_by_mbti` → `general_information`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `intro_questions` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_audio_prompt` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`update_audio_prompt` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`update_audio_prompt` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 5; all on the website)

- 2026-10-25 — Response field added: `status` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25

<a id="api-041"></a>

#### `POST /V1/users/save_auto_pop_up_info` — Save auto pop up info

**Save auto pop up info.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L108`

**Request**

Request fields: `user_traits`, `trait_id`

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

`save_auto_pop_up_info` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 7; all on the website)

- 2026-10-25 — Response field added: `has_interests` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_philosophy` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `has_traits` · seen on staging 2026-10-25

<a id="api-042"></a>

#### `POST /V1/users/user_name` — Set public user name

**Set public user name.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/users_controller.rb; config/routes.rb#L113`

**Request**

Request fields: `user_name`

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`set_public_user_name` → `set_user_name` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)
- `link` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`set_profile_public` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `settings` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_preferences` → `update_interested_faiths` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Kafka | `Profile sync event` | publish |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 25; all on the website)

- 2026-10-29 — Request field added: `work_qualification_v1` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:59 @004e72c`
- 2026-10-29 — Request field added: `work_qualification` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:56 @004e72c`
- 2026-10-29 — Request field added: `work_industry_v1` · from code — confirm with Dev · `app/controllers/v1/setting_controller.rb:53 @004e72c`

<a id="api-045"></a>

#### `POST /V1/setting/reset_preferences` — Reset preferences

**Reset preferences.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/setting_controller.rb; config/routes.rb#L129`

**Request**

Request fields: `only_reset` (optional · from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`reset_preferences` → `select_algorithm_for_discover_tab` → `fetch_discover_tab_tester_response` → `fetch_own_info` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `refresh_profile_list` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_location_coordinates` → `update_location` → `update_residence_info` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `is_onboarding_phase_2` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`app_launch` → `record_app_launch_info` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

_Code path — Email_

`app_launch` → `record_app_launch_info` → `update_last_seen_window` → `send_for_aws_moderation` → `check_for_scammer_before_moderation!` → `fetch_email_domain`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`upload_images_v2` → `aws_moderation_for_images_by_inappropriate_profile` → `pending!` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

_Code path — Email_

`upload_images_v2` → `aws_moderation_for_images_by_inappropriate_profile` → `send_for_aws_moderation` → `check_for_scammer_before_moderation!` → `fetch_email_domain`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`edit_images` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`edit_images` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`edit_images` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`boost_profile` → `activate_boost` → `boost_rating!` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `percentage_profile_complete` (seen on staging 2026-10-25)
- `profile_complete_without_selfie` (seen on staging 2026-10-25)
- `icebreakers` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`edit_icebreaker` → `percentage_profile_complete` → `profile_details` → `create_cache_response` → `hydrate_first_name!` → `get_first_name_for_user`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 4; all on the website)

- 2026-10-25 — Response field added: `icebreakers` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `profile_complete_without_selfie` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `percentage_profile_complete` · seen on staging 2026-10-25

<a id="api-100"></a>

#### `POST /V1/introduction/edit_icebreaker_v1` — Edit icebreaker v1

**Edit icebreaker v1.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/introduction_controller.rb; config/routes.rb#L300`

**Request**

Request fields: `question_id`, `answer`

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

`edit_icebreaker_v1` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`edit_icebreaker_v1` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`edit_icebreaker_v1` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 7; all on the website)

- 2026-10-25 — Response field added: `ref` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `user` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `intro_questions` · seen on staging 2026-10-25

<a id="api-105"></a>

#### `POST /V1/advertisement/vote` — Advertisement vote

**Advertisement vote.** Update part of your own profile and return or re-cache it.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Update (non-PII) → profile response · **Code** `app/controllers/v1/advertisement_controller.rb; config/routes.rb#L309`

**Request**

Request fields: `option_id`

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`vote` → `vote!` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `user` (seen on staging 2026-10-25)
- `ref` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`about` → `own_detailed_v1` → `general_information` → `select_first_name`

_Code path — Email_

`about` → `own_detailed_v1` → `own_general_information` → `fetch_email`

_Code path — Phone_

`about` → `own_detailed_v1` → `own_general_information` → `fetch_only_number`

_Free-text encryption — Free text_

`Request with free text` → `PII service — free-text key` → `Aisle encrypts / decrypts the text`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` · Free text `—` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_settings` → `update_age` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`deactivate_user` → `deactivate_profile` → `deactivated!` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`activate_user` → `activate_profile` → `pending!` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `refresh_profile_list` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`update_location_coordinates` → `update_location` → `update_residence_info` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

<a id="area-g7"></a>

### Payments — checkout

Start a payment: the provider’s customer details (name, email, phone) are built from personal data. 29 endpoints.

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
| POST | [`/V1/payment/cashfree/subscription/create`](https://aisleapidocs.netlify.app/#/aisle/code-002) | Create Cashfree subscription _(from code)_ |
| GET | [`/V1/payment/get_order_id`](https://aisleapidocs.netlify.app/#/aisle/code-094) | Create Razorpay order _(from code)_ |
| GET | [`/V1/payment/paytm_payment_initialization`](https://aisleapidocs.netlify.app/#/aisle/code-095) | Start Paytm payment _(from code)_ |
| GET | [`/V1/payment/fetch_google_play_product_ids_v1`](https://aisleapidocs.netlify.app/#/aisle/code-096) | Android plans (v1, deprecated) _(from code)_ |
| GET | [`/V1/payment/fetch_web_products_ids`](https://aisleapidocs.netlify.app/#/aisle/code-097) | Web plans _(from code)_ |
| GET | [`/V1/payment/fetch_google_play_product_ids_v3`](https://aisleapidocs.netlify.app/#/aisle/code-098) | Android plans (v3) _(from code)_ |
| GET | [`/V1/payment/fetch_google_play_discounted_product_ids`](https://aisleapidocs.netlify.app/#/aisle/code-099) | Android discounted plans _(from code)_ |
| GET | [`/V1/payment/fetch_app_store_product_ids_v2`](https://aisleapidocs.netlify.app/#/aisle/code-100) | iOS plans (v2) _(from code)_ |
| POST | [`/V1/payment/intro_offer/start`](https://aisleapidocs.netlify.app/#/aisle/code-101) | Start intro offer timer _(from code)_ |
| GET | [`/V1/payment/cashfree_checkout`](https://aisleapidocs.netlify.app/#/aisle/code-102) | Cashfree checkout page _(from code)_ |
| POST | [`/V1/payment/phone_pay/verify_vpa`](https://aisleapidocs.netlify.app/#/aisle/code-103) | Verify UPI id (PhonePe) _(from code)_ |
| POST | [`/V1/payment/phone_pay/verify_vpa_web`](https://aisleapidocs.netlify.app/#/aisle/code-104) | Verify UPI id (PhonePe, web) _(from code)_ |
| POST | [`/V1/campaign/claim`](https://aisleapidocs.netlify.app/#/aisle/code-105) | Claim campaign freebie _(from code)_ |
| GET | [`/V1/sparks/pricing_list`](https://aisleapidocs.netlify.app/#/aisle/code-106) | List Sparks plans _(from code)_ |
| POST | [`/V1/event/update_personal_details`](https://aisleapidocs.netlify.app/#/aisle/code-107) | Book offline event (create order) _(from code)_ |
| GET | [`/web/payment/get_order_id`](https://aisleapidocs.netlify.app/#/aisle/code-108) | Web: create Razorpay order _(from code)_ |
| GET | [`/web/payment/fetch_product_ids`](https://aisleapidocs.netlify.app/#/aisle/code-109) | Web: fetch product ids _(from code)_ |

<a id="api-073"></a>

#### `POST /V1/payment/get_cashfree_request_params` — Get cashfree request params

**Get cashfree request params.** Start a payment: the provider’s customer details (name, email, phone) are built from personal data.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Outbound payload (reads PII) · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L211`

**Request**

Request fields: `plan_id`, `conversation_id`, `external_transaction_token`

**End-to-end flow**

_Code path — First name_

`get_cashfree_request_params` → `fetch_order_token` → `new_cashfree_order_response` → `get_payment_session_id` → `fetch_payment_session_id` → `get_first_name`

_Code path — Email_

`get_cashfree_request_params` → `fetch_order_token` → `new_cashfree_order_response` → `get_payment_session_id` → `fetch_payment_session_id` → `fetch_email`

_Code path — Phone_

`get_cashfree_request_params` → `fetch_order_token` → `new_cashfree_order_response` → `get_payment_session_id` → `fetch_payment_session_id` → `fetch_mobile_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`get_cashfree_web_request_params` → `fetch_web_order_token_v2` → `new_cashfree_order_response` → `get_payment_session_id` → `fetch_payment_session_id` → `get_first_name`

_Code path — Email_

`get_cashfree_web_request_params` → `fetch_web_order_token_v2` → `new_cashfree_order_response` → `get_payment_session_id` → `fetch_payment_session_id` → `fetch_email`

_Code path — Phone_

`get_cashfree_web_request_params` → `fetch_web_order_token_v2` → `new_cashfree_order_response` → `get_payment_session_id` → `fetch_payment_session_id` → `fetch_mobile_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`get_payu_request_params` → `fetch_payment_request_params` → `get_first_name`

_Code path — Email_

`get_payu_request_params` → `fetch_payment_request_params` → `fetch_email`

_Code path — Phone_

`get_payu_request_params` → `fetch_payment_request_params` → `fetch_mobile_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`send_cashfree_collect_request` → `send_collect_request` → `collect_request` → `get_upi_order_token` → `fetch_upi_order_token` → `create_payment_link_body_for_web` → `get_first_name`

_Code path — Email_

`send_cashfree_collect_request` → `send_collect_request` → `collect_request` → `get_upi_order_token` → `fetch_upi_order_token` → `create_payment_link_body_for_web` → `fetch_email`

_Code path — Phone_

`send_cashfree_collect_request` → `send_collect_request` → `collect_request` → `get_upi_order_token` → `fetch_upi_order_token` → `create_payment_link_body_for_web` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`send_payment_link` → `send_payment_link` → `fetch_payment_link` → `create_payment_link_body_for_web` → `get_first_name`

_Code path — Email_

`send_payment_link` → `send_payment_link` → `fetch_payment_link` → `create_payment_link_body_for_web` → `fetch_email`

_Code path — Phone_

`send_payment_link` → `send_payment_link` → `fetch_payment_link` → `create_payment_link_body_for_web` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — Phone_

`create_phone_pay_subscription` → `create_subscription_handler` → `fetch_phone_number_for_user`

**Read switches:** Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `transaction_id` (from code — confirm with Dev)

**End-to-end flow**

_Code path — Phone_

`phone_pay_one_time_payment` → `fetch_only_number`

**Read switches:** Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — Phone_

`create_phone_pay_subscription_web` → `create_subscription_handler` → `fetch_phone_number_for_user`

**Read switches:** Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`update_personal_details` → `update_personal_details` → `fetch_web_order_token_v2` → `new_cashfree_order_response` → `get_payment_session_id` → `fetch_payment_session_id` → `get_first_name`

_Code path — Email_

`update_personal_details` → `update_personal_details` → `fetch_web_order_token_v2` → `new_cashfree_order_response` → `get_payment_session_id` → `fetch_payment_session_id` → `fetch_email`

_Code path — Phone_

`update_personal_details` → `update_personal_details` → `fetch_web_order_token_v2` → `new_cashfree_order_response` → `get_payment_session_id` → `fetch_payment_session_id` → `fetch_mobile_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name, Email, Phone_

`get_cashfree_request_params_web` → `get_cashfree_web_request_params` → `Cashfree customer fields`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name, Email, Phone_

`Cashfree get_upi_qr_code` → `generate_qr_code` → `get_upi_order_token` → `create_payment_link_body_for_web`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — Phone_

`Payment.send_web_purchase_link` → `SmsNotifierWorker` → `fetch_full_phone_number_for_user`

**Read switches:** Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

<a id="area-g8"></a>

### Payments — verification

Verify or restore a payment; on success the profile cache is rebuilt. 49 endpoints.

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
| GET | [`/V1/payment/cashfree/subscription/status`](https://aisleapidocs.netlify.app/#/aisle/code-003) | Cashfree subscription status _(from code)_ |
| POST | [`/V1/payment/cashfree/subscription/cancel`](https://aisleapidocs.netlify.app/#/aisle/code-004) | Cancel Cashfree subscription _(from code)_ |
| POST | [`/V1/payment/ms/activateAnySubscriptionWithExpiry`](https://aisleapidocs.netlify.app/#/aisle/code-007) | Activate subscription with expiry (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/addExtraInvites`](https://aisleapidocs.netlify.app/#/aisle/code-008) | Add extra invites (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/addBoostToProfile`](https://aisleapidocs.netlify.app/#/aisle/code-009) | Add boost to profile (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/activePremiumSubscription`](https://aisleapidocs.netlify.app/#/aisle/code-010) | Active premium subscription (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/activateAnySubscription`](https://aisleapidocs.netlify.app/#/aisle/code-011) | Activate any subscription (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/enableExclusivity`](https://aisleapidocs.netlify.app/#/aisle/code-012) | Enable exclusivity (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/fetchUserIdFromIosIdentifier`](https://aisleapidocs.netlify.app/#/aisle/code-013) | User id from iOS identifier (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/deactivateActiveSubscription`](https://aisleapidocs.netlify.app/#/aisle/code-014) | Deactivate active subscription (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/editUserSubscription`](https://aisleapidocs.netlify.app/#/aisle/code-015) | Edit user subscription (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/addConsumableDataGoogle`](https://aisleapidocs.netlify.app/#/aisle/code-016) | Add Google consumable data (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/getAccountSubscription`](https://aisleapidocs.netlify.app/#/aisle/code-017) | Get account subscription (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/removeAccountSubscription`](https://aisleapidocs.netlify.app/#/aisle/code-018) | Remove account subscription (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/getActiveConciergeSubscription`](https://aisleapidocs.netlify.app/#/aisle/code-019) | Active concierge subscription (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/getActiveAislePlusSubscription`](https://aisleapidocs.netlify.app/#/aisle/code-020) | Active Aisle Plus subscription (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/getActivePremiumSubscriptionByGooglePlay`](https://aisleapidocs.netlify.app/#/aisle/code-021) | Active Google Play premium (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/extendSubscription`](https://aisleapidocs.netlify.app/#/aisle/code-022) | Extend subscription (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/reduceSubscription`](https://aisleapidocs.netlify.app/#/aisle/code-023) | Reduce subscription (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/addConsummableDataGoogle`](https://aisleapidocs.netlify.app/#/aisle/code-024) | Add Google consumable data (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/validateIosConsumable`](https://aisleapidocs.netlify.app/#/aisle/code-025) | Validate iOS consumable (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/getActiveSubscriptionByPlan`](https://aisleapidocs.netlify.app/#/aisle/code-026) | Active subscription by plan (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/editUserSubscriptionPostAppleSubscriptions`](https://aisleapidocs.netlify.app/#/aisle/code-027) | Edit subscription after Apple (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/saveToS3`](https://aisleapidocs.netlify.app/#/aisle/code-028) | Save to S3 (not implemented) _(from code)_ |
| POST | [`/V1/payment/ms/profileExists`](https://aisleapidocs.netlify.app/#/aisle/code-029) | Profile exists (not implemented) _(from code)_ |
| POST | [`/V1/payment/ios_payment_fake_response`](https://aisleapidocs.netlify.app/#/aisle/code-110) | iOS fake restore response _(from code)_ |
| GET | [`/V1/payment/verify_cashfree_order`](https://aisleapidocs.netlify.app/#/aisle/code-111) | Cashfree order result page _(from code)_ |
| GET | [`/V1/payment/cashfree_payment_status`](https://aisleapidocs.netlify.app/#/aisle/code-112) | Cashfree payment status _(from code)_ |
| POST | [`/V1/payment/verify_payu_payment`](https://aisleapidocs.netlify.app/#/aisle/code-113) | PayU verify (no-op) _(from code)_ |
| GET | [`/V1/payment/payment_success`](https://aisleapidocs.netlify.app/#/aisle/code-114) | Payment success page (broken) _(from code)_ |
| POST | [`/V1/payment/restore_cashfree_payment`](https://aisleapidocs.netlify.app/#/aisle/code-115) | Restore Cashfree purchase _(from code)_ |
| POST | [`/V1/payment/phone_pay/one_time_payment_status`](https://aisleapidocs.netlify.app/#/aisle/code-116) | PhonePe one-time payment status _(from code)_ |
| POST | [`/V1/payment/phone_pay/phone_pay_mandate_status`](https://aisleapidocs.netlify.app/#/aisle/code-117) | PhonePe mandate status _(from code)_ |
| POST | [`/V1/payment/phone_pay/cancel_subscription`](https://aisleapidocs.netlify.app/#/aisle/code-118) | Cancel PhonePe subscription _(from code)_ |
| POST | [`/V1/payment/phone_pay/phone_pay_mandate_status_web`](https://aisleapidocs.netlify.app/#/aisle/code-119) | PhonePe mandate status (web) _(from code)_ |
| POST | [`/V1/payment/phone_pay/cancel_phone_pay_subscription_web`](https://aisleapidocs.netlify.app/#/aisle/code-120) | Cancel PhonePe subscription (web) _(from code)_ |
| POST | [`/V1/payment/phone_pay/phone_pay_cancel_status_web`](https://aisleapidocs.netlify.app/#/aisle/code-121) | PhonePe cancel status (web) _(from code)_ |
| GET | [`/V1/event/verify_order_if_paid`](https://aisleapidocs.netlify.app/#/aisle/code-122) | Check event order paid _(from code)_ |

<a id="api-070"></a>

#### `POST /V1/payment/verify_razorpay_payment_v1` — Verify razorpay payment v1

**Verify razorpay payment v1.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L199`

**Request**

Request fields: `payment_id`

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`verify_razorpay_payment_v1` → `verify_by_payment_id` → `assign_plan_to_profile` → `activate_any_subscription` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`verify_ios_payment_v1` → `verify_payment` → `restore_purchase` → `validate_receipt_data` → `validate_ios_consumable_response` → `activate_any_subscription` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_f…`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`verify_paytm_payment_v1` → `verify_by_order_id` → `assign_plan_to_profile` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `is_backend_error` (from code — confirm with Dev)
- `message` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`verify_cashfree_payment` → `verify_transaction` → `assign_plan_to_profile` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

`verify_android_payments` → `verify_android_payment` → `add_consummable_or_subscription` → `add_subscription_data` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Cache | `Profile cache` | read / rebuild |
| Outside provider | `Google Play` | called |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 9; all on the website)

- 2026-10-29 — Response field added: `amount_in_currency` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:35 @004e72c`
- 2026-10-29 — Response field added: `currency_code` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:35 @004e72c`
- 2026-10-29 — Response field added: `extra_invites` · from code — confirm with Dev · `app/controllers/v1/subscription_controller.rb:35 @004e72c`

<a id="api-093"></a>

#### `POST /V1/subscription/restore_android_subscription` — Restore android subscription

**Restore android subscription.** Verify or restore a payment; on success the profile cache is rebuilt.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Mobile app · **Auth** User JWT (app) · **Operation** Payment verify → cache rebuild · **Code** `app/controllers/v1/subscription_controller.rb; config/routes.rb#L288`

**Request**

Request fields: `product_id`, `purchase_token`

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `message` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`restore_android_subscription` → `restore_subscription_from_previous_user` → `transfer_active_subscription` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`restore_ios_subscription_v1` → `restore_subscription_from_previous_user` → `transfer_active_subscription` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`book_event` → `verify_payment` → `assign_plan_to_profile` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `data` (from code — confirm with Dev)
- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`claim_freebie` → `create_claim_entry` → `success_text` → `activate_any_subscription` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`verify_razorpay_payment` → `verify_payment` → `assign_plan_to_profile` → `activate_any_subscription` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `is_backend_error` (from code — confirm with Dev)
- `message` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`Alias of verify_cashfree_payment; successful subscription assignment can rebuild the profile cache`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

Called by outside providers (PhonePe, Google Play, Apple, Pusher) — no user login. 22 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| POST | [`/V1/payment/phone_pay/mandate_create_callback`](#api-080) | Phone pay mandate create webhook |
| POST | [`/V1/payment/phone_pay/refund_callback`](#api-081) | Phone pay refund webhook |
| POST | [`/V1/payment/phone_pay/one_time_payment_callback`](#api-082) | Phone pay one time webhook |
| POST | [`/V1/payment/googleplay_webhook`](#api-094) | Googleplay webhook |
| POST | [`/V1/payment/apple_webhook_v2`](#api-095) | Apple webhook v2 |
| POST | [`/V1/pusher_presence_webhook`](#api-113) | Pusher presence webhook |
| GET | [`/V1/pusher_presence_webhook`](#api-114) | Pusher presence webhook |
| POST | [`/V1/messages/firebase_webhook`](https://aisleapidocs.netlify.app/#/aisle/code-001) | Firebase messages webhook _(from code)_ |
| POST | [`/V1/payment/cashfree/subscription/webhook`](https://aisleapidocs.netlify.app/#/aisle/code-005) | Cashfree subscription webhook _(from code)_ |
| POST | [`/V1/payment/cashfree/subscription/authorization_callback`](https://aisleapidocs.netlify.app/#/aisle/code-006) | Cashfree authorization callback _(from code)_ |
| POST | [`/V1/payment/handle_cashfree_disputes`](https://aisleapidocs.netlify.app/#/aisle/code-123) | Cashfree dispute webhook _(from code)_ |
| POST | [`/V1/payment/phone_pay/debit_init_callback`](https://aisleapidocs.netlify.app/#/aisle/code-124) | PhonePe debit callback _(from code)_ |
| POST | [`/V1/payment/phone_pay/cancel_callback`](https://aisleapidocs.netlify.app/#/aisle/code-125) | PhonePe cancel callback _(from code)_ |
| POST | [`/V1/payment/phone_pay/revoke_subscription`](https://aisleapidocs.netlify.app/#/aisle/code-126) | PhonePe revoke callback (inactive) _(from code)_ |
| POST | [`/V1/airbrake_webhook`](https://aisleapidocs.netlify.app/#/aisle/code-127) | Airbrake error webhook _(from code)_ |
| POST | [`/V1/mailer_services/transaction/mailchimp`](https://aisleapidocs.netlify.app/#/aisle/code-128) | Mailchimp (Mandrill) email webhook _(from code)_ |
| POST | [`/V1/otp/gupshup_webhook`](https://aisleapidocs.netlify.app/#/aisle/code-129) | Gupshup SMS delivery webhook _(from code)_ |
| GET | [`/V1/otp/gupshup_webhook`](https://aisleapidocs.netlify.app/#/aisle/code-130) | Gupshup SMS delivery webhook _(from code)_ |
| POST | [`/V1/otp/exotel_webhook`](https://aisleapidocs.netlify.app/#/aisle/code-131) | Exotel SMS delivery webhook _(from code)_ |
| POST | [`/V1/otp/equence_webhook`](https://aisleapidocs.netlify.app/#/aisle/code-132) | Equence SMS delivery webhook _(from code)_ |
| POST | [`/V1/tracking/exotel_webhook`](https://aisleapidocs.netlify.app/#/aisle/code-133) | Exotel short-link click webhook _(from code)_ |
| POST | [`/V1/otp/exotel_whatsapp_webhook`](https://aisleapidocs.netlify.app/#/aisle/code-134) | Exotel WhatsApp SMS delivery webhook _(from code)_ |

<a id="api-080"></a>

#### `POST /V1/payment/phone_pay/mandate_create_callback` — Phone pay mandate create webhook

**Phone pay mandate create webhook.** Called by outside providers (PhonePe, Google Play, Apple, Pusher) — no user login.

Personal data: First name (reads), through the app’s PII integration.

The personal-data step runs only in some cases — a profile state, a cache miss, a successful payment or a background job.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Outside provider (callback) · **Auth** None — provider signature · **Operation** Callback / webhook · **Code** `app/controllers/v1/payment_controller.rb; config/routes.rb#L236`

**Request**

Request fields: `response`

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`phone_pay_mandate_create_webhook` → `handle_create_mandate_webhook` → `record_transaction` → `debit_amount` → `activate_any_subscription` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`phone_pay_refund_webhook` → `check_for_duplicate_payments` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`phone_pay_one_time_webhook` → `one_time_payment_done` → `activate_any_subscription` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`googleplay_webhook` → `verify_googleplay_webhook_payment` → `add_consummable_or_subscription` → `add_subscription_data` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`apple_webhook_v2` → `store_and_process_webhook` → `start_processing_notification` → `process_notification` → `renew` → `edit_user_subscription` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`pusher_presence_webhook` → `fill_room_cache!` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`pusher_presence_webhook` → `fill_room_cache!` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 4; all on the website)

- 2026-10-29 — Response field added: `status` · from code — confirm with Dev · `app/controllers/v1/live_audio_controller.rb:92 @004e72c`
- 2026-10-29 — Request field added: `token` · from code — confirm with Dev · `app/controllers/v1/live_audio_controller.rb:65 @004e72c`
- 2026-10-29 — Request field added: `events` · from code — confirm with Dev · `app/controllers/v1/live_audio_controller.rb:71 @004e72c`

<a id="area-g10"></a>

### CMS / admin

Admin views, edits, search, curation, reviews, member activity and exports. 93 endpoints.

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
| GET | [`/admin/member/fetch_spark_purchase_history`](https://aisleapidocs.netlify.app/#/aisle/code-033) | Get member spark purchase history _(from code)_ |
| GET | [`/admin/members/download_account_data`](https://aisleapidocs.netlify.app/#/aisle/code-034) | Export member account data _(from code)_ |
| GET | [`/admin/stories/fetch_deleted_reasons`](https://aisleapidocs.netlify.app/#/aisle/code-035) | List account deletion reasons _(from code)_ |
| POST | [`/V1/campaign/create`](https://aisleapidocs.netlify.app/#/aisle/code-135) | Create campaign _(from code)_ |
| POST | [`/admin/login`](https://aisleapidocs.netlify.app/#/aisle/code-136) | CMS admin login _(from code)_ |
| POST | [`/admin/logout`](https://aisleapidocs.netlify.app/#/aisle/code-137) | CMS admin logout _(from code)_ |
| POST | [`/admin/authenticate_rotp`](https://aisleapidocs.netlify.app/#/aisle/code-138) | Verify CMS admin TOTP code _(from code)_ |
| POST | [`/admin/pending/reports_tab_update_state`](https://aisleapidocs.netlify.app/#/aisle/code-139) | Mark reported profiles reviewed _(from code)_ |
| POST | [`/admin/images`](https://aisleapidocs.netlify.app/#/aisle/code-140) | Upload CMS image _(from code)_ |
| GET | [`/admin/images/fetch_presigned_url`](https://aisleapidocs.netlify.app/#/aisle/code-141) | Get presigned photo upload URLs _(from code)_ |
| GET | [`/admin/images/list_multiple_profiles`](https://aisleapidocs.netlify.app/#/aisle/code-142) | List approved members' photo updates _(from code)_ |
| GET | [`/admin/images/list_multiple_profiles_disapproved`](https://aisleapidocs.netlify.app/#/aisle/code-143) | List disapproved members' photo updates _(from code)_ |
| POST | [`/admin/reviews/dismiss_multiple`](https://aisleapidocs.netlify.app/#/aisle/code-144) | Dismiss flagged bio reviews _(from code)_ |
| POST | [`/admin/reviews/dismiss`](https://aisleapidocs.netlify.app/#/aisle/code-145) | Dismiss one flagged bio review _(from code)_ |
| GET | [`/admin/member/fetch_money_back_guarantee_info`](https://aisleapidocs.netlify.app/#/aisle/code-146) | Get money-back guarantee info _(from code)_ |
| GET | [`/admin/member/fetch_image_history`](https://aisleapidocs.netlify.app/#/aisle/code-147) | Get member photo upload history _(from code)_ |
| GET | [`/admin/member/fetch_incognito_history`](https://aisleapidocs.netlify.app/#/aisle/code-148) | Get member incognito history _(from code)_ |
| GET | [`/admin/member/fetch_boost_history`](https://aisleapidocs.netlify.app/#/aisle/code-149) | Get member boost history _(from code)_ |
| GET | [`/admin/members/banned_profile_list`](https://aisleapidocs.netlify.app/#/aisle/code-150) | List banned profiles _(from code)_ |
| POST | [`/admin/members/remove_selfie_verification`](https://aisleapidocs.netlify.app/#/aisle/code-151) | Reset member selfie verification _(from code)_ |
| POST | [`/admin/members/cancel_subscription`](https://aisleapidocs.netlify.app/#/aisle/code-152) | Cancel member PhonePe autopay _(from code)_ |
| GET | [`/admin/members/list_subscriptions`](https://aisleapidocs.netlify.app/#/aisle/code-153) | List member subscriptions _(from code)_ |
| POST | [`/admin/members/update_subscription_end_date`](https://aisleapidocs.netlify.app/#/aisle/code-154) | Change subscription end date _(from code)_ |
| GET | [`/admin/members/get_dropdown_values`](https://aisleapidocs.netlify.app/#/aisle/code-155) | Get CMS profile dropdown values _(from code)_ |
| GET | [`/admin/members/fetch_state_history_dropdown_values`](https://aisleapidocs.netlify.app/#/aisle/code-156) | Get ban reason filter options _(from code)_ |
| POST | [`/admin/members/enable_exclusivity`](https://aisleapidocs.netlify.app/#/aisle/code-157) | Enable chat exclusivity for member _(from code)_ |
| POST | [`/admin/members/delete_account_by_admin`](https://aisleapidocs.netlify.app/#/aisle/code-158) | Delete member account (CMS) _(from code)_ |
| POST | [`/admin/members/fetch_curator_logs`](https://aisleapidocs.netlify.app/#/aisle/code-159) | Get CMS actions on member _(from code)_ |
| GET | [`/admin/members/fetch_curator_logs`](https://aisleapidocs.netlify.app/#/aisle/code-160) | Get CMS actions on member _(from code)_ |
| GET | [`/admin/scoreboard/curation`](https://aisleapidocs.netlify.app/#/aisle/code-161) | Get curation scoreboard _(from code)_ |
| GET | [`/admin/scoreboard/today`](https://aisleapidocs.netlify.app/#/aisle/code-162) | Get business scoreboard _(from code)_ |
| GET | [`/admin/reports/phone_codes`](https://aisleapidocs.netlify.app/#/aisle/code-163) | List phone country codes _(from code)_ |
| GET | [`/admin/reports/otp_by_phonenumber`](https://aisleapidocs.netlify.app/#/aisle/code-164) | Search OTP SMS logs _(from code)_ |
| POST | [`/admin/sharing/create`](https://aisleapidocs.netlify.app/#/aisle/code-165) | Share profile ref for review _(from code)_ |
| POST | [`/admin/sharing/create_bulk`](https://aisleapidocs.netlify.app/#/aisle/code-166) | Share many profile refs _(from code)_ |
| GET | [`/admin/sharing/list`](https://aisleapidocs.netlify.app/#/aisle/code-167) | List shared profile refs _(from code)_ |
| POST | [`/admin/sharing/toggle_checked`](https://aisleapidocs.netlify.app/#/aisle/code-168) | Mark shared ref reviewed _(from code)_ |
| GET | [`/admin/events/cities`](https://aisleapidocs.netlify.app/#/aisle/code-169) | List offline event cities _(from code)_ |
| POST | [`/admin/events/create_event`](https://aisleapidocs.netlify.app/#/aisle/code-170) | Create or edit offline event _(from code)_ |
| GET | [`/admin/events/all`](https://aisleapidocs.netlify.app/#/aisle/code-171) | List offline events _(from code)_ |
| POST | [`/admin/events/update_event_state`](https://aisleapidocs.netlify.app/#/aisle/code-172) | Change offline event state _(from code)_ |

<a id="api-136"></a>

#### `GET /users/:ref` — Users by ref

**Users by ref.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS (browser session) · **Auth** Admin browser session cookie · **Operation** Read (admin) · **Code** `app/controllers/users_controller.rb; config/routes.rb#L418`

**Request**

Request fields: none

**End-to-end flow**

_Code path — First name, Email, Phone_

`Profile.get_specific_user_for_admin` → `detailed_for_admin serializer`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`send_misuse_email` → `send_about_warning` → `get_first_name`

_Code path — Email_

`send_misuse_email` → `send_about_warning` → `fetch_email`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name, Email, Phone_

`Profile.get_specific_user_for_admin` → `detailed_for_admin serializer`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`approve_and_edit` → `update_profile_data` → `update_application_by_admin!` → `assign_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`update_profile` → `update_profile_data` → `update_application_by_admin!` → `assign_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`disapprove` → `disapprove_profile` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`curation_tab` → `pending_profile_list` → `curation_tab_pending` → `get_flags_raised` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`vip_tab` → `fetch_vip_users` → `curation_tab_pending` → `get_flags_raised` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`people_hni_tab` → `people_hni_tab_list` → `curation_tab_pending` → `get_flags_raised` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`people_hni_tab_update_profiles` → `update_hni_registry` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`curation_tab_update_profiles_state` → `add_to_list` → `pending_profile_list` → `curation_tab_pending` → `get_flags_raised` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`vip_tab_update_profiles_state` → `add_to_list` → `pending_profile_list` → `curation_tab_pending` → `get_flags_raised` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`list_multiple_profiles_v1` → `fetch_pending_image_list` → `pending_image_response_1` → `get_first_name_for_user`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`images_updates_tab` → `update_profile_images` → `assign_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`list_auto_updates_images` → `fetch_pending_auto_updates_images` → `pending_image_response_1` → `get_first_name_for_user`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`auto_updates_images_update` → `update_profile_images` → `assign_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`list_multiple_profiles_disapproved_v1` → `fetch_pending_image_update_disapproved_profile_list_2` → `curation_tab_disapproved` → `get_first_name_for_user`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`approve_reject_multiple_photos_v1` → `update_profile_images` → `assign_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`approve_reject_multiple_photos_disapproved` → `assign_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`mark_selfie_verified` → `verify_selfie_admin` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `reviews` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)
- `total_pages` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`list_multiple` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `review_data` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)
- `total_pages` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`fetch_individual` → `get_first_name`

_Code path — Phone_

`fetch_individual` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`update_multiple` → `update_individual` → `send_about_warning` → `get_first_name`

_Code path — Email_

`update_multiple` → `update_individual` → `send_about_warning` → `fetch_email`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`save` → `update_individual` → `send_about_warning` → `get_first_name`

_Code path — Email_

`save` → `update_individual` → `send_about_warning` → `fetch_email`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `profile_list` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)
- `total_pages` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`search` → `get_first_name`

_Code path — Email_

`search` → `fetch_email`

_Code path — Phone_

`search` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**What changed** (latest 3 of 4; all on the website)

- 2026-10-29 — Response field added: `total_pages` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:25 @004e72c`
- 2026-10-29 — Response field added: `page` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:25 @004e72c`
- 2026-10-29 — Response field added: `profile_list` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:25 @004e72c`

<a id="api-161"></a>

#### `GET /admin/member/aws_moderated_list` — Aws moderated list

**Aws moderated list.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L608`

**Request**

Request fields: `page`

**Response fields** (top level; type not stated unless shown)

- `moderation_list` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)
- `total_pages` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`aws_moderated_list` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `profile_list` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)
- `total_pages` (from code — confirm with Dev)
- `total_profiles` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`feed` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 5; all on the website)

- 2026-10-29 — Response field added: `total_profiles` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:228 @004e72c`
- 2026-10-29 — Response field added: `total_pages` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:228 @004e72c`
- 2026-10-29 — Response field added: `page` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:228 @004e72c`

<a id="api-163"></a>

#### `GET /admin/member/fetch_complete_info` — Fetch complete info

**Fetch complete info.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), Email (reads), Phone (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Batch read · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L610`

**Request**

Request fields: `ref`, `page`

**End-to-end flow**

_Code path — First name_

`fetch_complete_info` → `fetch_complete_details` → `fetch_connected_users_info` → `get_first_names_for_users`

_Code path — Email_

`fetch_complete_info` → `fetch_complete_details` → `admin_complete_details` → `fetch_email`

_Code path — Phone_

`fetch_complete_info` → `fetch_complete_details` → `admin_complete_details` → `fetch_only_number_with_phone_code_name` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`fetch_bait_profile_info` → `fetch_by_latest_interaction` → `fetch_complete_details` → `fetch_connected_users_info` → `get_first_names_for_users`

_Code path — Email_

`fetch_bait_profile_info` → `fetch_by_latest_interaction` → `fetch_complete_details` → `admin_complete_details` → `fetch_email`

_Code path — Phone_

`fetch_bait_profile_info` → `fetch_by_latest_interaction` → `fetch_complete_details` → `admin_complete_details` → `fetch_only_number_with_phone_code_name` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`fetch_connected_profiles` → `fetch_connected_users_info` → `get_first_names_for_users`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`user_activity_v1` → `user_reported_activity` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`ban_profile` → `ban_user` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`inappropriate_profile` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`review_update` → `approveImages` → `sync_profile_to_kafka` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `profiles` (from code — confirm with Dev)
- `page` (from code — confirm with Dev)
- `total_pages` (from code — confirm with Dev)
- `total_profiles` (from code — confirm with Dev)
- `total_profiles_all_states` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`autofeed` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| App database | `profiles.first_name` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**What changed** (latest 3 of 7; all on the website)

- 2026-10-29 — Response field added: `total_profiles_all_states` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:348 @004e72c`
- 2026-10-29 — Response field added: `total_profiles` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:348 @004e72c`
- 2026-10-29 — Response field added: `total_pages` · from code — confirm with Dev · `app/controllers/admin/members_controller.rb:348 @004e72c`

<a id="api-171"></a>

#### `GET /admin/members/retry_curation_bucket_list` — Retry curation bucket list

**Retry curation bucket list.** Admin views, edits, search, curation, reviews, member activity and exports.

Personal data: First name (reads), through the app’s PII integration.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** CMS admin panel · **Auth** CMS admin JWT + webcms + admin OTP · **Operation** Read (admin) · **Code** `app/controllers/admin/members_controller.rb; config/routes.rb#L624`

**Request**

Request fields: `page`

**End-to-end flow**

_Code path — First name_

`retry_curation_bucket_list` → `fetch_failed_review_profile_list` → `curation_tab_pending` → `get_flags_raised` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`fetch_verified_profile` → `fetch_verified_not_admin_approved_profiles_list` → `verified_account` → `curation_tab_pending` → `get_flags_raised` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`update_verified_profile` → `update_verified_profiles_list` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `message` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`refund_payment` → `initiate_refund` → `refund_subscription` → `check_for_duplicate_payments` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `is_active` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`toggle_subscription` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)
- `message` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`capture_payment` → `cms_restore_purchase` → `restore_purchase` → `validate_receipt_data` → `validate_ios_consumable_response` → `activate_any_subscription` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_f…`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`correct_profile_location` → `fetch_complete_details` → `fetch_connected_users_info` → `get_first_names_for_users`

_Code path — Email_

`correct_profile_location` → `fetch_complete_details` → `admin_complete_details` → `fetch_email`

_Code path — Phone_

`correct_profile_location` → `fetch_complete_details` → `admin_complete_details` → `fetch_only_number_with_phone_code_name` → `fetch_only_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`search_profiles` → `search_profiles_by_params` → `profile_response_cms` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`download_profile_details` → `fetch_profile_data_cms` → `create_profile_json_for_cyber_cell` → `get_first_name`

_Code path — Email_

`download_profile_details` → `fetch_profile_data_cms` → `create_profile_json_for_cyber_cell` → `fetch_email`

_Code path — Phone_

`download_profile_details` → `fetch_profile_data_cms` → `create_profile_json_for_cyber_cell` → `fetch_mobile_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**Response fields** (top level; type not stated unless shown)

- `status` (from code — confirm with Dev)

**End-to-end flow**

_Code path — First name_

`approve_disapprove_banned_profiles` → `approve_profile` → `assign_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`fetch_messages` → `fetch_two_user_connection_details` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`subscription_transfer` → `transfer_active_subscription` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`capture_android_payment` → `capture_android_payment_cms` → `verify_android_payment` → `add_consummable_or_subscription` → `add_subscription_data` → `activate_any_subscription_with_expiry` → `fill_cache!` → `create_profile_response` → `general_information` → `select_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`index` → `fetch_all` → `get_first_name`

_Code path — Email_

`index` → `fetch_all` → `fetch_email`

_Code path — Phone_

`index` → `fetch_all` → `fetch_mobile_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`index` → `fetch_all` → `fetch_by_latest_reported` → `get_first_name`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name, Email, Phone_

`ActiveAdmin IRL content` → `get_first_name / fetch_email / fetch_mobile_number`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`MembersController.autofeed_update` → `auto_curated_profiles` → `assign_first_name; normalized approve/reject/inappropriate arrays`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| App database | `profiles.first_name` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **From the developers:** The controller normalizes approve/reject/inappropriate and forces type=auto_curate, moveToFeed=true. Repeat with reject and inappropriate decisions on separate profiles.

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

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)
- `data` (seen on staging 2026-10-25)
- `error` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`PiiTestController` → `ProxyClient` → `NAME service contract`

_Code path — Email_

`PiiTestController` → `ProxyClient` → `EMAIL service contract`

_Code path — Phone_

`PiiTestController` → `ProxyClient` → `PHONE service contract`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | write (upsert) |
| PII database | `user_pii_field_value (field_name = EMAIL)` | write (upsert) |
| PII database | `user_pii_field_value (field_name = PHONE)` | write (upsert) |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Tip:** Writes through these routes go straight to the PII service and skip the app’s caches — app screens can keep showing the old value until the cache expires.

**What changed** (latest 3 of 4; all on the website)

- 2026-10-25 — Response field added: `error` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25

<a id="api-200"></a>

#### `POST /V1/api/v1/pii-test/read` — Read

**Read.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: First name (reads), Email (reads), Phone (reads), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct)

**Request**

Request fields: `user_id`, `field_names`

**Response fields** (top level; type not stated unless shown)

- `status` (seen on staging 2026-10-25)
- `message` (seen on staging 2026-10-25)
- `data` (seen on staging 2026-10-25)
- `error` (seen on staging 2026-10-25)

**End-to-end flow**

_Code path — First name_

`PiiTestController` → `ProxyClient` → `NAME service contract`

_Code path — Email_

`PiiTestController` → `ProxyClient` → `EMAIL service contract`

_Code path — Phone_

`PiiTestController` → `ProxyClient` → `PHONE service contract`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `user_pii_field_value (field_name = NAME)` | read |
| PII database | `user_pii_field_value (field_name = EMAIL)` | read |
| PII database | `user_pii_field_value (field_name = PHONE)` | read |
| Audit log | `audit_trails (MongoDB)` | write |

**Good to know**

- **Tip:** Writes through these routes go straight to the PII service and skip the app’s caches — app screens can keep showing the old value until the cache expires.

**What changed** (latest 3 of 4; all on the website)

- 2026-10-25 — Response field added: `error` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `data` · seen on staging 2026-10-25
- 2026-10-25 — Response field added: `message` · seen on staging 2026-10-25

<a id="api-201"></a>

#### `POST /V1/api/v1/pii-test/batch/read` — Batch read

**Batch read.** Direct routes to the PII service: save, read, search, bulk read, temporary phones, free-text keys, readiness.

Personal data: First name (reads), Email (reads), Phone (reads), directly in the PII service.

_Last verified 2026-10-29 · code @ 004e72c_

**Called by** Internal / test tooling · **Auth** TEST_TOKEN (Bearer) · **Operation** PII proxy (direct)

**Request**

Request fields: `user_ids`, `fields`

**End-to-end flow**

_Code path — First name_

`PiiTestController` → `ProxyClient` → `NAME service contract`

_Code path — Email_

`PiiTestController` → `ProxyClient` → `EMAIL service contract`

_Code path — Phone_

`PiiTestController` → `ProxyClient` → `PHONE service contract`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` · Email `ALLOW_PII_EMAIL_READ` · Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — First name_

`PiiTestController` → `ProxyClient` → `NAME service contract`

**Read switches:** First name `ALLOW_PII_FIRST_NAME_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — Email_

`PiiTestController` → `ProxyClient` → `EMAIL service contract`

**Read switches:** Email `ALLOW_PII_EMAIL_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — Phone_

`PiiTestController` → `ProxyClient` → `PHONE service contract`

**Read switches:** Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — Phone_

`PiiTestController transient-phone proxy; separate from normal OTP/login`

**Read switches:** Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — Phone_

`PiiTestController transient-phone proxy; separate from normal OTP/login`

**Read switches:** Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Code path — Phone_

`PiiTestController transient-phone proxy; separate from normal OTP/login`

**Read switches:** Phone `ALLOW_PII_PHONE_NUMBER_READ` (see [Personal data](#personal-data))

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

**End-to-end flow**

`Request with free text` → `PII service — free-text key` → `Aisle encrypts / decrypts the text`

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

**End-to-end flow**

_Free-text encryption — Free text_

`Request with free text` → `PII service — free-text key` → `Aisle encrypts / decrypts the text`

**Read switches:** Free text `—` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Free-text encryption — Free text_

`Request with free text` → `PII service — free-text key` → `Aisle encrypts / decrypts the text`

**Read switches:** Free text `—` (see [Personal data](#personal-data))

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

**End-to-end flow**

_Free-text encryption — Free text_

`Request with free text` → `PII service — free-text key` → `Aisle encrypts / decrypts the text`

**Read switches:** Free text `—` (see [Personal data](#personal-data))

**What it reads and writes**

| Store | Object | Access |
| --- | --- | --- |
| PII database | `free_text_encryption_key` | read / write |
| Audit log | `audit_trails (MongoDB)` | write |

<a id="area-g11"></a>

### App config & integrations

Reference lists, app releases, popups, tracking and analytics events, geo lookups and site pages. 68 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| GET | [`/V1/users/safety_tips`](https://aisleapidocs.netlify.app/#/aisle/code-173) | Safety tips _(from code)_ |
| POST | [`/V1/api/v1/pii-test/:field/search`](https://aisleapidocs.netlify.app/#/aisle/code-174) | PII test proxy: search field _(from code)_ |
| POST | [`/V1/notifications/get_tokens`](https://aisleapidocs.netlify.app/#/aisle/code-175) | Bulk notification push tokens _(from code)_ |
| GET | [`/V1/users/active_algorithms`](https://aisleapidocs.netlify.app/#/aisle/code-176) | Active matching algorithms _(from code)_ |
| GET | [`/V1/users/survey_question_list`](https://aisleapidocs.netlify.app/#/aisle/code-177) | Active survey questions _(from code)_ |
| GET | [`/V1/user/fetch_data_for_auto_pop_up`](https://aisleapidocs.netlify.app/#/aisle/code-178) | Profile completion auto pop-up _(from code)_ |
| POST | [`/V1/users/update_curator_feedback_popup`](https://aisleapidocs.netlify.app/#/aisle/code-179) | Mark curator feedback seen _(from code)_ |
| POST | [`/V1/users/update_popup_action`](https://aisleapidocs.netlify.app/#/aisle/code-180) | Record pop-up action _(from code)_ |
| GET | [`/V1/sessions/monitor_api`](https://aisleapidocs.netlify.app/#/aisle/code-181) | Health check _(from code)_ |
| GET | [`/V1/sessions/ipapi_testing`](https://aisleapidocs.netlify.app/#/aisle/code-182) | IP lookup provider test _(from code)_ |
| POST | [`/V1/device/store_competitor_info`](https://aisleapidocs.netlify.app/#/aisle/code-183) | Store competitor app info _(from code)_ |
| GET | [`/V1/preferences`](https://aisleapidocs.netlify.app/#/aisle/code-184) | Philosophy preference list _(from code)_ |
| POST | [`/V1/user/update_adjust_id`](https://aisleapidocs.netlify.app/#/aisle/code-185) | Save Adjust device ids _(from code)_ |
| POST | [`/V1/users/update_adjust_id`](https://aisleapidocs.netlify.app/#/aisle/code-186) | Save Adjust device ids _(from code)_ |
| POST | [`/V1/otp/test_exotel_sms`](https://aisleapidocs.netlify.app/#/aisle/code-187) | Send test SMS via Exotel _(from code)_ |
| GET | [`/V1/user/formatted_address`](https://aisleapidocs.netlify.app/#/aisle/code-188) | Formatted address for coordinates _(from code)_ |
| GET | [`/V1/user/basic_app_launch`](https://aisleapidocs.netlify.app/#/aisle/code-189) | Basic app launch check _(from code)_ |
| POST | [`/V1/review/mark_read`](https://aisleapidocs.netlify.app/#/aisle/code-190) | Mark moderation warning read _(from code)_ |
| GET | [`/V1/introduction`](https://aisleapidocs.netlify.app/#/aisle/code-191) | Unused prompts list _(from code)_ |
| GET | [`/V1/popup/details`](https://aisleapidocs.netlify.app/#/aisle/code-192) | Fetch popup to display _(from code)_ |
| POST | [`/V1/event/update_personal_info`](https://aisleapidocs.netlify.app/#/aisle/code-193) | Forward event personal info _(from code)_ |
| POST | [`/V1/event/update_display_popup_state`](https://aisleapidocs.netlify.app/#/aisle/code-194) | Update event popup state _(from code)_ |
| GET | [`/V1/event/fetch_event_web_data`](https://aisleapidocs.netlify.app/#/aisle/code-195) | Fetch event web page data _(from code)_ |
| GET | [`/V1/geo/countries`](https://aisleapidocs.netlify.app/#/aisle/code-196) | List countries _(from code)_ |
| GET | [`/V1/geo/countries/:id/regions`](https://aisleapidocs.netlify.app/#/aisle/code-197) | List country regions _(from code)_ |
| POST | [`/V1/events/create_event`](https://aisleapidocs.netlify.app/#/aisle/code-198) | Create analytics event _(from code)_ |
| GET | [`/V1/events/index`](https://aisleapidocs.netlify.app/#/aisle/code-199) | Analytics events index _(from code)_ |
| GET | [`/V1/events/fetch_list`](https://aisleapidocs.netlify.app/#/aisle/code-200) | List a member's analytics events _(from code)_ |
| POST | [`/V1/speed_dating/remove_popup`](https://aisleapidocs.netlify.app/#/aisle/code-201) | Hide speed dating popup _(from code)_ |
| POST | [`/V1/paint_bar_mixer/update_display_popup_state`](https://aisleapidocs.netlify.app/#/aisle/code-202) | Update mixer popup state _(from code)_ |
| PUT | [`/V1/asn/whitelist`](https://aisleapidocs.netlify.app/#/aisle/code-203) | Whitelist ASN _(from code)_ |
| PUT | [`/V1/asn/blacklist`](https://aisleapidocs.netlify.app/#/aisle/code-204) | Blacklist ASN _(from code)_ |
| POST | [`/V1/track/notification`](https://aisleapidocs.netlify.app/#/aisle/code-205) | Update push notification status _(from code)_ |
| POST | [`/V1/track/create_notification`](https://aisleapidocs.netlify.app/#/aisle/code-206) | Create push notification record _(from code)_ |
| GET | [`/V1/track/test_notification`](https://aisleapidocs.netlify.app/#/aisle/code-207) | Run auto-renewal push task _(from code)_ |
| GET | [`/V1/fields/faiths/:id/casts`](https://aisleapidocs.netlify.app/#/aisle/code-208) | List castes for a faith _(from code)_ |
| GET | [`/V1/fields/phonecodes`](https://aisleapidocs.netlify.app/#/aisle/code-209) | List phone country codes _(from code)_ |
| GET | [`/V1/fileds/proxy_image`](https://aisleapidocs.netlify.app/#/aisle/code-210) | Proxy an image by URL _(from code)_ |
| GET | [`/V1/fields/interests`](https://aisleapidocs.netlify.app/#/aisle/code-211) | List interests _(from code)_ |
| GET | [`/V1/fields/interests_v2`](https://aisleapidocs.netlify.app/#/aisle/code-212) | List interests (v2) _(from code)_ |
| GET | [`/V1/fields/traits`](https://aisleapidocs.netlify.app/#/aisle/code-213) | List personality traits _(from code)_ |
| GET | [`/V1/fields/list_all`](https://aisleapidocs.netlify.app/#/aisle/code-214) | List all profile field options _(from code)_ |
| GET | [`/V1/fields/incomes`](https://aisleapidocs.netlify.app/#/aisle/code-215) | List income ranges _(from code)_ |
| GET | [`/V1/fields/advanced_search_list`](https://aisleapidocs.netlify.app/#/aisle/code-216) | Advanced search filter options _(from code)_ |
| GET | [`/V1/fields/meetup_restaurants`](https://aisleapidocs.netlify.app/#/aisle/code-217) | List meetup restaurants nearby _(from code)_ |
| GET | [`/V1/fields/fetch_meal_types`](https://aisleapidocs.netlify.app/#/aisle/code-218) | List meal types for restaurant _(from code)_ |
| GET | [`/V1/fields/settle_down_option_list`](https://aisleapidocs.netlify.app/#/aisle/code-219) | List settle-down options _(from code)_ |
| GET | [`/V1/fields/mbti_option_list`](https://aisleapidocs.netlify.app/#/aisle/code-220) | List MBTI options _(from code)_ |
| GET | [`/web/fields/faiths/:id/casts`](https://aisleapidocs.netlify.app/#/aisle/code-221) | Web: list castes for faith _(from code)_ |
| GET | [`/web/fields/phonecodes`](https://aisleapidocs.netlify.app/#/aisle/code-222) | Web: list phone codes _(from code)_ |
| GET | [`/web/fields/list_all`](https://aisleapidocs.netlify.app/#/aisle/code-223) | Web: list all field options _(from code)_ |
| GET | [`/web/events`](https://aisleapidocs.netlify.app/#/aisle/code-224) | Web: fetch event counters _(from code)_ |
| GET | [`/web/users/firebase_token`](https://aisleapidocs.netlify.app/#/aisle/code-225) | Web: get Firebase token _(from code)_ |
| GET | [`/web/geo/countries`](https://aisleapidocs.netlify.app/#/aisle/code-226) | Web: list countries _(from code)_ |
| GET | [`/web/geo/countries/:id/regions`](https://aisleapidocs.netlify.app/#/aisle/code-227) | Web: list country regions _(from code)_ |
| GET | [`/web/user/formatted_address`](https://aisleapidocs.netlify.app/#/aisle/code-228) | Web: formatted address for coordinates _(from code)_ |
| GET | [`/web/user/web_info`](https://aisleapidocs.netlify.app/#/aisle/code-229) | Web: fetch web info _(from code)_ |
| GET | [`/fields/faiths`](https://aisleapidocs.netlify.app/#/aisle/code-230) | Admin: list faiths _(from code)_ |
| GET | [`/fields/languages`](https://aisleapidocs.netlify.app/#/aisle/code-231) | Admin: list languages _(from code)_ |
| GET | [`/preferences`](https://aisleapidocs.netlify.app/#/aisle/code-232) | Admin: list preference questions _(from code)_ |
| GET | [`/query`](https://aisleapidocs.netlify.app/#/aisle/code-233) | Instagram redirect page _(from code)_ |
| GET | [`/geo/countries`](https://aisleapidocs.netlify.app/#/aisle/code-234) | Admin: list countries _(from code)_ |
| GET | [`/geo/countries/:id/regions`](https://aisleapidocs.netlify.app/#/aisle/code-235) | Admin: list country regions _(from code)_ |
| GET | [`/`](https://aisleapidocs.netlify.app/#/aisle/code-236) | Site root _(from code)_ |
| GET | [`/robots.txt`](https://aisleapidocs.netlify.app/#/aisle/code-237) | robots.txt _(from code)_ |
| POST | [`/find_page`](https://aisleapidocs.netlify.app/#/aisle/code-238) | Sign out and redirect home _(from code)_ |
| GET | [`/a`](https://aisleapidocs.netlify.app/#/aisle/code-239) | Sign out and redirect (short) _(from code)_ |
| GET | [`/cred_submit_page`](https://aisleapidocs.netlify.app/#/aisle/code-240) | CRED submit page redirect _(from code)_ |

<a id="area-g12"></a>

### Internal dashboard

Pages of the internal ActiveAdmin dashboard (`/bangalore745`): reports and operations tools for staff. 135 endpoints.

| Method | Path | What it is |
| --- | --- | --- |
| POST | [`/users/discardchanges`](https://aisleapidocs.netlify.app/#/aisle/code-241) | Admin: discard profile photo changes _(from code)_ |
| POST | [`/get_current_admin`](https://aisleapidocs.netlify.app/#/aisle/code-242) | Get current admin name _(from code)_ |
| POST | [`/bangalore745/curation`](https://aisleapidocs.netlify.app/#/aisle/code-243) | Curation report _(from code)_ |
| POST | [`/bangalore745/daily_acquired`](https://aisleapidocs.netlify.app/#/aisle/code-244) | Daily acquired users report _(from code)_ |
| POST | [`/bangalore745/daily_summary`](https://aisleapidocs.netlify.app/#/aisle/code-245) | Daily summary report _(from code)_ |
| POST | [`/bangalore745/refresh_daily_summary_data`](https://aisleapidocs.netlify.app/#/aisle/code-246) | Refresh daily summary cache _(from code)_ |
| POST | [`/bangalore745/onboarding`](https://aisleapidocs.netlify.app/#/aisle/code-247) | Onboarding funnel report _(from code)_ |
| POST | [`/bangalore745/engagement`](https://aisleapidocs.netlify.app/#/aisle/code-248) | Engagement report _(from code)_ |
| POST | [`/bangalore745/refresh_engagement_data`](https://aisleapidocs.netlify.app/#/aisle/code-249) | Refresh engagement cache _(from code)_ |
| POST | [`/bangalore745/refresh_engagement_montly_data`](https://aisleapidocs.netlify.app/#/aisle/code-250) | Refresh monthly engagement cache _(from code)_ |
| POST | [`/bangalore745/daily_summary1`](https://aisleapidocs.netlify.app/#/aisle/code-251) | Daily summary 1 (no page) _(from code)_ |
| POST | [`/bangalore745/daily_summary_ios`](https://aisleapidocs.netlify.app/#/aisle/code-252) | Daily iOS summary report _(from code)_ |
| POST | [`/bangalore745/refresh_daily_summary_ios_data`](https://aisleapidocs.netlify.app/#/aisle/code-253) | Refresh daily iOS summary cache _(from code)_ |
| POST | [`/bangalore745/daily_summary_android`](https://aisleapidocs.netlify.app/#/aisle/code-254) | Daily Android summary report _(from code)_ |
| POST | [`/bangalore745/refresh_daily_summary_android_data`](https://aisleapidocs.netlify.app/#/aisle/code-255) | Refresh daily Android summary cache _(from code)_ |
| POST | [`/bangalore745/daily_summary2`](https://aisleapidocs.netlify.app/#/aisle/code-256) | Daily summary 2 report _(from code)_ |
| POST | [`/bangalore745/refresh_daily_summary2_data`](https://aisleapidocs.netlify.app/#/aisle/code-257) | Refresh daily summary 2 cache _(from code)_ |
| POST | [`/bangalore745/bucket_summary`](https://aisleapidocs.netlify.app/#/aisle/code-258) | Profile bucket summary report _(from code)_ |
| POST | [`/bangalore745/daily_agewise`](https://aisleapidocs.netlify.app/#/aisle/code-259) | Daily age-wise report _(from code)_ |
| POST | [`/bangalore745/daily_citywise`](https://aisleapidocs.netlify.app/#/aisle/code-260) | Daily city-wise report _(from code)_ |
| POST | [`/bangalore745/daily_citywise_rev`](https://aisleapidocs.netlify.app/#/aisle/code-261) | Daily city-tier revenue report _(from code)_ |
| POST | [`/bangalore745/daily_statewise`](https://aisleapidocs.netlify.app/#/aisle/code-262) | Daily state-wise report _(from code)_ |
| POST | [`/bangalore745/daily_summary3`](https://aisleapidocs.netlify.app/#/aisle/code-263) | Daily summary 3 report _(from code)_ |
| POST | [`/bangalore745/daily_subs`](https://aisleapidocs.netlify.app/#/aisle/code-264) | Daily subscriptions report _(from code)_ |
| POST | [`/bangalore745/daily_arpu`](https://aisleapidocs.netlify.app/#/aisle/code-265) | Daily ARPU report _(from code)_ |
| POST | [`/bangalore745/monthly_arpu`](https://aisleapidocs.netlify.app/#/aisle/code-266) | Monthly ARPU report _(from code)_ |
| POST | [`/bangalore745/daily_buys`](https://aisleapidocs.netlify.app/#/aisle/code-267) | Daily purchases by source report _(from code)_ |
| POST | [`/bangalore745/monthly_buys`](https://aisleapidocs.netlify.app/#/aisle/code-268) | Monthly purchases by source report _(from code)_ |
| POST | [`/bangalore745/monthly_summary`](https://aisleapidocs.netlify.app/#/aisle/code-269) | Monthly summary report _(from code)_ |
| POST | [`/bangalore745/refresh_monthly_summary_data`](https://aisleapidocs.netlify.app/#/aisle/code-270) | Refresh monthly summary cache _(from code)_ |
| POST | [`/bangalore745/monthly_summary_android`](https://aisleapidocs.netlify.app/#/aisle/code-271) | Monthly Android summary report _(from code)_ |
| POST | [`/bangalore745/refresh_monthly_summary_android_data`](https://aisleapidocs.netlify.app/#/aisle/code-272) | Refresh monthly Android summary cache _(from code)_ |
| POST | [`/bangalore745/monthly_summary_ios`](https://aisleapidocs.netlify.app/#/aisle/code-273) | Monthly iOS summary report _(from code)_ |
| POST | [`/bangalore745/refresh_monthly_summary_ios_data`](https://aisleapidocs.netlify.app/#/aisle/code-274) | Refresh monthly iOS summary cache _(from code)_ |
| POST | [`/bangalore745/monthly_summary2`](https://aisleapidocs.netlify.app/#/aisle/code-275) | Monthly summary 2 report _(from code)_ |
| POST | [`/bangalore745/monthly_summary3`](https://aisleapidocs.netlify.app/#/aisle/code-276) | Monthly summary 3 report _(from code)_ |
| POST | [`/bangalore745/monthly_agewise`](https://aisleapidocs.netlify.app/#/aisle/code-277) | Monthly age-wise report _(from code)_ |
| POST | [`/bangalore745/monthly_citywise`](https://aisleapidocs.netlify.app/#/aisle/code-278) | Monthly city-wise report _(from code)_ |
| POST | [`/bangalore745/monthly_citywise_rev`](https://aisleapidocs.netlify.app/#/aisle/code-279) | Monthly city-tier revenue report _(from code)_ |
| POST | [`/bangalore745/monthly_statewise`](https://aisleapidocs.netlify.app/#/aisle/code-280) | Monthly state-wise report _(from code)_ |
| POST | [`/bangalore745/monthly_subs`](https://aisleapidocs.netlify.app/#/aisle/code-281) | Monthly subscriptions report _(from code)_ |
| POST | [`/bangalore745/yearly_summary`](https://aisleapidocs.netlify.app/#/aisle/code-282) | Yearly summary report _(from code)_ |
| POST | [`/bangalore745/refresh_yearly_summary_data`](https://aisleapidocs.netlify.app/#/aisle/code-283) | Refresh yearly summary cache _(from code)_ |
| POST | [`/bangalore745/top_cities`](https://aisleapidocs.netlify.app/#/aisle/code-284) | Top paying cities report _(from code)_ |
| POST | [`/bangalore745/refresh_top_cities_data`](https://aisleapidocs.netlify.app/#/aisle/code-285) | Refresh top cities cache _(from code)_ |
| POST | [`/bangalore745/refresh_top_states_data`](https://aisleapidocs.netlify.app/#/aisle/code-286) | Refresh top states cache _(from code)_ |
| POST | [`/bangalore745/refresh_top_countries_data`](https://aisleapidocs.netlify.app/#/aisle/code-287) | Refresh top countries cache _(from code)_ |
| POST | [`/bangalore745/top_cities_by_state`](https://aisleapidocs.netlify.app/#/aisle/code-288) | Top cities by state report _(from code)_ |
| POST | [`/bangalore745/top_states`](https://aisleapidocs.netlify.app/#/aisle/code-289) | Top paying states report _(from code)_ |
| POST | [`/bangalore745/top_countries`](https://aisleapidocs.netlify.app/#/aisle/code-290) | Top paying countries report _(from code)_ |
| POST | [`/bangalore745/monthly_cities`](https://aisleapidocs.netlify.app/#/aisle/code-291) | Monthly top paying cities report _(from code)_ |
| POST | [`/bangalore745/monthly_countries`](https://aisleapidocs.netlify.app/#/aisle/code-292) | Monthly top paying countries report _(from code)_ |
| POST | [`/bangalore745/monthly_revenue`](https://aisleapidocs.netlify.app/#/aisle/code-293) | Monthly revenue report _(from code)_ |
| POST | [`/bangalore745/monthly_ages`](https://aisleapidocs.netlify.app/#/aisle/code-294) | Monthly top paying age groups report _(from code)_ |
| POST | [`/bangalore745/monthly_age_split`](https://aisleapidocs.netlify.app/#/aisle/code-295) | Monthly age split report _(from code)_ |
| POST | [`/bangalore745/days_to_purchase`](https://aisleapidocs.netlify.app/#/aisle/code-296) | Days to first purchase report _(from code)_ |
| POST | [`/bangalore745/days_to_purchase_approved`](https://aisleapidocs.netlify.app/#/aisle/code-297) | Days to purchase after approval _(from code)_ |
| POST | [`/bangalore745/daily_purchases`](https://aisleapidocs.netlify.app/#/aisle/code-298) | Daily VIP purchases report _(from code)_ |
| POST | [`/bangalore745/daily_onboarding`](https://aisleapidocs.netlify.app/#/aisle/code-299) | Daily onboarding report _(from code)_ |
| POST | [`/bangalore745/daily_engagement`](https://aisleapidocs.netlify.app/#/aisle/code-300) | Daily ask-out engagement report _(from code)_ |
| POST | [`/bangalore745/daily_engagement2`](https://aisleapidocs.netlify.app/#/aisle/code-301) | Daily engagement 2 report _(from code)_ |
| POST | [`/bangalore745/refresh_daily_engagement2`](https://aisleapidocs.netlify.app/#/aisle/code-302) | Refresh daily engagement 2 cache _(from code)_ |
| POST | [`/bangalore745/daily_engagement23`](https://aisleapidocs.netlify.app/#/aisle/code-303) | Daily engagement 23 report _(from code)_ |
| POST | [`/bangalore745/refresh_daily_engagement23`](https://aisleapidocs.netlify.app/#/aisle/code-304) | Refresh daily engagement 23 cache _(from code)_ |
| POST | [`/bangalore745/daily_engagement24`](https://aisleapidocs.netlify.app/#/aisle/code-305) | Daily engagement 24 report _(from code)_ |
| POST | [`/bangalore745/refresh_daily_engagement24`](https://aisleapidocs.netlify.app/#/aisle/code-306) | Refresh daily engagement 24 cache _(from code)_ |
| POST | [`/bangalore745/daily_engagement3`](https://aisleapidocs.netlify.app/#/aisle/code-307) | Daily engagement 3 report _(from code)_ |
| POST | [`/bangalore745/refresh_daily_engagement3`](https://aisleapidocs.netlify.app/#/aisle/code-308) | Refresh daily engagement 3 cache _(from code)_ |
| POST | [`/bangalore745/daily_engagement_ios`](https://aisleapidocs.netlify.app/#/aisle/code-309) | Daily Engagement iOS _(from code)_ |
| POST | [`/bangalore745/refresh_daily_engagement_ios`](https://aisleapidocs.netlify.app/#/aisle/code-310) | Refresh Daily Engagement iOS _(from code)_ |
| POST | [`/bangalore745/daily_engagement_android`](https://aisleapidocs.netlify.app/#/aisle/code-311) | Daily Engagement Android _(from code)_ |
| POST | [`/bangalore745/refresh_daily_engagement_android`](https://aisleapidocs.netlify.app/#/aisle/code-312) | Refresh Daily Engagement Android _(from code)_ |
| POST | [`/bangalore745/daily_dates`](https://aisleapidocs.netlify.app/#/aisle/code-313) | Daily Dates _(from code)_ |
| POST | [`/bangalore745/daily_gateway`](https://aisleapidocs.netlify.app/#/aisle/code-314) | Daily Gateway _(from code)_ |
| POST | [`/bangalore745/monthly_gateway`](https://aisleapidocs.netlify.app/#/aisle/code-315) | Monthly Gateway _(from code)_ |
| POST | [`/bangalore745/razorpay_payment_capture`](https://aisleapidocs.netlify.app/#/aisle/code-316) | Razorpay Payment Capture _(from code)_ |
| POST | [`/bangalore745/paytm_payment_capture`](https://aisleapidocs.netlify.app/#/aisle/code-317) | Paytm Payment Capture _(from code)_ |
| POST | [`/bangalore745/cashfree_payment_capture`](https://aisleapidocs.netlify.app/#/aisle/code-318) | Cashfree Payment Capture _(from code)_ |
| POST | [`/bangalore745/cashfree_payment_refund`](https://aisleapidocs.netlify.app/#/aisle/code-319) | Cashfree Payment Refund _(from code)_ |
| POST | [`/bangalore745/payment_correction_update`](https://aisleapidocs.netlify.app/#/aisle/code-320) | Payment Correction Update _(from code)_ |
| POST | [`/bangalore745/daily_nri`](https://aisleapidocs.netlify.app/#/aisle/code-321) | Daily NRI _(from code)_ |
| POST | [`/bangalore745/stats`](https://aisleapidocs.netlify.app/#/aisle/code-322) | Stats _(from code)_ |
| POST | [`/bangalore745/monthly_platform`](https://aisleapidocs.netlify.app/#/aisle/code-323) | Monthly Platform _(from code)_ |
| POST | [`/bangalore745/age_range`](https://aisleapidocs.netlify.app/#/aisle/code-324) | Age Range (missing target) _(from code)_ |
| POST | [`/bangalore745/irl`](https://aisleapidocs.netlify.app/#/aisle/code-325) | IRL Event Booking _(from code)_ |
| POST | [`/bangalore745/bucket_revenue`](https://aisleapidocs.netlify.app/#/aisle/code-326) | Bucket Revenue _(from code)_ |
| POST | [`/bangalore745/live_audio`](https://aisleapidocs.netlify.app/#/aisle/code-327) | Live Audio Report _(from code)_ |
| POST | [`/bangalore745/sales`](https://aisleapidocs.netlify.app/#/aisle/code-328) | Sales _(from code)_ |
| POST | [`/bangalore745/refresh_sales_data`](https://aisleapidocs.netlify.app/#/aisle/code-329) | Refresh Sales Data _(from code)_ |
| POST | [`/bangalore745/likes`](https://aisleapidocs.netlify.app/#/aisle/code-330) | Likes _(from code)_ |
| POST | [`/bangalore745/refresh_likes_data`](https://aisleapidocs.netlify.app/#/aisle/code-331) | Refresh Likes Data _(from code)_ |
| POST | [`/bangalore745/yearly_engagement`](https://aisleapidocs.netlify.app/#/aisle/code-332) | Yearly Engagement _(from code)_ |
| POST | [`/bangalore745/refresh_yearly_engagement`](https://aisleapidocs.netlify.app/#/aisle/code-333) | Refresh Yearly Engagement _(from code)_ |
| POST | [`/bangalore745/bulk_push_notification`](https://aisleapidocs.netlify.app/#/aisle/code-334) | Bulk Push Notification (missing target) _(from code)_ |
| POST | [`/bangalore745/revenue`](https://aisleapidocs.netlify.app/#/aisle/code-335) | Revenue Analysis _(from code)_ |
| POST | [`/bangalore745/fields_phonecodes`](https://aisleapidocs.netlify.app/#/aisle/code-336) | Fields Phonecodes (missing target) _(from code)_ |
| POST | [`/bangalore745/arpu_age`](https://aisleapidocs.netlify.app/#/aisle/code-337) | ARPU by Age _(from code)_ |
| POST | [`/bangalore745/arpu_country`](https://aisleapidocs.netlify.app/#/aisle/code-338) | ARPU by Country _(from code)_ |
| POST | [`/bangalore745/arpu_language`](https://aisleapidocs.netlify.app/#/aisle/code-339) | ARPU by Language _(from code)_ |
| POST | [`/bangalore745/arpu_nri_language`](https://aisleapidocs.netlify.app/#/aisle/code-340) | ARPU NRI by Language _(from code)_ |
| POST | [`/bangalore745/arpu_state`](https://aisleapidocs.netlify.app/#/aisle/code-341) | ARPU by State _(from code)_ |
| POST | [`/bangalore745/app_usage`](https://aisleapidocs.netlify.app/#/aisle/code-342) | App Usage _(from code)_ |
| POST | [`/bangalore745/daily_otps`](https://aisleapidocs.netlify.app/#/aisle/code-343) | Daily OTPs _(from code)_ |
| POST | [`/bangalore745/:title/notification`](https://aisleapidocs.netlify.app/#/aisle/code-344) | Title Notification (missing target) _(from code)_ |
| POST | [`/bangalore745/health`](https://aisleapidocs.netlify.app/#/aisle/code-345) | Health _(from code)_ |
| POST | [`/bangalore745/notification`](https://aisleapidocs.netlify.app/#/aisle/code-346) | Notification (missing target) _(from code)_ |
| POST | [`/bangalore745/configuration_constants`](https://aisleapidocs.netlify.app/#/aisle/code-347) | Configuration Constants (missing target) _(from code)_ |
| POST | [`/bangalore745/configuration_constant/edit`](https://aisleapidocs.netlify.app/#/aisle/code-348) | Configuration Constant Edit (missing target) _(from code)_ |
| POST | [`/bangalore745/common_constants`](https://aisleapidocs.netlify.app/#/aisle/code-349) | Common Constants (missing target) _(from code)_ |
| POST | [`/bangalore745/common_constant/edit`](https://aisleapidocs.netlify.app/#/aisle/code-350) | Common Constant Edit (missing target) _(from code)_ |
| POST | [`/bangalore745/engagement_monthly`](https://aisleapidocs.netlify.app/#/aisle/code-351) | Engagement Monthly _(from code)_ |
| POST | [`/bangalore745/otp_by_country`](https://aisleapidocs.netlify.app/#/aisle/code-352) | OTP by Country _(from code)_ |
| POST | [`/bangalore745/language_by_country`](https://aisleapidocs.netlify.app/#/aisle/code-353) | Language by Country _(from code)_ |
| POST | [`/bangalore745/sms_provider_priority`](https://aisleapidocs.netlify.app/#/aisle/code-354) | SMS Provider Priority _(from code)_ |
| POST | [`/bangalore745/cashfree_price_change`](https://aisleapidocs.netlify.app/#/aisle/code-355) | Cashfree Price Change _(from code)_ |
| POST | [`/bangalore745/bad_actor`](https://aisleapidocs.netlify.app/#/aisle/code-356) | Bad Actor _(from code)_ |
| POST | [`/bangalore745/digital_good`](https://aisleapidocs.netlify.app/#/aisle/code-357) | Digital Good _(from code)_ |
| POST | [`/bangalore745/prematch`](https://aisleapidocs.netlify.app/#/aisle/code-358) | Prematch _(from code)_ |
| POST | [`/bangalore745/refresh_prematch_data`](https://aisleapidocs.netlify.app/#/aisle/code-359) | Refresh Prematch Data _(from code)_ |
| POST | [`/bangalore745/postmatch`](https://aisleapidocs.netlify.app/#/aisle/code-360) | Postmatch _(from code)_ |
| POST | [`/bangalore745/profile_edit`](https://aisleapidocs.netlify.app/#/aisle/code-361) | Profile Edit Report _(from code)_ |
| POST | [`/bangalore745/refresh_profile_edit`](https://aisleapidocs.netlify.app/#/aisle/code-362) | Refresh Profile Edit Report _(from code)_ |
| POST | [`/bangalore745/top_campaigns`](https://aisleapidocs.netlify.app/#/aisle/code-363) | Top Campaigns _(from code)_ |
| POST | [`/bangalore745/upload_csv`](https://aisleapidocs.netlify.app/#/aisle/code-364) | Upload Campaign CSV _(from code)_ |
| POST | [`/bangalore745/campaign_kpi`](https://aisleapidocs.netlify.app/#/aisle/code-365) | Campaign KPI _(from code)_ |
| POST | [`/bangalore745/top_source`](https://aisleapidocs.netlify.app/#/aisle/code-366) | Top Source _(from code)_ |
| POST | [`/bangalore745/save_campaign_end_date`](https://aisleapidocs.netlify.app/#/aisle/code-367) | Save Campaign End Date _(from code)_ |
| POST | [`/bangalore745/check_image_optimization`](https://aisleapidocs.netlify.app/#/aisle/code-368) | Check Image Optimization (missing target) _(from code)_ |
| POST | [`/bangalore745/image_optimization_details`](https://aisleapidocs.netlify.app/#/aisle/code-369) | Image Optimization Details _(from code)_ |
| POST | [`/bangalore745/update_appsflyer_data`](https://aisleapidocs.netlify.app/#/aisle/code-370) | Update AppsFlyer Data _(from code)_ |
| POST | [`/bangalore745/bulk_notifications`](https://aisleapidocs.netlify.app/#/aisle/code-371) | Bulk Notifications _(from code)_ |
| POST | [`/bangalore745/test_framework`](https://aisleapidocs.netlify.app/#/aisle/code-372) | Test Framework _(from code)_ |
| POST | [`/bangalore745/curator_feedback`](https://aisleapidocs.netlify.app/#/aisle/code-373) | Curator Feedback _(from code)_ |
| POST | [`/bangalore745/revenue_report_l1`](https://aisleapidocs.netlify.app/#/aisle/code-374) | Revenue Report L1 (missing target) _(from code)_ |
| POST | [`/bangalore745/revenue_report_l2`](https://aisleapidocs.netlify.app/#/aisle/code-375) | Revenue Report L2 _(from code)_ |
