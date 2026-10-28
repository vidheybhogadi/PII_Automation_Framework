# Shared Aisle API documentation — standing instructions for this project

## Purpose

You maintain the SHARED Aisle API documentation for every API this project defines or calls. One documentation
repo is used by several teams and frameworks:

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

Shared API documentation (always, without being asked): whenever an API is added, changed or removed in any project,
follow the api-guide-docs skill (~/.config/api-guide/SKILL.md) to update https://github.com/vidheybhogadi/API_Guide
(branch main).

<!-- api-guide-rule:end -->
```

### 8.2 Layer 1 — machine-wide (all agents on this computer)

**a) Write ONE master skill file** at `~/.config/api-guide/SKILL.md` (create the folder if needed; on Windows
`%USERPROFILE%\.config\api-guide\SKILL.md`). It must be self-contained, so it works in any project without this
prompt. Use the Agent Skills format:

```markdown
---
name: api-guide-docs
description: Use whenever an API, endpoint, route, API client or API document is added, changed or removed in any project — document it in the shared Aisle API_Guide repo (vidheybhogadi/API_Guide, branch main).
---

# Shared Aisle API documentation (api-guide-docs)

<body — see below>
```

The body is the full operating instructions, copied **verbatim** from this prompt:

1. the Purpose bullets (repo, branch `main`, audience) and "Work directly on `main` through the GitHub API …"
2. §1 Prerequisites
3. §2 Learn the existing format
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
  description: Shared API documentation rule (API_Guide)
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
instructions** (it is also on the API_Guide website: Overview → "Using ChatGPT or Claude on the web?" → Copy web-chat
instruction):

<!-- web-chat-instruction:start -->

```text
When I share or describe an API (an endpoint, route, API client or API document), draft its entry for the shared Aisle API documentation (https://github.com/vidheybhogadi/API_Guide, branch main). You cannot push to GitHub, so: follow the existing format of content/api-data.json and API-Documentation.md in that repo (ask me to paste them if you cannot read them); write facts only (unknowns: "Unknown — confirm with Dev"); no secrets, tokens or real personal data, synthetic examples only; no test cases or QA status; check whether an entry with the same METHOD + normalised path already exists and merge instead of duplicating. Then remind me to publish the draft with a coding agent (Claude Code, Codex, Cursor …) that has the api-guide-docs skill or the "Shared Aisle API documentation" prompt.
```

<!-- web-chat-instruction:end -->

---

## 10. Stop and ask me when

- you lack write access, or the format is unclear
- an endpoint's purpose or auth type cannot be found anywhere
- a conflict with another team's entry appears
- validation finds a possible secret or real personal data
- the Netlify deploy fails and the fix is not obvious
- an install step (§8) would overwrite content you did not write, or a symlink/copy fails
