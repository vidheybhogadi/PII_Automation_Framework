# Path-based testing for PII — how we test the first name (and later email, phone, free text)

**In one line:** hundreds of APIs show or change a first name, but they all go through a few dozen shared pieces of
code ("code paths"). We test **each code path deeply once**, give **every path that skips PII its own test**, and run
a **quick sweep** over all the other APIs. This finds the same bugs as testing every API in depth, for a fraction of
the effort, and also covers CMS, pushes, jobs, caches and third parties that "test every API" would miss.

Source of the numbers and code below: the first-name inventory ([firstname-inventory.json](firstname-inventory.json) /
[firstname-inventory.xlsx](firstname-inventory.xlsx)), built from the Aisle Network code (Aisle backend
`origin/develop_new @ 18d9eb5`, re-checked at `bd85044`). Path grouping is **from code — confirm with Dev**.

---

## 1. The problem this solves

| Concern                                                                                 | Why it is real                                                                                  |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| There are hundreds of APIs that touch a first name.                                     | 445 places in the code, 352 distinct routes (section 3).                                        |
| Everything is cached, so we cannot tell if a name came from Redis, the Aisle DB or PII. | A screen **and** an API response look the same whichever store the name came from.              |
| Parallel API calls share one cache, so the UI cannot validate everything.               | The first call fills the cache, the next ones read it; timing problems are invisible on screen. |
| Do we test Android and iOS separately?                                                  | The apps call the **same backend APIs**; only screens differ per platform.                      |

Testing every API one by one does **not** fix the second and third concerns: an API response hides the source just as
much as the UI does. What fixes them is **white-box checking** (section 5) — and that is what path-based testing is
built on.

---

## 2. Words used in this document

| Word                  | Meaning                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Touch point (row)** | One place where the code reads, writes, searches, shows, sends or stores a first name: an API, CMS route, screen, push, job, cache…                            |
| **Code path**         | The shared code that decides **where the name comes from and how it is shown** (PII service, Aisle DB, cache; hide rule). Many touch points use the same path. |
| **★ Representative**  | The one API (per path and division) we test in depth for that path.                                                                                            |
| **Bypass path**       | Code that **skips PII** and reads or writes the Aisle DB directly. Always tested on its own.                                                                   |
| **Sweep**             | A quick one-check test of every other row: "with PII reads ON, the name returned equals the PII value".                                                        |

---

## 3. The numbers (first name)

| What                                          | Count      |
| --------------------------------------------- | ---------- |
| Touch points in the code                      | **445**    |
| Distinct API / CMS routes among them          | **352**    |
| **Code paths** behind them                    | **68**     |
| ★ Representatives (one per path and division) | **111**    |
| Bypass paths (skip PII) / their rows          | **8 / 21** |

Touch points by kind: app APIs 161 · CMS routes 85 · screens 53 · pushes 16 · background jobs 13 · caches 13 · other
104 (Kafka, invoices, payment providers, exports, logs …). **Only about a third are app APIs** — "test every front-end
API" leaves the rest untested.

| Group                  | Rows | Paths |
| ---------------------- | ---- | ----- |
| Aisle backend · read   | 139  | 10    |
| Vernac backend         | 113  | 17    |
| Mobile apps            | 63   | 6     |
| Aisle side channels    | 60   | 12    |
| Aisle backend · write  | 29   | 5     |
| Django                 | 10   | 4     |
| Aisle backend · search | 8    | 2     |
| Notification service   | 8    | 3     |
| Aisle stores (caches)  | 6    | 4     |
| Aisle test routes      | 6    | 1     |
| Aisle backend · hide   | 2    | 1     |
| Aisle other            | 1    | 1     |

---

## 4. A real example: path A-R2 — "a list of profiles with their first names"

### 4.1 Many screens, one helper

```
   API (screen)                                           shared code path A-R2
   ─────────────────────────────────────────────          ──────────────────────
   GET  /V1/users/discover_profile_list_v2   Discover  ─┐
   GET  /V1/list_likes_received_v1           Likes     ─┤
   GET  /V1/sparks/list_received             Sparks    ─┤
   GET  /V1/list_all_passed                  Passed  ★ ─┤
   GET  /V1/list_request_sent                Sent      ─┼──▶ Profile.get_multiple_cache_data(refs)
   GET  /V1/users/fetch_concierge_list       For You   ─┤            │
   GET  /V1/invites/list_comments_and_likes  Comments  ─┤            ▼
   GET  /V1/users/fetch_top_matched_profiles Top       ─┤     hydrate_first_names!   (all names in one batch)
   POST /V1/users/matches_list_v3            Discover  ─┤            │
   GET  /web/list_likes_received             Web likes ─┤            ▼
   … 9 more                                             ─┘     apply_first_name!      (hide rule: initial or full)
```

19 app/web APIs use this path; the helper `get_multiple_cache_data` is called from 17 places in the code.

### 4.2 The code (Aisle backend, `18d9eb5`, read-only)

**Each feature calls the same helper** — different files, same line:

```ruby
# app/models/user_like.rb:1525 — Likes (sent requests)
cached_profiles = Profile.get_multiple_cache_data refs

# app/models/user_pass.rb:164 — Passed profiles
cached_profiles = Profile.get_multiple_cache_data pass_profiles_refs

# app/models/account/spark.rb:429 — Sparks received
cached_profiles = Profile.get_multiple_cache_data(sender_profiles.values.map(&:ref))
```

**The helper loads the profiles, then fetches all names at once** (`app/models/profile.rb:618`):

```ruby
def get_multiple_cache_data refs
  response = Cache::DataStore.fetch_bulk_profile_data refs        # profiles from the Redis profile cache
  ...
    data = create_cache_response r, hydrate_first_name: false     # don't fetch names one by one…
  ...
  hydrate_first_names!(list)                                      # …fetch them ALL in one batch
  return list
end
```

**Where the name comes from — PII or Aisle DB** (`profile.rb:758`, `786`):

```ruby
def hydrate_first_names! profiles_by_ref
  first_names = get_first_names_for_users(user_ids)          # one call for the whole list
  profiles.each { |p| apply_first_name!(p, first_names[p['user_id'].to_s]) }
end

def get_first_names_for_users(user_ids)
  return Pii::FieldStore.get_first_names(user_ids) if can_read_first_name_from_pii?   # read gate ON  → PII service
  where(user_id: user_ids).pluck(:user_id, :first_name)...                             # read gate OFF → Aisle DB
end
```

**The hide rule, in one place for every screen on the path** (`profile.rb:814`, `830`):

```ruby
def apply_first_name! profile_info, first_name
  return profile_info if profile_info.nil? || first_name.nil?        # PII returned nothing → keep cached value
  display_value = hidden_first_name_value?(current_value, first_name) ? first_name[0].capitalize : first_name
  general_info['first_name'] = display_value                          # "Q" if hidden, "qaHide" if not
end
```

### 4.3 What this means for testing

| Approach                | Tests needed                                   | What you learn                                      |
| ----------------------- | ---------------------------------------------- | --------------------------------------------------- |
| Test every API in depth | 19 (Discover, Likes, Sparks, Passed, For You…) | 19 times: "the batch helper works"                  |
| **Test the path**       | 1 deep (★ `/V1/list_all_passed`) + sweep of 18 | Once, deeply: "the batch helper works" — for all 19 |

- If PII returns the right name and the hide rule works for one screen on A-R2, it works for all of them — same code.
- If someone breaks `apply_first_name!`, **all 19 screens break together** — one path test catches it.
- Edge cases live **in the path**, so they are tested once: e.g. _PII returns nothing → the old cached name is kept_
  (`return … if first_name.nil?`).

The manual run already showed this: cases 31–35 (For You, Concierge, Likes You, Sparks, Your Likes / Passes) are five
screens on **one** path.

### 4.4 A path that needs its own test: A-R6 (bypass)

**A-R6** reads `profiles.first_name` **straight from the Aisle DB** and never calls the helpers above (e.g. CMS
member activity for Sparks: `/admin/member/user_activity_v1?filter=sparks_*`, ActiveAdmin "Profile Edit"). It can show a
name PII does not have, so it is **always** tested on its own — never covered by a representative of another path.

### 4.5 Code flow of A-R2 as a flowchart

From the app's request to the name on screen. Checked line by line against the Aisle backend (`18d9eb5`): `profile.rb`,
`app/services/pii/field_store.rb`, `field_cache.rb`, `client.rb`, `config.rb`, `application_controller.rb`. From code —
confirm with Dev; **[seen]** = also seen on staging (testa2, 2026-11-09). Side boxes on the right are branches; each
says where it continues.

```
     ┌────────────────────────────────────────────────┐
     │ App opens a list screen                        │
     │ e.g. GET /V1/list_all_passed   (Passed)        │
     └────────────────────────┬───────────────────────┘
                              ▼
     ┌────────────────────────────────────────────────┐
     │ Feature code gets the list of profile refs     │
     │ (user_pass.rb:164, user_like.rb:1525, ...)     │
     │ → Profile.get_multiple_cache_data(refs)        │
     └────────────────────────┬───────────────────────┘
                              ▼
════════════════════════ STEP 1 · load the profiles   (profile.rb:618-631) ═════════════════════════
     ┌────────────────────────────────────────────────┐
     │ Read ALL profiles from the Redis profile cache │
     │ in one go (fetch_bulk_profile_data)            │
     │ key: AISLE_staging_profile_<ref>               │
     └────────────────────────┬───────────────────────┘
                              ▼  (for each ref)
                    ◆ Profile in cache? ◆ ── no ────────────────────────────────┐
                              │  yes                                            ▼
     ┌────────────────────────────────────────────────┐     ┌───────────────────┴──────────────────┐
     │ use the cached profile as it is, incl. its     │     │ get_cache_from_ref  (681-689)        │
     │ first_name: full name, or only the initial     │     │ 1. try the single cache key again    │
     │ if the user is hidden                          │     │ 2. still missing → rebuild from the  │
     └────────────────────────┬───────────────────────┘     │    Aisle DB (fill_cache!); its       │
                              │                             │    first_name comes from             │
                              │                             │    select_first_name: gate ON →      │
                              │                             │    PII single read (Redis PII cache  │
                              │                             │    first); gate OFF → Aisle DB;      │
                              │                             │    only the initial if Hide is ON    │
                              │                             │    (3145-3150)                       │
                              │                             │ 3. saved to the cache only if        │
                              │                             │    allowed_for_cache?  (3047-3053)   │
                              │                             │ no profile in the DB → left out      │
                              │                             └──────────────────────────────────────┘
                              ├─────────────────────────────────────────────────┘
                              ▼  names not re-checked yet (hydrate_first_name: false)
═════════════════════ STEP 2 · fetch all names at once   (profile.rb:758, 786) ═════════════════════
     ┌────────────────────────────────────────────────┐
     │ hydrate_first_names!(list)                     │
     │ collect every user_id in the list              │
     │ → get_first_names_for_users(user_ids)          │
     └────────────────────────┬───────────────────────┘
                              ▼
       ◆ Read gate ALLOW_PII_FIRST_NAME_READ = true? ◆ ── no ───────────────────┐
                              │  yes   [seen: ON on testa2]                     ▼
     ┌────────────────────────────────────────────────┐     ┌───────────────────┴──────────────────┐
     │ Pii::FieldStore.get_first_names                │     │ Aisle DB: profiles.first_name        │
     │ read ALL users at once from Redis              │     │ (the behaviour before PII)           │
     │ (MGET pii:v1:user:<id>:first_name)             │     │ → continue at STEP 3                 │
     │ found → used as it is (plain text)             │     └──────────────────────────────────────┘
     │ only users NOT found go on to the PII service  │
     └────────────────────────┬───────────────────────┘
                              ▼  users not in Redis
     ┌────────────────────────────────────────────────┐
     │ ask the PII service, in batches of 50          │
     │ POST /api/v1/pii/batch/read                    │
     │ PII returns the plain name                     │
     │ (Aisle does not decrypt it)                    │
     └────────────────────────┬───────────────────────┘
                              ▼
                     ◆ PII reachable? ◆ ── no (timeout / down) ─────────────────┐
                              │  yes                                            ▼
     ┌────────────────────────────────────────────────┐     ┌───────────────────┴──────────────────┐
     │ names returned; a user PII does not know       │     │ up to 3 tries, then an error         │
     │ simply gets no name (handled in STEP 3)        │     │ (client.rb:176-200)                  │
     │ fetched names written to Redis,                │     │ → WHOLE list request fails:          │
     │ TTL 30 days (PII_DECRYPTED_CACHE_TTL)          │     │   HTTP 500, generic error message    │
     │ [seen: a deleted key refills]                  │     │   (application_controller.rb:3-4)    │
     └────────────────────────┬───────────────────────┘     │ → no fallback to the Aisle DB        │
                              │                             │ STOP                                 │
                              │                             └──────────────────────────────────────┘
                              ▼  names from Redis / PII  (or from the Aisle DB when the gate is OFF)
═══════════════════ STEP 3 · put each name in its profile   (profile.rb:814-832) ═══════════════════
     ┌────────────────────────────────────────────────┐
     │ for each profile: apply_first_name!            │
     └────────────────────────┬───────────────────────┘
                              ▼
                ◆ Got a name for this user? ◆ ── no ────────────────────────────┐
                              │  yes                                            ▼
                              │                             ┌───────────────────┴──────────────────┐
                              │                             │ keep the cached profile's first_name │
                              │                             │ as it is (may be old / stale)        │
                              │                             │ → goes into the API response         │
                              │                             └──────────────────────────────────────┘
                              ▼
      ◆ cached value is 1 letter AND new name longer? ◆ ── yes ─────────────────┐
                              │  no                                             ▼
     ┌────────────────────────────────────────────────┐     ┌───────────────────┴──────────────────┐
     │ show the FULL name, e.g. "qaHide"              │     │ show the INITIAL: first letter of    │
     └────────────────────────┬───────────────────────┘     │ the name, capitalized, e.g. "Q"      │
                              ▼                             │ → goes into the API response         │
     ┌────────────────────────────────────────────────┐     └──────────────────────────────────────┘
     │ Feature code builds the API response           │
     │ (full names, initials and kept values)         │
     │ → the app shows the list with the names        │
     └────────────────────────────────────────────────┘
```

**How the hide rule works:** when the profile cache is built, `select_first_name` stores only the initial for a hidden
user ([seen] `AISLE_staging_profile_90A3011B` holds first_name "Q"). Step 3 sees the 1-letter value and shows the first
letter of the PII name, so the full name is not sent to others. If a cached profile still held the full name after Hide
was turned ON (not refreshed), step 3 would show the full name until the cache is rebuilt — an inventory edge case to
confirm with Dev (in the manual run, Hide ON did show only the initial).

**Where the bugs can hide — one test each, on this path:**

| Decision point            | What to test                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read gate ON / OFF        | ON → the name comes from PII (divergent user D: PII name Y is returned, not Aisle-DB name X)                                                                                       |
| Profile cache miss        | Profile not cached → rebuilt; its first name still comes from PII (gate ON); hidden user → initial stored                                                                          |
| Redis PII cache hit/miss  | Delete `pii:v1:user:<id>:first_name` → open the list → the key refills with the PII value, about 30 days left                                                                      |
| Mixed list                | Some users cached, some not → one batch call for the missing ones only; every row shows the right name                                                                             |
| PII not found             | User with no PII name → the cached profile's name is kept; note what is shown                                                                                                      |
| PII timeout / down        | Up to 3 tries, then the whole list request fails with HTTP 500 and a generic error (`application_controller.rb:3-4`); no Aisle-DB fallback — Dev window, Resilience cases 193–194  |
| 1-letter check            | Hidden user → initial only; a real 1-letter name and a hidden initial cannot be told apart (inventory edge case)                                                                   |
| Hide toggled while cached | If the profile cache is not refreshed when Hide is turned ON, the full name would show until it is rebuilt (inventory edge case — confirm with Dev; manual run showed the initial) |

All 19 APIs on this path go through exactly these boxes — testing the boxes once covers all 19 screens.

---

## 5. How one path is tested (deep test)

Every deep test checks **all layers**, not just the response:

```
  UI (app / CMS)      → what the user or admin sees, hide rule on screen, client-side behaviour
  API response        → the name and hidden initial returned
  Aisle DB            → profiles.first_name (expected copy, plaintext by design)
  PII DB              → one encrypted NAME row; md5 changes on a real rename, NOT on a save without a change
  Redis               → pii:v1:user:<id>:first_name and the profile cache (read via the Redis key API)
```

### 5.1 Proving where a name came from — the divergent user

This answers "we cannot tell if it came from Redis, the Aisle DB or PII":

- Create a synthetic test user **D** whose **Aisle-DB name is X** and whose **PII name is Y** — two different names
  on purpose (the suite does this with the PII test route; see `m2fn-firstname-cases.data.ts`).
- Call the API. **If it returns Y, the name came from PII. If it returns X, it came from the Aisle DB** (a bypass or a
  fallback). No guessing.
- Combine with the cache: **delete D's Redis key** (Redis key API) → call the API → the key must refill with **Y**.

### 5.2 The standard checks per path

| Check               | How                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Source is PII       | Divergent user D: response = PII name Y, not Aisle-DB name X                                  |
| Cache miss / hit    | Delete the Redis key → read → key refilled with the PII value; read again → served from cache |
| Read gate ON / OFF  | `ALLOW_PII_FIRST_NAME_READ` (ON on testa2): ON → PII, OFF → Aisle DB                          |
| Missing PII value   | No-PII user N (after reset profile): note what is shown — empty, Aisle-DB name or error       |
| Hide name           | Verified user, Hide ON: others get only the initial; the user sees the full name              |
| Update then read    | Rename → every store and the response show the new name; PII md5 changes once                 |
| No unwanted rewrite | Save without a name change → PII md5 unchanged (regression for bug 14zmk4dm0dd)               |
| PII down / slow     | Dev window: what still shows, what fails, do the stores stay in step                          |

### 5.3 The sweep (everything else)

Every other row on the path gets one quick check: _with the PII read gate ON, the name returned equals the PII value_
(divergent user D makes this a hard check). A row that fails the sweep is pulled out and given its own deep test —
it is probably not on the path we thought.

---

## 6. Rules for choosing what to test

1. **One ★ representative per path** (per division: Aisle, Aisle CMS, Vernac …), deep-tested (section 5).
2. **A second route** where a path has variants (single vs list, app vs web, paginated vs not).
3. **Every bypass path gets its own test** — A-R6, A-S2, A-X3, DX1, DX2, DX3, VX1, VX9 — plus the risky write and hide
   paths (e.g. A-W2 Postgres-only write, A-R10 / VX7 full name shown although hidden).
4. **Side channels** (push text, email, WhatsApp, payment providers, invoices, Kafka, exports, logs) are paths too —
   one test each.
5. **Mobile app paths** (APP-*: own-name cache, client-built chat sender name, hide toggle) are tested in the **UI**, per
   platform — this is the only place Android and iOS are tested separately.
6. **Sweep** every remaining row (section 5.3).

---

## 7. Android vs iOS

The apps call the **same backend APIs** (only device headers differ), so a backend path test covers both. Platform
differences are in the screens — input limits (iOS 18 letters), truncation with "...", own name loaded only at app
start, how a push is rendered — and are covered by the UI cases of the mobile app paths. Doubling API tests per
platform adds no coverage.

---

## 8. Parallel calls and the cache (timing)

Several APIs firing together and sharing one cache is the intended design: if the cached value is right, all of them
are right; if it is wrong, all of them are wrong, and the UI shows it. What the UI cannot show is **timing**:

| Race                        | Risk                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Cold cache + parallel reads | Every call misses at once and asks PII (load); one failure leaves part of the screen without a name                            |
| Read and write overlap      | A slow read fetches the **old** name, a rename replaces the cache, then the read writes the old name back — stale for ~30 days |
| PII slow for one call       | One API times out, the others succeed: a mixed screen                                                                          |

These are tested **once, at the backend**, with parallel calls in automation and a Redis check of what ends up in the
cache (cold-cache burst, rename during reads, PII slow) — not per platform. _Proposed; to be added through the
testcase-manager agent._

---

## 9. Evidence from the manual run (03–11 Nov 2026)

Findings so far and the layer that caught them — none would be found by testing front-end APIs alone:

| Finding                                                 | Caught by           |
| ------------------------------------------------------- | ------------------- |
| PII NAME `updated_at` does not move on rename (case 90) | PII DB check        |
| `hide_first_name_updated_on` stays null (case 49)       | Aisle DB check      |
| No audit entry for CMS renames (case 91)                | CMS UI + DB         |
| Stale CMS tab overwrites a newer name (case 92)         | CMS UI + DB + Redis |
| CMS Stories row shows another user's email (case 81)    | CMS UI              |
| Own name updates only after an app restart (case 24)    | App UI              |
| Vernac user without EMAIL / PHONE PII rows              | PII DB check        |

---

## 10. Limits and keeping it correct

- **The grouping is from code — confirm with Dev.** A path test is only valid if the routes really share the code.
  Every row in the inventory carries file:line evidence for Dev to check.
- **Re-check when the code changes.** A route that gets its own logic needs its own test. The API docs drift check
  (`npm run docs:api:drift`) and a re-scan of the inventory catch this.
- **A sweep failure means the grouping is wrong** for that row: deep-test it and move it to the right path.
- Path-based testing does not replace **UI checks of what users see** (privacy on screen, input limits, pushes) — it
  replaces testing the same backend code again and again.

---

## 11. Next milestones

Email (M3), phone (M4) and free text (M5) reuse the same kinds of paths — read, list read, write, search, side
channel, cache. The same method applies: build the inventory for the field, group rows into paths, pick ★
representatives, list the bypass paths, then deep-test + sweep. Per-API testing would multiply hundreds of routes by
four fields.

---

## Short answers for discussions

- **"Test every front-end API instead of the UI."** — An API response hides the source as much as the UI does. We
  prove the source with white-box checks (divergent user, Redis key delete, PII down). The app APIs are the same for
  Android and iOS. Our real bugs came from UI + DB checks.
- **"Parallel calls share a cache, the UI can't validate it."** — Agreed for timing; that is a backend concurrency
  test, done once with parallel calls + a Redis check (section 8).
- **"Why not test all 352 routes?"** — They run through 68 code paths. One deep test per path + a test for every
  bypass + a sweep of the rest gives the same coverage and also covers CMS, pushes, jobs, caches and third parties.
