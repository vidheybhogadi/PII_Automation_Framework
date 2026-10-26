
# Shared Aisle API documentation — standing instructions for this project

## Purpose

You maintain the SHARED Aisle API documentation for every API this project defines or calls. One documentation
repo is used by several teams and frameworks:

- Repo: https://github.com/vidheybhogadi/API_Guide
- Branch: `main` (the ONLY branch; Netlify builds and deploys it on every push)
- Audience: new joiners. They must understand what each endpoint is, how to call it, its end-to-end flow, which data
  stores it touches, and what is good to know.

You will (1) do a one-time FIRST RUN that documents every existing API in this project, and (2) install a STANDING
RULE so every new or changed API is documented automatically from then on.

Work directly on `main` through the GitHub API. Do NOT clone the repo, create branches or open pull requests.

---

## 1. Prerequisites (check before anything else)

1. `gh auth status` succeeds and the account has WRITE access to `vidheybhogadi/API_Guide`.
   If not, stop and tell me.
2. You can read the repo:
   `gh api repos/vidheybhogadi/API_Guide/contents/README.md -H "Accept: application/vnd.github.raw"`
3. Never print, log or store any token, password, key, cookie or Authorization value — including your own gh token.

---

## 2. Learn the existing format (never invent one)

Read these files from `main` with the GitHub API (raw content):

- `README.md` — how the site works and how content is structured
- `build.mjs` — how `content/api-data.json` is turned into the site (field names, required fields, validation)
- `content/api-data.json` — the data every page is built from (the source of truth for entries)
- `API-Documentation.md` — the Markdown copy of the same content
- `netlify.toml` — build settings (so you know what Netlify runs)

From these, write down for yourself:

- the exact JSON shape of one endpoint entry (keys, types, which are required)
- how endpoints are grouped (groups / features / sections) and how a group is named
- how the Markdown file mirrors the JSON (order, headings, tables)

Use exactly that structure. If a field you need does not exist, do NOT add new top-level fields. Put the information
in the closest existing field, or stop and ask me. If anything is unclear, stop and ask me before writing.

---

## 3. FIRST RUN — find every API in THIS project

### 3.1 Discover

Search the whole project for endpoints it defines or calls:

- route definitions / controllers (if this project is the API itself)
- API client wrappers, service classes, request builders
- test files (API tests, contract tests, fixtures, mocks)
- Postman / Insomnia / curl collections, OpenAPI / Swagger files
- API documents or notes in the repo (Markdown, text, spreadsheets)
- environment / config files (to learn base URLs and auth types; never copy secret values)

### 3.2 List before writing

Show me a table of everything you found, and wait for my "ok" before publishing anything:

| # | Method | Path (normalised) | Feature / group | Auth type | Where found (file:line) |

Mark endpoints you are unsure about, and say why.

### 3.3 Collect the facts for each endpoint

For every endpoint, collect:

- **Identity:** method; full path; normalised path (see §4); base URL (use the staging base URL; replace placeholders
  such as `{{base_url}}` with the real staging URL)
- **Purpose:** what it does, in one or two plain sentences
- **Auth:** type only, e.g. "user JWT (Bearer)", "web JWT", "test token", "CMS admin JWT", "none". Never the value.
- **Request:**
  - headers (names, required/optional, purpose; secret values as placeholders like `$USER_TOKEN`)
  - path params, query params and body fields: name, type, required/optional, meaning, allowed values, defaults
  - one example request with SYNTHETIC values only
- **Response:**
  - status codes it returns and when (success and errors)
  - response shape: keys and types; mark which keys carry personal data (name, email, phone, free text)
  - one example response with SYNTHETIC values only
- **Flow:** the end-to-end path. Client → endpoint → services → data stores → side effects (queues, background jobs,
  emails/SMS/push, payment or other third-party providers).
- **Data stores:** what it reads and writes (e.g. app DB tables, PII service, caches with their TTL if known, Kafka
  topics, Sidekiq/cron jobs, providers)
- **Good to know:** limits, idempotency, pagination defaults, ordering, caching, known quirks, related endpoints
- **Source:** the files you took the facts from (for your notes; follow the existing format on whether to publish it)

### 3.4 Facts only — never guess

Allowed sources, in order:

1. observed responses from staging
2. the owning developer's written answers
3. the source documents
4. source code, labelled "from code — confirm with Dev"

If a fact is unknown, write "Unknown — confirm with Dev". Never invent behaviour, fields, tables, limits or
status codes.

---

## 4. No duplicates (the repo is shared by several teams)

### 4.1 Unique key

Each entry's key is `METHOD + normalised path`:

- method upper-case (`GET`, `POST` …)
- path: keep the version prefix as written (e.g. `/V1`, `/web`); remove the base URL, query string and trailing slash
- path parameters as `:name`, e.g. `/V1/users/12345` and `/V1/users/{ref}` both become `/V1/users/:ref`
- compare keys case-insensitively

### 4.2 Before writing

Always re-read the LATEST `content/api-data.json` from `main` immediately before you change it (other teams push too).

### 4.3 Rules

- **Key not present:** add a new entry in the existing format, in the right group.
- **Key present:** do NOT add a second entry and do NOT rewrite other people's text. MERGE:
  - add only facts that are missing (a new field, status code, example or data store)
  - if the existing format has a place for it, note which framework/team also uses the endpoint
  - keep the existing wording; append, don't replace
- **Contradiction** (your facts disagree with the existing entry): do NOT change the entry. List it under
  "Conflicts" in your report (endpoint, existing text, your evidence with file:line) so I can resolve it with the owner.
- Never delete or rename another team's entries or groups.

---

## 5. Content rules (strict)

- **Pure API documentation:** no test cases, test results, QA status, pass/fail counts, bug lists, internal ticket
  or question IDs.
- **No secrets, ever:** tokens, JWTs, passwords, API keys, signatures, cookies, real Authorization values, DB
  credentials, internal hostnames with credentials. Use placeholders (`$USER_TOKEN`, `$TEST_TOKEN`).
- **Synthetic data only in examples:**
  - names like "QaUser"
  - emails on `example.test`
  - phone numbers clearly fake (e.g. `+91 10xxxxxxxx`)
  - fake IDs
  - never real users, real phone numbers, real emails or production records
- Plain, clear English for new joiners; explain abbreviations once.

---

## 6. Publish directly to `main` (no clone, no branch, no PR)

1. Build the new versions of `content/api-data.json` and `API-Documentation.md` in memory, in the existing format.
   Keep them in step: every JSON entry has its Markdown counterpart.
2. Validate before pushing:

   - the JSON parses
   - every entry has the fields `build.mjs` requires
   - there are no duplicate keys (§4.1)
   - the content contains no secret-looking values (JWTs `eyJ…`, `Bearer …`, long hex or base64 blobs) and no
     non-synthetic emails or phone numbers
3. Commit both files to `main` in ONE commit using the GitHub Git Data API:

   1. get the head commit of `main`
   2. create blobs for both files
   3. create a tree based on the head tree
   4. create a commit with message `docs: add/update <N> endpoints from <framework name>`
   5. update `refs/heads/main` without force

   If the ref update is rejected because `main` moved, re-read the latest files, merge again (§4) and retry.
   (Simpler alternative if needed: the contents API per file, `PUT repos/vidheybhogadi/API_Guide/contents/<path>`
   with the file's current `sha`; on a 409/422 sha mismatch, re-read, merge and retry.)
4. Never force-push, never rewrite history, never delete other teams' content.
5. Check the deploy: wait for the Netlify deploy of your commit (commit status / checks on that commit) and confirm
   it succeeded. If it failed, read the failure and fix it forward with a new commit. If you cannot fix it, tell me
   at once.

---

## 7. Report after every run

Reply with:

- Added: N endpoints (method + path)
- Merged: N endpoints (what was added to each)
- Conflicts: list (endpoint, existing vs yours, evidence)
- Skipped / unsure: list with reasons
- Commit SHA and Netlify deploy result

---

## 8. STANDING RULE — install it now

Add this rule to this project's agent instructions (`CLAUDE.md`, or the equivalent file your agent reads at every
start), then show me the diff:

> **Shared API documentation (always, without being asked).**
> Whenever an API is added, changed or removed in this project — in code, an API client, a route, a test, a
> collection, or an API document shared with you — update the shared API_Guide repo
> (https://github.com/vidheybhogadi/API_Guide, branch `main`) by following the "Shared Aisle API documentation"
> instructions:
>
> - read the existing format from `main` via the GitHub API (no clone)
> - document the endpoint with facts only (unknowns: "Unknown — confirm with Dev")
> - check duplicates by METHOD + normalised path, and merge instead of duplicating
> - no secrets, no test/QA content, synthetic data only
> - one commit straight to `main` (no force), confirm the Netlify deploy
> - report what was added, merged and conflicting
>
> For a removed API, do not delete the entry. Mark it "Deprecated / removed in <framework></framework>" and tell me, so the owner
> can decide.

---

## 9. Stop and ask me when

- you lack write access, or the format is unclear
- an endpoint's purpose or auth type cannot be found anywhere
- a conflict with another team's entry appears
- validation finds a possible secret or real personal data
- the Netlify deploy fails and the fix is not obvious
