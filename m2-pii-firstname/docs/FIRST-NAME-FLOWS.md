# First name: how each service gets it (flows explained, 12 Nov 2026)

This document collects the first-name flows traced in the code during the M2 manual run: where each service reads
the first name, who decrypts it, which stores hold copies, and what that means for testing. It complements
[PATH-BASED-TESTING.md](PATH-BASED-TESTING.md), whose section 4.5 has the main read flow (path A-R2, lists of profiles).

**Evidence level:** everything marked _from code_ comes from reading the source and must be confirmed with Dev before
it becomes an expected result. Staging observations are marked _seen on staging_.

| Repo                        | Ref read                                                                 | Used for                           |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| Aisle backend `aisle_new`   | `18d9eb5` (6 Nov 2026), checked against `origin/develop_new` where noted | Aisle API, pushes, chat, Sparks    |
| Vernacs backend `desiapp`   | `origin/jup/pii` @ `b85773da4` (9 Nov 2026)                              | Vernacs PII cache and profile name |
| `notification-microservice` | `origin/jup/pii` @ `c361654` (28 Oct 2026)                               | Push delivery                      |
| `django_algorithm`          | `master` @ `599bb840` (2 Apr 2026); **no PII branch exists**             | Discover / concierge / share link  |

Contents:

1. [Who decrypts the first name](#1-who-decrypts-the-first-name)
2. [Redis keys that hold the first name](#2-redis-keys-that-hold-the-first-name)
3. [Vernacs: accounts with no PII row still show a name](#3-vernacs-accounts-with-no-pii-row-still-show-a-name)
4. [Push notifications](#4-push-notifications)
5. [Sparks](#5-sparks)
6. [Django (graph / recommendation service)](#6-django-graph--recommendation-service)
7. [Sockets: real-time chat, live audio, Kafka](#7-sockets-real-time-chat-live-audio-kafka)
8. [Redis: how the first-name cache works](#8-redis-how-the-first-name-cache-works)
9. [Tests to run in the Redis part](#9-tests-to-run-in-the-redis-part)
10. [Summary of gaps found (for Dev)](#10-summary-of-gaps-found-for-dev)

---

## 1. Who decrypts the first name

The PII DB stores each first name **encrypted** (`user_pii_field_value.ciphertext`, with nonce and auth tag). Only the
**PII service** holds the key. The apps never decrypt: they ask the PII service, which decrypts and returns the
plain value. QA does the same and never holds a key.

| Where QA reads the plain name | How                                                                                              | Covers                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Aisle PII test facade         | `POST https://testa2.aisle.co/api/v1/pii-test/batch/read` (or `/read`) with the Aisle test token | Aisle tenant only (Aisle sets the tenant)                 |
| Vernacs Redis PII cache       | `GET https://testapp.koode.co/admin/redis-keys?key=<Vernacs PII key>` as QA's Vernacs CMS admin  | Vernacs tenants; holds the value the PII service returned |
| Vernacs CMS member view       | `GET https://testapp.koode.co/admin/users/<ref>` (cross-check)                                   | Name through the Vernacs PII getter                       |
| PII DB (read-only)            | `encode(ciphertext,'base64')`, `octet_length(ciphertext)`                                        | Encrypted value + length only, never plain text           |

_Seen on staging:_ the ciphertext length equals the UTF-8 byte length of the name (e.g. `ஆஷா` = 9 bytes), so a length
match is a quick consistency check when the plain value can't be read.

### Exact calls (tokens and passwords are placeholders from `.env`; never paste real values)

**Aisle**

```bash
curl -X POST 'https://testa2.aisle.co/api/v1/pii-test/batch/read' \
  -H 'Authorization: Bearer $AISLE_TEST_TOKEN' -H 'Content-Type: application/json' \
  -d '{"user_ids":["19851863","19849222"],"fields":["NAME"]}'
# → {"data":{"tenant_id":"aisle","count":2,"items":[{"user_id":"19851863","field":"NAME","value":"QaNew"}, …]}}
# single user: POST /api/v1/pii-test/read  {"user_id":"19851863","field_names":["NAME"]}
```

**Vernacs** (log in once, then read the key)

```bash
# 1. CMS admin login → auth_token
curl -X POST 'https://testapp.koode.co/admin/login' \
  -H 'Content-Type: application/json' -H 'webcms: true' -H 'app-name: Neene' \
  -d '{"email":"$M2FN_VN_CMS_ADMIN_EMAIL","encrypted_password":"$M2FN_VN_CMS_ADMIN_PASSWORD"}'
# 2. OTP from the admin's authenticator
curl -X POST 'https://testapp.koode.co/admin/authenticate_rotp' \
  -H 'Authorization: Bearer $VN_CMS_TOKEN' -H 'Content-Type: application/json' -H 'webcms: true' -H 'app-name: Neene' \
  -d '{"otp":"123456"}'
# 3. Read the cached PII name (Neene, user 11739267)
curl -G 'https://testapp.koode.co/admin/redis-keys' \
  -H 'Authorization: Bearer $VN_CMS_TOKEN' -H 'webcms: true' -H 'app-name: Neene' \
  --data-urlencode 'key=pii:v1:c3RhZ2luZw:ZGVzaWFwcC1yYWlscw:ZGVzaWFwcC1uZWVuZQ:dXNlcg:MTE3MzkyNjc:TkFNRQ'
# → {"value":"QaNeeneNew"}
```

Rules: GET only on the Redis route unless the tester asks for a delete; only our own test users' keys; never config
keys; never `/admin/logout` (it resets the admin's OTP).

---

## 2. Redis keys that hold the first name

| App     | Key                                                                                  | Value                                                 | Written by                                                                                          |
| ------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Aisle   | `pii:v1:user:<user_id>:first_name`                                                   | Plain name from the PII service                       | Aisle backend on a PII read or write; TTL `PII_DECRYPTED_CACHE_TTL` (default 2,592,000 s = 30 days) |
| Aisle   | `AISLE_staging_profile_<ref>`                                                        | Profile JSON; `first_name` is the initial when hidden | Aisle backend profile cache (also read by Django, §6)                                               |
| Vernacs | `pii:v1:<b64 env>:<b64 caller>:<b64 tenant>:<b64 "user">:<b64 user_id>:<b64 "NAME">` | Plain name from the PII service                       | Vernacs backend, only when PII returns a value                                                      |
| Vernacs | `DESIAPP_staging_profile_<ref>`                                                      | Profile JSON (`general_information.first_name`)       | Vernacs backend profile cache                                                                       |

### How the Vernacs PII key is built (_from code_)

`app/services/pii/cache.rb:14-18` (desiapp `jup/pii`):

```ruby
def key(tenant_id:, parts:)
  segments = [Rails.env, Config.caller_id, tenant_id, *parts]
  'pii:v1:' + segments.map { |part| Base64.urlsafe_encode64(part.to_s, padding: false) }.join(':')
end
```

| Part      | Staging value                                    | Source                                                                                        |
| --------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Rails.env | `staging`                                        | Server environment (_seen on staging_: keys found with it)                                    |
| caller_id | `desiapp-rails`                                  | `config.rb:7`, env `PII_SERVICE_CALLER_ID`                                                    |
| tenant_id | `desiapp-arike` / `-anbe` / `-neetho` / `-neene` | `app_lists.pii_tenant_id` by the user's app_id (2 Arike, 3 HeyDil, 4 Anbe, 5 Neetho, 6 Neene) |
| parts     | `user`, `<user_id>`, `NAME`                      | `field_store.rb:9`; `first_name` maps to `NAME` (`fields.rb:5`)                               |

Each part is base64url without padding, joined with `:`. Example, Neetho user 9482948:

```
pii:v1:c3RhZ2luZw:ZGVzaWFwcC1yYWlscw:ZGVzaWFwcC1uZWV0aG8:dXNlcg:OTQ4Mjk0OA:TkFNRQ
       staging    desiapp-rails      desiapp-neetho      user   9482948    NAME
```

The profile key is plain text: `create_key("profile_#{ref}")` = `PRODUCT_NAME_Rails.env_profile_<ref>`
(`app/models/cache/key.rb:43-44, 267`).

**When the keys exist:** the PII key is written only when PII returns a value (`cache.rb:38`, `unless value.nil?`)
and removed on a name write (`field_store.rb:57`). The profile key is rebuilt whenever the profile is fetched, so it
comes back after a clear as soon as someone opens the profile (_seen on staging_, 12 Nov).

---

## 3. Vernacs: accounts with no PII row still show a name

_Seen on staging (12 Nov):_ Arike accounts created before PII go-live (25 Oct) have **no PII NAME row**: 11739197
Kriti, 11739210 Tej, 11739239 Rakesh, 11739240 Rak; also Neetho 9482948 Sai. The app still shows their first name,
even after both Redis keys were cleared.

**Why (_from code_):** `app/services/pii/profile_hydrator.rb:27-40`:

```ruby
names = profiles.to_h { |p| [p[:user_id].to_s, p.read_attribute(:first_name)] }   # start with the Vernacs DB name
...
next unless Config.enabled?(context.app_id, 'name_read')                         # per-app pii_name_read switch
names.merge!(FieldStore.batch(tenant_id: …, user_ids: …, field: 'NAME'))          # overwrite with PII values
rescue UnavailableError → keep the DB names (batch_read_fallback)
```

The name starts as the **Vernacs DB value** and is replaced only for users PII returns. A user with no PII row is
simply missing from the PII answer, so the DB name stays, without any error. The same happens when PII is down.
Clearing Redis changes nothing, because that name never came from the cache.

**Why it matters:** the missing backfill is invisible in the app, and these users would show a blank name once the
Vernacs DB names are removed. Aisle's old accounts _were_ backfilled (e.g. Pavan, 13285007). Ask Dev: is a Vernacs
backfill planned, and is the silent fallback intended?

---

## 4. Push notifications

**The notification microservice never looks up the first name.** The Aisle backend fetches the name, applies the
hide rule, builds the finished title and message, and hands them over; the microservice only delivers them through
FCM. _Seen on staging:_ `USE_KAFKA_FOR_NOTIFICATION = false`, `ALLOW_PII_FIRST_NAME_READ = true`.

```
 ① USER ACTION (A's phone)
    comment · match accept · Spark · chat message
                 │
                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ ② AISLE BACKEND (Rails, testa2)                                   │
 │   Notifier / Chat / Spark code calls                              │
 │   sender_profile.select_first_name          (profile.rb:3145)     │
 └───────────────────────────────┬──────────────────────────────────┘
                                 │
                                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ ③ GET A's FIRST NAME                                              │
 │   ALLOW_PII_FIRST_NAME_READ = true on staging                     │
 │                                                                   │
 │   (a) REDIS   GET pii:v1:user:<A id>:first_name                   │
 │         ├─ HIT  → "HiddenName" ──────────────────────────┐        │
 │         └─ MISS ↓                                        │        │
 │   (b) PII SERVICE  POST /api/v1/pii/read  (signed call)  │        │
 │         PII service reads PII DB (ciphertext),           │        │
 │         decrypts with its own key, returns plain name    │        │
 │         → Aisle writes it back to Redis (TTL 30 days)    │        │
 │         ├─ error → exception, push not sent              │        │
 │         └─ OK → "HiddenName" ────────────────────────────┤        │
 │                                                          ▼        │
 │   (c) HIDE RULE   Aisle DB profiles.hide_first_name               │
 │         ON  → "H"  (first letter)                                 │
 │         OFF → "HiddenName"                                        │
 └───────────────────────────────┬──────────────────────────────────┘
                                 │  name = "H"
                                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ ④ QUEUE THE PUSH JOB (Sidekiq, Redis-backed)                      │
 │   data = { user_id: <receiver>, first_name / sender_name: "H",   │
 │            avatar, ... }                                          │
 │   USE_KAFKA_FOR_NOTIFICATION = false on staging                   │
 │      → PushNotificationWorker  (the Kafka worker is not used)     │
 └───────────────────────────────┬──────────────────────────────────┘
                                 │
                                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ ⑤ BUILD THE PUSH (worker, still the Aisle backend)                │
 │   Text.send_comment_push("H") / new_connection_push("H") /        │
 │   spark_received_push_message("H", "She") / chat title = "H"      │
 │   + Aisle DB: receiver's FCM tokens (DeviceInfo::FcmToken),       │
 │     receiver profile (gender, is_nri)                             │
 └───────────────────────────────┬──────────────────────────────────┘
                                 │  { serviceType: "push",
                                 │    android_push: { tokens, data: {title, message, ...} } }
          ┌──────────────────────┴───────────────────────┐
          │ Kafka OFF (staging now)                      │ Kafka ON
          │ HTTP POST NOTIFICATION_MICROSERVICE_URL      │ topic push_notification_events
          ▼                                              ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ ⑥ NOTIFICATION MICROSERVICE (Node.js)                             │
 │   /sendNotification  or  Kafka consumer                           │
 │   • NO first-name lookup: no PII, Redis or DB read for names      │
 │   • forwards title/message as received → FCM                      │
 │   • logs delivery in MongoDB track_push_notifications             │
 │     (status + notification_data; jup/pii strips title/body)       │
 └───────────────────────────────┬──────────────────────────────────┘
                                 ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ ⑦ FIREBASE (FCM) → B's phone:  "H commented on your profile"      │
 └──────────────────────────────────────────────────────────────────┘
```

**FCM** = Firebase Cloud Messaging, Google's push delivery service. Each installed app has an FCM token (the
phone's delivery address), stored by Aisle. FCM only carries the text it is given; it knows no names.

| Store                                       | Used for                                   | Holds the name?                         |
| ------------------------------------------- | ------------------------------------------ | --------------------------------------- |
| Redis (Aisle) `pii:v1:user:<id>:first_name` | Name cache, checked first                  | Yes, plain (from PII)                   |
| PII service → PII DB                        | Read on a Redis miss; the service decrypts | Encrypted in the DB, plain in the reply |
| Aisle DB `profiles.hide_first_name`         | Full name vs initial                       | No (flag only)                          |
| Aisle DB FCM tokens, profile                | Where to send; gender and NRI flags        | No                                      |
| Redis (Sidekiq queue)                       | Queued job carries `first_name: "H"`       | Yes, the final display value            |
| Kafka (only when the switch is ON)          | Carries the finished push                  | Yes, in title/message                   |
| MongoDB (microservice)                      | Delivery tracking                          | `jup/pii` removes title/body            |
| FCM                                         | Delivery to the phone                      | Yes, the finished text                  |

| Push                                                                   | Name part                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| Comment received, match (new connection), Spark received, chat message | Sender's name with the hide rule (`select_first_name`) |
| Like received, profile approved, like refreshed, selfie rejection      | No name, fixed texts (case 146)                        |

Code: `notifier/third_party_library.rb:40-105`, `account/spark.rb:488-501`, `chat/conversation.rb:421`,
`chat/request.rb:1183`, `notifier/user_detail.rb:56`, `workers/push_notification_worker.rb`,
`notifier/push_notification.rb:100-165`; microservice `src/services/kafka-consumers/pushNotificationConsumer.js`,
`src/middleware/notification.js`, `src/services/fcm.js`.

### ⚠️ Kafka mode drops most pushes (_from code_, affects case 147)

In `app/workers/push_notification_kafka_worker.rb`, the send line in `send_push_notification` and
`send_push_notification_with_avatar` is **commented out** (lines 135 and 140; same on `develop_new`). With
`USE_KAFKA_FOR_NOTIFICATION` ON, only **Spark** (Kafka) and **chat** (HTTP) pushes are sent; **comment, match, like
and approved pushes are built but never sent.** Staging has the switch OFF, so case 147 is **Blocked** until Dev
turns it on, with a predicted Fail for those four push types.

---

## 5. Sparks

Sparks were built in parallel with the PII integration (_per Dev_). Most Spark flows already read the name from PII;
one CMS screen does not (_from code_).

| Spark feature                                                                | API                                                  | First name read from                                                                                   |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Spark push ("H sent you a Spark")                                            | `POST /V1/sparks/send` → push                        | ✅ PII (Redis → PII service), hide applied (`spark.rb:493`, `select_first_name`)                       |
| Sparks received list (app)                                                   | `GET /V1/sparks/list_received`                       | ✅ PII (`spark.rb:429`, `get_multiple_cache_data`)                                                     |
| Send / accept / reject / pricing                                             | `sparks/send`, `accept`, `reject`, `pricing_list`    | No name in the response                                                                                |
| **CMS → Member → Activity → Sparks** (sent / received / accepted / rejected) | `GET /admin/member/user_activity_v1?filter=sparks_*` | ❌ **Aisle DB `profiles.first_name` directly** (`spark.rb:295, 298`, `create_spark_activity_response`) |

**Impact:** none today (Aisle DB and PII names match; 20/20 Aisle test accounts on 12 Nov). Once the Aisle DB names
are blanked or changed, this tab will show empty or old names; if the column is dropped, the API will fail (500).
The user app is not affected. Reported to Dev (Mayank) on 12 Nov; ask: move it to `Profile.get_first_names_for_users`.

---

## 6. Django (graph / recommendation service)

> **Not active on staging (seen 12 Nov 2026):** `configuration_constants.ACTIVE_DATA_SCIENCE_ALGORITHM = rails`, so
> Discover and profile share links are served by the **Aisle backend (Rails)**, not by Django. Everything in this
> section applies only when the algorithm is switched to the Django service. On staging, the Rails share link takes
> the recommender's name from **PII** (`get_first_name`, `text.rb:398, 410`) but does **not** apply the hide rule
> (case 157), and the "already matched" popup is switched off by a test-env bypass (`profile_share_links.rb:242-245`,
> so 158's popup is Blocked).
>
> **Where the name appears in a share link:** the share message ("I think you two will be a great fit…") has **no
> name**; the name appears only when the friend opens the link in the app, as the header "<Recommender> thinks you
> both could get along well!" above the shared profile. The header shows only if every check passes (friend logged
> in with profile sharing ON, opposite gender to the shared profile, within its age preference, hasn't liked or
> commented on it, link not opened before, no blocks); otherwise "Profile unavailable".

Django **never calls the PII service** and has no PII branch. It reads the name from Rails's Redis profile cache, or
from the Aisle Postgres DB directly (_from code_).

```
 APP (Discover, Smart Picks, Concierge, profile-share link)
   │  GET /api/discover_profiles_infoedge/ · /api/reverse_matching_exp/
   │      /api/concierge_matching/ · /api/discover/profiles_all/ …
   ▼
 ┌────────────────────────────────────────────────────────────────┐
 │ DJANGO SERVICE (django_algorithm)                              │
 │  ✗ never calls the PII service · ✗ no PII branch exists        │
 └──────────┬──────────────────────────────────┬──────────────────┘
            │ ① candidate list                 │ ③ share link (?ps=token)
            ▼                                  ▼
 ┌─────────────────────────────┐   ┌────────────────────────────────┐
 │ AISLE POSTGRES (aisleweb)   │   │ AISLE POSTGRES                 │
 │ SELECT … profiles.first_name│   │ profile_share_links JOIN       │
 │ (+ ref, user_id, filters)   │   │ profiles rb → rb.first_name    │
 │ name is fetched but NOT     │   │ "RECOMMENDER recommended …"    │
 │ shown (fallback commented   │   │ ✗ full name, hide NOT applied  │
 │ out) → DX1 dormant          │   │ share_recommendation.py:47,123 │
 └──────────────┬──────────────┘   └────────────────────────────────┘
                │ refs
                ▼
 ┌────────────────────────────────────────────────────────────────┐
 │ ② AISLE REDIS: profile cache written by RAILS                  │
 │   MGET AISLE_<env>_profile_<ref>     (redis_util.py:921-925)   │
 │   first_name = general_information.first_name, used AS-IS      │
 │   (profile_data_access.py:1793, 1999)                          │
 │   • value = what Rails last wrote (PII name, or initial if     │
 │     hidden at that time)                                       │
 │   • Django does NOT re-read PII or re-apply hide → can be      │
 │     stale after a rename / hide toggle until Rails rewrites it │
 │   • cache MISS → profile skipped (not shown)                   │
 └──────────────────────────────┬─────────────────────────────────┘
                                ▼
                    APP shows the card name
```

| #   | Path                                | Name source                                                                                             | Hide rule                                 | Cases                          |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------ |
| ②   | Discover / concierge cards (DX2)    | Rails Redis profile cache (PII-based when written)                                                      | Only as of the time the cache was written | 155, 156, 161, 162             |
| ③   | Share-link recommender header (DX3) | **Aisle Postgres `profiles.first_name`** (bypass)                                                       | ❌ not applied                            | **157 (likely Fail)**, 158–160 |
| ①   | Candidate SQL (DX1)                 | Postgres, dormant (the fallback that would use it is commented out, `profile_data_access.py:1764-1770`) | —                                         | Sentinel test (§8)             |

The Redis key name comes from `profiles/redis_keys.py:3-7, 75-76`: `PRODUCT_NAME_RAILS_ENV_profile_<ref>`, the same
key Rails writes.

---

## 7. Sockets: real-time chat, live audio, Kafka

Neither path decrypts or calls PII itself: server-built names come from Rails (`get_first_name` → Redis → PII);
normal chat messages carry a name built on the sender's own phone (_from code_).

```
 A sends a chat message
   │
   ├─(a) NORMAL MESSAGE: published BY A's APP straight to PubNub
   │     sender_name built ON THE DEVICE from A's own profile
   │     (GET /V1/users/meta_for_discover → own name + hide flag)
   │     backend never touches this name
   │
   └─(b) SERVER-SENT MESSAGES (comment/invite top & reply, image, audio)
         Rails create_base_message_data          (message.rb:396-404)
         sender_name = profile.get_first_name
             │
             ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ get_first_name → Redis pii:v1:user:<id>:first_name          │
   │                  → miss → PII service (decrypts) → Redis    │
   │ ✓ name from PII     ✗ FULL name: hide rule NOT applied      │
   │   (uses get_first_name, not select_first_name)              │
   └──────────────────────────────┬──────────────────────────────┘
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ PUBNUB channel AISLE_conv_<id1>_<id2> (pubnub_service.rb)   │
   │ message + sender_name saved in PubNub history               │
   │ (Firebase copy on iOS fallback: get_first_name, same issue) │
   └──────────────────────────────┬──────────────────────────────┘
                                  ▼
                   B's app shows the message live

 CHAT HISTORY  POST /V1/chat/chat_messages      (message.rb:95)
   sender_name = get_first_name → PII ✓ · hide ✗

 LIVE AUDIO (Pusher)  room owner name = select_first_name (room.rb:417)
   PII ✓ · hide ✓

 KAFKA profile sync (A-X9)  raw profile cache published, no PII re-read
```

| Socket path                                              | Name source                             | Hide rule      | Cases                      |
| -------------------------------------------------------- | --------------------------------------- | -------------- | -------------------------- |
| Normal chat message (app → PubNub)                       | Sender's device (own name from the API) | Device decides | 165, 166                   |
| Server-sent invite/comment messages → PubNub             | PII (`get_first_name`)                  | ❌ not applied | **167, 168 (likely Fail)** |
| Chat history `POST /V1/chat/chat_messages`               | PII (`get_first_name`)                  | ❌ not applied | 167                        |
| Firebase copy (iOS fallback, `conversation.rb:236, 251`) | PII (`get_first_name`)                  | ❌             | 169 (iOS: Not Required)    |
| Live audio room owner                                    | PII (`select_first_name`)               | ✅             | 172                        |
| Kafka profile sync                                       | Raw profile cache                       | As cached      | 170, 171 (Blocked)         |

The server-sent normal-message payload (`conversation.rb:1027-1046`) carries only ref and avatar, no name.

---

## 8. Redis: how the first-name cache works

Redis is the apps' fast short-term memory: Aisle checks it first so it doesn't have to ask the PII service every
time (_from code_, `aisle_new` `18d9eb5`). Example member used below: **A** = user 19849222, ref A769FAD2, real name
**HiddenName**, Hide name **ON**.

### The two Redis "notes" kept for every member

| Note               | Redis key                         | What's written in it                                               | Expires                                       |
| ------------------ | --------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| **① Name note**    | `pii:v1:user:19849222:first_name` | `HiddenName`, always the full name, as returned by the PII service | 30 days (`PII_DECRYPTED_CACHE_TTL`)           |
| **② Profile card** | `AISLE_staging_profile_A769FAD2`  | A's whole profile card, with name **`H`** (initial, A is hidden)   | 30 days, renewed daily (`ProfileCacheExpiry`) |

Code: name note `app/services/pii/field_cache.rb` (read / write / invalidate); profile card
`profile.rb:3031-3053` (`get_cache`, `clear_cache!`, `fill_cache!`) and `cache/data_store.rb:1187-1193`.

### 1. Someone opens a list that shows A (Discover, likes, matches)

```
 B opens the list
      │
      ▼
 Step 1: Is A's PROFILE CARD ② in Redis?
      ├─ YES → take it (name inside = "H")
      └─ NO  → build the card again (see box ★), save it in Redis
      │
      ▼
 Step 2: Is A's NAME NOTE ① in Redis?
      ├─ YES → name = "HiddenName"
      └─ NO  → ask the PII service ─► PII DB (encrypted)
               PII service decrypts → "HiddenName"
               → save it as the name note ① (30 days)
      │
      ▼
 Step 3: Put the name on the card
      card had 1 letter ("H") → A is hidden → show "H"
      card had full name      → show "HiddenName"
      │
      ▼
 B sees "H"
```

**★ Building the card again:** Aisle reads A's profile from the DB, gets the name (from ① or the PII service), checks
**Hide name** in the Aisle DB (ON → `H`, OFF → `HiddenName`) and saves the card ② in Redis.

**If something goes wrong:** PII service down → the list returns an error (HTTP 500); A has no name in the PII DB →
the name already on the card ② is kept.

Code: `get_multiple_cache_data` (`profile.rb:618`) → `hydrate_first_names!` (`:758`) → `get_first_names_for_users`
(`:786`) → `Pii::FieldStore.get_first_names` (Redis MGET, then PII batch read of 50 per call); `apply_first_name!`
(`:814`) with `hidden_first_name_value?` (`:830`). See also [PATH-BASED-TESTING.md §4.5](PATH-BASED-TESTING.md).

### 2. A's name is changed (signup, edit or CMS rename to "QaNew")

```
 Rename to "QaNew"
      │
      ├─► PII service saves "QaNew" in the PII DB
      │      ├─ OK     → name note ① = "QaNew" (fresh 30 days)
      │      └─ FAILS  → name note ① still "HiddenName"  ⚠️ (R2)
      │
      ├─► Aisle DB first_name = "QaNew"
      │
      └─► profile card ② rebuilt (with "Q" if hidden)
```

Code: `assign_first_name` (`profile.rb:3157`) → `write_pii_first_name_for_user` (`:796`, errors are logged and
swallowed) → `FieldStore.write` (`field_store.rb:45-54`); the profile save calls `fill_cache!` (`profile.rb:1621`).

### 3. A turns Hide name ON or OFF

```
 Hide ON/OFF
      ├─► Aisle DB hide_first_name = true / false
      ├─► profile card ② rebuilt:  ON → "H"   OFF → "HiddenName"
      └─► name note ① NOT touched (it always keeps the full name)
```

### 4. What happens after 30 days

```
 Profile card ②  → a daily job renews it for active users ✅
 Name note ①     → no renew job found in the code ⚠️ (R1)
                   → it expires; the next time someone views A,
                     Aisle asks the PII service again and saves a new note
```

The only renew job in the code is `profile_cache:renew_expiring` (`app/services/profile_cache_expiry.rb`), which
handles profile cards ② only. Dev has said a job also extends the name notes ①; confirm with Dev.

### Vernacs (Arike, Anbe, Neetho, Neene): same idea, two differences

1. The name note's key is encoded (see §2):
   `pii:v1:c3RhZ2luZw:ZGVzaWFwcC1yYWlscw:<b64 tenant>:dXNlcg:<b64 user_id>:TkFNRQ`; the profile card is
   `DESIAPP_staging_profile_<ref>`.
2. If the PII DB has no name, Vernacs quietly uses the **Vernacs DB** name instead (§3).

### Reading the keys as QA

`GET /admin/redis-keys?key=…` as QA's CMS admin (Aisle: testa2; Vernacs: testapp.koode.co). The API returns the
value only, **not the time left (TTL)**. Helpers: `m2/scripts/manual-redis-check.ts` (Aisle, read-only). GET only
unless the tester asks for a delete; never config keys or other users' keys; never log out.

### What the Redis cases check

| Cases         | What we check                                                                               |
| ------------- | ------------------------------------------------------------------------------------------- |
| 173, 174      | Name note ① exists with the right value, including Indic and emoji names                    |
| 175, 177, 184 | When ① is missing, viewing the profile creates it from the PII service                      |
| 176           | Viewing again doesn't restart the 30 days                                                   |
| 178           | A member with no PII name gets no empty note                                                |
| 179, 186      | A rename updates ① and the card ② straight away                                             |
| 180, 185      | Hide changes only the card ② (`H`); ① keeps the full name                                   |
| 181           | If PII changes directly, the app keeps showing the old note until it is replaced or expires |
| 182, 183      | The daily job extends ① for active users (likely Fail, R1); an inactive user's note expires |
| 187           | Deleted account: the notes stay until they expire                                           |
| 188, 189      | Same checks for Vernacs                                                                     |

### Likely Redis bugs (_from code_, to confirm by testing)

| #   | Likely bug                                                                                                                                                         | Case                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| R1  | No daily job extends the name note ①; only the profile card ② is renewed, so active users' name notes expire every 30 days                                         | 182 likely Fail                    |
| R2  | A failed PII write leaves the old name in ① while the Aisle DB gets the new name, so they disagree until the note expires                                          | Needs the PII-down window          |
| R3  | "Hidden or not" is guessed from the cached value (1 letter = hidden), not read from the hide setting; a real 1-letter name or a stale card can show the wrong form | 180, 185                           |
| R4  | Deleted account: both keys stay up to 30 days (no clean-up)                                                                                                        | 187                                |
| R5  | The Redis key API returns no TTL, so "about 30 days left" can't be checked by QA; ask Dev for a TTL field or to read it for us                                     | 173, 176, 182–184 (partly blocked) |

---

## 9. Tests to run in the Redis part

Decided on 12 Nov 2026: these run **during the Redis testing part** (cases 173–189), not in resilience.

|          | 1. No-PII-row fallback (Vernacs)                                                                                                                                                                                      | 2. App-DB marker-name test                                                                                                                                                                                                                                                                                                                                                                         | 3. CMS Spark activity                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **What** | Accounts made before PII go-live show a name with no PII row                                                                                                                                                          | Prove every screen and API reads the name from PII                                                                                                                                                                                                                                                                                                                                                 | The CMS Spark activity tab uses the Aisle DB name                   |
| **Why**  | §3: the DB name is kept silently when PII returns nothing; the missing backfill stays hidden                                                                                                                          | Features built in parallel with PII may still read the app DB; fine today, broken once DB names are removed                                                                                                                                                                                                                                                                                        | §5: `spark.rb:295, 298`                                             |
| **How**  | Pick a no-row account (Arike 11739197 / 11739210 / 11739239 / 11739240, Neetho 9482948) → clear both Redis keys → open in the app → the name equals the Vernacs DB value. Ask Dev about the backfill and the fallback | Dev sets the Aisle DB (and Vernacs DB) first name to a marker such as `AisleDbOnly` on 2–3 synthetic accounts; PII keeps the real name → clear both Redis keys for those users → walk the app, chat, notifications, CMS (incl. Spark activity), Stories, emails, exports and search → marker visible = bypass ❌ → repeat with a blank name (no crash) → Dev restores the names, clear Redis again | Covered by test 2: the tab should show the PII name, not the marker |

Never rename or drop the column on shared staging; keep `hide_first_name` in the app DB (the hide rule reads it there).
The PII-down window (cases 136, 190–201) stays separate and needs Dev to switch PII off.

---

## 10. Summary of gaps found (for Dev)

All _from code_; confirm with Dev before marking a case Fail.

| #   | Gap                                                                                                                                                   | Where                                                                                           | Effect                                                                    | Cases                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------- |
| 1   | CMS Spark activity reads `profiles.first_name`                                                                                                        | `aisle_new` `spark.rb:295, 298`                                                                 | Blank/old names after Aisle DB names change; 500 if the column is dropped | Sentinel test        |
| 2   | Kafka push worker has the send commented out                                                                                                          | `push_notification_kafka_worker.rb:135, 140`                                                    | With Kafka ON: comment, match, like, approved pushes not sent             | 147                  |
| 3   | Share-link recommender name from Postgres, hide not applied                                                                                           | `django_algorithm` `share_recommendation.py:47, 123`                                            | Hidden recommender's full name shown; bypasses PII                        | 157                  |
| 4   | Django serves the Rails profile cache as-is                                                                                                           | `profile_data_access.py:1793, 1999`                                                             | Can lag a rename or hide toggle until Rails rewrites the cache            | 155, 156             |
| 5   | Server-sent chat messages and chat history use `get_first_name`                                                                                       | `chat/message.rb:95, 292, 400`; `chat/conversation.rb:236, 251`                                 | Hidden sender's full name in PubNub / Firebase / chat history             | 167, 168             |
| 6   | Vernacs keeps the DB name when PII has no row (silent fallback)                                                                                       | `desiapp` `profile_hydrator.rb:27-40`                                                           | Missing backfill invisible; blank names once DB names are removed         | Redis part           |
| 7   | Old Vernacs accounts not backfilled to PII                                                                                                            | _seen on staging_ (4 Arike accounts, Neetho 9482948)                                            | No PII row for accounts created before 25 Oct                             | Redis part           |
| 8   | Aisle CMS Member tab name search reads the Aisle DB                                                                                                   | `profile.rb:289, 1264` (`GET /admin/members/search_profiles`)                                   | Can't find members by name once Aisle DB names are removed                | 74, 75, 76 (Fail)    |
| 9   | Vernacs CMS name search reads the Vernacs DB                                                                                                          | `desiapp` `account/profile.rb:250` (used at `:732`, `:936`)                                     | Same, for all four Vernacs apps                                           | 128, 129, 130 (Fail) |
| 10  | Rails share link ignores Hide name (staging path)                                                                                                     | `text.rb:398, 410`                                                                              | Hidden recommender's full name in the share-link header                   | 157                  |
| 11  | Scheduled mails / pushes read the Aisle DB name                                                                                                       | `notify_renewals.rake:64`, `subscription_purchase_on_web_email.rake:28`, `love_stories.rake:21` | Blank names once Aisle DB names are removed                               | Sentinel test        |
| 12  | Unused Reset profile API saves the name only to the Aisle DB                                                                                          | `user.rb:556-635` (`POST /V1/user/reset_profile`)                                               | New account has no name in the PII DB                                     | —                    |
| 13  | No renew job for the PII name note; failed write leaves an old note; hide guessed from the cached value; no clean-up on delete; no TTL in the key API | §8 (R1–R5)                                                                                      | See §8                                                                    | 180–187              |

The Memberboard search (`GET /admin/member/search`) correctly uses the PII search; on staging it is exact and
case-sensitive (12 Nov 2026), so cases 68–73 stay Pass.
