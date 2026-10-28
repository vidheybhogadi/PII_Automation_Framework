# Shared Aisle Network API documentation — standing instructions for this project

## Purpose

You maintain the SHARED API documentation of the **Aisle Network apps** — Aisle, Arike, Neene, Neetho, Anbe, Jilebi
and HeyDil — for every API of those apps that this project defines or calls. Each API is filed under the app it
belongs to (§2A). APIs of anything else (other companies, public APIs, personal projects) are never documented. One
documentation repo is used by several teams and frameworks:

- Repo: https://github.com/vidheybhogadi/API_Guide
- Branch: `main` (the ONLY branch; Netlify builds and deploys it on every push)
- Audience: new joiners. They must understand what each endpoint is, how to call it, its end-to-end flow, which data
  stores it touches, and what is good to know.

You will (1) do a one-time FIRST RUN that documents every existing API in this project, and (2) install a STANDING
RULE — machine-wide for every coding agent on this computer, in this repo, and as a CI check — so every new or changed
API is documented automatically from then on, whichever agent is used.

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
- `content/apps.json` — the app registry: every Aisle Network app, its family, backend and classification signals
  (read it FIRST; §2A depends on it)
- `build.mjs` — how the content folders are turned into the site (field names, required fields, validation)
- `content/apps/<folder>/api-data.json` — the data of one folder (the source of truth for its entries). A folder is
  an app id (`aisle`, `arike`, `neene`, `neetho`, `anbe`, `jilebi`, `heydil`), the vernacular family's shared folder
  `vernac`, or `network` for network-wide routes. `content/apps/aisle/api-data.json` is the fullest example.
- `content/apps/<folder>/API-Documentation.md` — the Markdown copy of the same folder
- `netlify.toml` — build settings (so you know what Netlify runs)

From these, write down for yourself:

- the exact JSON shape of one endpoint entry (keys, types, which are required), including the optional `apps` list
- how endpoints are grouped (groups / features / sections) and how a group is named
- how each folder's Markdown file mirrors its JSON (order, headings, tables)

Use exactly that structure. If a field you need does not exist, do NOT add new top-level fields. Put the information
in the closest existing field, or stop and ask me. If anything is unclear, stop and ask me before writing.

---

## 2A. Which app does this API belong to? (decide BEFORE writing anything)

Every entry is filed under exactly one folder of `content/apps/`. Classify each API with the signals in
`content/apps.json` (read the latest from `main`), **in this order**; the first signal that decides wins:

1. **Host** — e.g. `*.aisle.co` (`app.aisle.co`, `testa2.aisle.co`, `login.`/`notification.`/`socket.`/`graph.`/
   `images.aisle.co`) → Aisle; `app.koode.co` / `testapp.koode.co` → the vernacular backend (go on to step 3 to find
   the app); `prod.jalebi.social` / `test.lehapp.com` → Jilebi. Exception: a route that takes `app_name` and serves
   several apps (e.g. `login.aisle.co/V1/external/*` OTP login) is network-wide, whatever its host — see step 3.
2. **Path prefix and case** — uppercase `/V1/`, `/web/`, `/admin/`, `/api/` → Aisle; lowercase `/v1/` → the
   vernacular backend.
3. **`app_name` header / parameter** (or the user's `app_id`) — `Arike`, `Neene`, `Neetho`, `Anbe`, `HeyDil` select the
   vernacular app; a route that takes `app_name` and serves several apps is network-wide.
4. **Bundle / package ids, image hosts, PII tenant** — e.g. iOS `co.aisle.app` / Android `com.aisle.app` / PII
   tenant `aisle` → Aisle; `app.aisle.co.arike` or `*.arike.in` → Arike; `co.neene.app` → Neene; `co.neetho.app` →
   Neetho; `co.anbe.app` → Anbe.
5. **Source repository / routes file** — `aisle_new` → Aisle; `aislenetwork/desiapp` → the vernacular backend (then
   check whether the route branches per app, e.g. `is_arike?`).

Outcomes:

| Result                                                                                                                            | Where it goes                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One app                                                                                                                           | `content/apps/<app id>/` (no `apps` list needed)                                                                                                                                                                                                                                                                      |
| A vernacular `/v1` route shared by the vernacular apps (the code does not branch per app)                                         | Document ONCE in `content/apps/vernac/` with `apps: ["arike", "neene", "neetho", "anbe", "heydil"]` (narrow the list only if the code says so)                                                                                                                                                                        |
| A vernacular route the code branches for one app (e.g. `is_arike?`)                                                               | That app's folder, e.g. `content/apps/arike/`                                                                                                                                                                                                                                                                         |
| Network-wide (serves several apps, takes `app_name`, e.g. `login.aisle.co/V1/external/*`, admin reports and sharings, aisle-cms)  | Document ONCE in `content/apps/network/` with `apps` listing every app it serves                                                                                                                                                                                                                                      |
| Ambiguous (signals disagree or are missing)                                                                                       | **STOP and ask me.** Never guess the app.                                                                                                                                                                                                                                                                             |
| NOT an Aisle Network app — e.g. Facebook / Google / Twitter APIs, any other company, personal projects, random public APIs        | **NEVER document it.** Report it as `skipped: not an Aisle Network app`.                                                                                                                                                                                                                                              |
| A third-party provider or internal service an app calls (Razorpay, Paytm, the PII service itself, SMS / email / push providers …) | Never its own entry. Mention it only as a provider or data store on the app endpoint that calls it. Routes an app's **own backend** serves are that app's APIs, even when they front such a service (e.g. Aisle's `/V1/pii_integration/*` and `/V1/api/v1/pii-test` facade routes on testa2.aisle.co are Aisle APIs). |
| An app that is not in `content/apps.json`                                                                                         | **STOP and ask me.** Only the owner adds apps; never create a new folder or app yourself.                                                                                                                                                                                                                             |

Write only into `content/apps/<folder>/api-data.json` and `content/apps/<folder>/API-Documentation.md` of the folders
chosen here. Never touch `content/apps.json`, `build.mjs`, `src/`, other folders or the root files.

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

| # | App (folder, §2A) | Method | Path (normalised) | Feature / group | Auth type | Where found (file:line) |

Mark endpoints you are unsure about, and say why. List APIs that are not Aisle Network APIs separately as
`skipped: not an Aisle Network app` — they are never published.

### 3.3 Collect the facts for each endpoint

For every endpoint, collect:

- **Identity:** app (§2A); method; full path; normalised path (see §4); base URL (use the app's staging base URL
  from `content/apps.json`; replace placeholders such as `{{base_url}}` with the real staging URL)
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

Each entry's key is `app + METHOD + normalised path`. A shared endpoint (vernacular `/v1` route, network-wide route)
is ONE entry whose `apps` list names every app it serves — never one copy per app.

- method upper-case (`GET`, `POST` …)
- path: keep the version prefix as written (e.g. `/V1`, `/web`, `/v1` — the case tells Aisle and the vernacular
  backend apart); remove the base URL, query string and trailing slash
- path parameters as `:name`, e.g. `/V1/users/12345` and `/V1/users/{ref}` both become `/V1/users/:ref`
- compare keys case-insensitively, except the version prefix (`/V1` is Aisle, `/v1` is the vernacular backend)
- `slug` is unique within its folder; follow the folder's existing pattern (`api-001`, `api-002` …)

### 4.2 Before writing

Always re-read the LATEST `content/apps.json` and the `content/apps/<folder>/api-data.json` files you will change from
`main` immediately before you change them (other teams push too). Also look for the same METHOD + path in the shared
folders (`vernac`, `network`) and in the other folders of the same family, so a shared route is never filed twice.

### 4.3 Rules

- **Key not present:** add a new entry in the existing format, in the right folder (§2A) and group.
- **Same route already filed for another app of the family** (e.g. it is in `content/apps/arike/` and you found it
  for Neene too): do NOT add a copy. Add your app to that entry's `apps` list (merge), or stop and ask whether it
  should move to the shared folder.
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

1. Build the new versions of `content/apps/<folder>/api-data.json` and `content/apps/<folder>/API-Documentation.md`
   (only the folders chosen in §2A) in memory, in the existing format. Keep them in step: every JSON entry has its
   Markdown counterpart.
2. Validate before pushing:

   - the JSON parses
   - every entry has the fields `build.mjs` requires
   - there are no duplicate keys (§4.1), and every entry in `vernac` / `network` has an `apps` list of ids from
     `content/apps.json`
   - nothing outside `content/apps/<folder>/` changed
   - the content contains no secret-looking values (JWTs `eyJ…`, `Bearer …`, long hex or base64 blobs) and no
     non-synthetic emails or phone numbers

3. Commit the changed files to `main` in ONE commit using the GitHub Git Data API:

   1. get the head commit of `main`
   2. create a blob for each changed file
   3. create a tree based on the head tree
   4. create a commit with message `docs(<app or folder>): add/update <N> endpoints from <framework name>`
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

- Added: N endpoints (app + method + path)
- Merged: N endpoints (what was added to each)
- Conflicts: list (endpoint, existing vs yours, evidence)
- Skipped / unsure: list with reasons — including every `skipped: not an Aisle Network app`
- Commit SHA and Netlify deploy result

---

## 8. STANDING RULE — install it now (every agent, this repo, CI)

Goal: from now on, EVERY coding agent on this computer (Claude Code, Codex, Gemini CLI, Windsurf, Cursor, Copilot …)
keeps API_Guide up to date, not only the one running this prompt. Install it in three layers. Every step is
**idempotent**: running this prompt again updates what is there instead of adding a second copy.

### 8.1 The rule line (same text everywhere)

Wherever these instructions say "add the rule", insert exactly this block. If the two markers already exist in the
file, replace everything between them (markers included) with this block; otherwise append it at the end of the file,
after one blank line. Never change any other content of the file.

```markdown
<!-- api-guide-rule:start -->

Shared Aisle Network API documentation (always, without being asked): whenever an API of an Aisle Network app
(Aisle, Arike, Neene, Neetho, Anbe, Jilebi, HeyDil) is added, changed or removed in any project, follow the
api-guide-docs skill (~/.config/api-guide/SKILL.md) to file it under the right app in
https://github.com/vidheybhogadi/API_Guide (branch main). Never document APIs of anything else.

<!-- api-guide-rule:end -->
```

### 8.2 Layer 1 — machine-wide (all agents on this computer)

**a) Write ONE master skill file** at `~/.config/api-guide/SKILL.md` (create the folder if needed; on Windows
`%USERPROFILE%\.config\api-guide\SKILL.md`). It must be self-contained, so it works in any project without this
prompt. Use the Agent Skills format:

```markdown
---
name: api-guide-docs
description: Use whenever an API, endpoint, route, API client or API document of an Aisle Network app (Aisle, Arike, Neene, Neetho, Anbe, Jilebi, HeyDil) is added, changed or removed in any project — file it under the right app in the shared API_Guide repo (vidheybhogadi/API_Guide, branch main). Never document APIs of anything else (other companies, public APIs, personal projects).
---

# Shared Aisle Network API documentation (api-guide-docs)

<body — see below>
```

The body is the full operating instructions, copied **verbatim** from this prompt:

1. the Purpose paragraph and bullets (Aisle Network apps only, repo, branch `main`, audience) and "Work directly on
   `main` through the GitHub API …"
2. §1 Prerequisites
3. §2 Learn the existing format and **§2A Which app does this API belong to?** (the classification signals, the
   outcomes table and "write only into the chosen folders")
4. §3.3 Collect the facts and §3.4 Facts only — applied to the endpoints that were added or changed (not the whole
   project; the one-time discovery of §3.1–3.2 is NOT part of the skill)
5. §4 No duplicates, §5 Content rules, §6 Publish directly to `main` (including the Netlify deploy check), §7 Report
6. **Removed APIs:** "For a removed API, do not delete the entry. Mark it `Deprecated / removed in <framework>`
   and tell the user, so the owner can decide."
7. §10 Stop and ask

If the file already exists, overwrite it with the new content (it is generated from this prompt; nothing else lives
there).

**b) Detect the agents and install for each one that exists.** Check each home folder; if it does not exist, skip
that agent and say so in the summary (do not create folders for agents that are not installed).

| Agent       | Detect                          | Install                                                                                                                   |
| ----------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `~/.claude/`                    | symlink `~/.claude/skills/api-guide-docs/SKILL.md` → master; add the rule (§8.1) to `~/.claude/CLAUDE.md`                 |
| Codex CLI   | `$CODEX_HOME`, else `~/.codex/` | symlink `<codex home>/skills/api-guide-docs/SKILL.md` → master; add the rule to `<codex home>/AGENTS.md`                  |
| Gemini CLI  | `~/.gemini/`                    | add the rule to `~/.gemini/GEMINI.md`, followed inside the markers by: "Read ~/.config/api-guide/SKILL.md before acting." |
| Windsurf    | `~/.codeium/windsurf/`          | add the rule to `~/.codeium/windsurf/memories/global_rules.md` (create `memories/` if needed)                             |

- Symlinks: `ln -sfn ~/.config/api-guide/SKILL.md <target>` (create the `skills/api-guide-docs/` folder first). If an
  existing target is a regular file, replace it with the symlink. If symlinks are not possible (e.g. Windows without
  developer mode), COPY the master file instead and say in the summary that the copy must be refreshed when this
  prompt is run again.
- Create a missing `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` / `global_rules.md` with only the rule block.
- Agents that keep global rules only in their settings UI (e.g. Cursor "User Rules", ChatGPT, claude.ai) cannot be
  written to from here: list them in the summary and tell me to paste the rule line (§8.1) myself; for web chats see §9.

**c) Show a summary** of every file created, changed, symlinked, copied or skipped (path + action), plus the diff
of each changed instruction file. Never touch anything outside the files named above.

### 8.3 Layer 2 — this repo (any agent that opens it)

Add the rule (§8.1) to each of these files in the current repo, creating the file if it is missing:

- `AGENTS.md` (Codex, Cursor, Copilot agents and others read it)
- `CLAUDE.md` (Claude Code)
- `.github/copilot-instructions.md` (GitHub Copilot)
- `.cursor/rules/api-guide.mdc` (Cursor). If you create it, start it with this frontmatter, then the rule block:

  ```markdown
  ---
  description: Shared Aisle Network API documentation rule (API_Guide)
  alwaysApply: true
  ---
  ```

Show me the diff and **commit only after my approval** (message: `chore: add shared API documentation rule`). Do
not push unless I ask.

### 8.4 Layer 3 — CI safety net (catches what every agent missed)

Add `.github/workflows/api-docs-check.yml` to the current repo — **with my approval**, and show it to me first. On
every pull request it lists the changed files; if API source files changed but this repo's API documentation file was
not changed in the same PR, it posts ONE pull-request comment (updated in place on later pushes, found by a hidden
marker) saying the API docs were not updated. It is a warning only: the job always succeeds.

Template (the QA automation repo uses the same file with its own paths). Adapt only the lines marked `ADAPT`:

```yaml
name: API docs check

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  api-docs-check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            // ADAPT: files that define or describe APIs in this repo
            const API_FILES = [
              /^src\/(.*\/)?(routes|controllers|clients)\//,
              /\.postman_collection\.json$/i,
              /(^|\/)openapi[^/]*\.ya?ml$/i,
            ];
            // ADAPT: this repo's API documentation file(s), if it keeps any; otherwise use the note below
            const DOC_FILES = [/^docs\/API-Documentation\.md$/];
            const MESSAGE =
              'API files changed but the API docs were not updated — update API_Guide (https://github.com/vidheybhogadi/API_Guide) with the api-guide-docs skill.';

            const MARKER = '<!-- api-docs-check -->';
            const { owner, repo } = context.repo;
            const issue_number = context.payload.pull_request.number;
            try {
              const files = await github.paginate(github.rest.pulls.listFiles, {
                owner, repo, pull_number: issue_number, per_page: 100,
              });
              const names = files.flatMap((f) => [f.filename, f.previous_filename].filter(Boolean));
              const apiChanged = names.filter((n) => API_FILES.some((re) => re.test(n)));
              const docsChanged = names.some((n) => DOC_FILES.some((re) => re.test(n)));

              const comments = await github.paginate(github.rest.issues.listComments, {
                owner, repo, issue_number, per_page: 100,
              });
              const existing = comments.find((c) => c.body && c.body.includes(MARKER));

              if (apiChanged.length && !docsChanged) {
                const list = [...new Set(apiChanged)].slice(0, 30).map((n) => `- \`${n}\``).join('\n');
                const body = `${MARKER}\n**API docs check:** ${MESSAGE}\n\nAPI files changed in this PR:\n${list}`;
                core.warning(MESSAGE);
                if (existing) await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
                else await github.rest.issues.createComment({ owner, repo, issue_number, body });
              } else if (existing) {
                const body = `${MARKER}\n**API docs check:** ✅ the API docs are updated in this PR (or no API files changed any more).`;
                await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
              } else {
                core.info(apiChanged.length ? 'API files and API docs both changed.' : 'No API files changed.');
              }
            } catch (err) {
              // Never fail the PR (e.g. fork PRs get a read-only token and cannot comment).
              core.warning(`API docs check could not complete: ${err.message}`);
            }
```

If the repo keeps no API documentation file of its own, keep `DOC_FILES` pointing at a file that does not exist
there — the comment then appears on every PR that changes API files, as a reminder to update API_Guide. Use only
`actions/checkout` / `actions/github-script` pinned to an exact major version, keep the minimal permissions above, and
never add secrets to this workflow.

---

## 9. Web chats (ChatGPT, claude.ai)

Web chats cannot run commands or push to GitHub, so they cannot follow this prompt. Tell me to paste this instruction
into **ChatGPT → Settings → Personalization → Custom instructions**, or into a **claude.ai Project → Project
instructions** (it is also on the API_Guide website: All apps or any app's overview → "Using ChatGPT or Claude on the web?" → Copy
web-chat instruction):

<!-- web-chat-instruction:start -->

```text
When I share or describe an API (an endpoint, route, API client or API document), first decide whether it belongs to an Aisle Network app (Aisle, Arike, Neene, Neetho, Anbe, Jilebi, HeyDil). If it does not (another company, a public API, a personal project), say "skipped: not an Aisle Network app" and draft nothing. If it does, choose the app from its host, path prefix (uppercase /V1 is Aisle, lowercase /v1 is the shared vernacular backend), app_name header and bundle ids, as listed in content/apps.json of https://github.com/vidheybhogadi/API_Guide (branch main); if the app is unclear or not in that list, ask me. Then draft its entry for that app's folder (content/apps/<app>/, or content/apps/vernac/ or content/apps/network/ with an apps list when several apps share it). You cannot push to GitHub, so: follow the existing format of content/apps/<folder>/api-data.json and API-Documentation.md in that repo (ask me to paste them if you cannot read them); write facts only (unknowns: "Unknown — confirm with Dev"); no secrets, tokens or real personal data, synthetic examples only; no test cases or QA status; check whether an entry with the same app + METHOD + normalised path already exists and merge instead of duplicating. Then remind me to publish the draft with a coding agent (Claude Code, Codex, Cursor …) that has the api-guide-docs skill or the "Shared Aisle Network API documentation" prompt.
```

<!-- web-chat-instruction:end -->

---

## 10. Stop and ask me when

- you lack write access, or the format is unclear
- the app an API belongs to is ambiguous (§2A signals disagree or are missing)
- the API belongs to an app that is not in `content/apps.json` (only the owner adds apps)
- an endpoint's purpose or auth type cannot be found anywhere
- a conflict with another team's entry appears
- validation finds a possible secret or real personal data
- the Netlify deploy fails and the fix is not obvious
- an install step (§8) would overwrite content you did not write, or a symlink/copy fails
