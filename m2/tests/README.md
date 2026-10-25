# Milestone 2 tests

Playwright project `m2-api` (`npm run m2:test`), tagged `@m2`. Test code is added only through the testcase-manager
agent (PROPOSE → approval → IMPLEMENT); see `CLAUDE.md`.

| Folder     | What                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- |
| `per-api/` | Per-API checks generated from the design (`AUTH`, `TOKEN`, …): one test per inventory API |
| `g1/`      | G1 scenario cases (PII integration routes, TEST_TOKEN): M2-PIIR-001/002/003/004/007       |
| `unit/`    | Framework self-tests (project `m2-unit`, no network; part of `npm run verify`)            |
| `zz-late/` | Per-API cases that need an approved suite account — queued last (`m2/src/checks/late.ts`) |

- **Titles = workbook IDs** (`M2-API-013-AUTH …`, `M2-PIIR-001 …`), so results map back to `m2/docs/m2-test-cases.xlsx`.
  Names, tags and Blocked status come from `m2/scripts` at run time — never copied into test code.
- **Client**: `m2/src/clients/m2-client.ts` calls any API by inventory ID (method, path and headers from the Dev cURL).
- **Gating**: every test first follows its design status (`blockIfOpen`: open M2Q questions → Blocked), then
  runtime prerequisites (`m2/src/prereq.ts`): new accounts only with `M2_CREATE_ACCOUNTS=true`, Dev-provided
  onboarded / connected accounts (M2Q-36), CMS admin (M2Q-04), PII DB + user_id mapping (M2Q-16 / M2Q-37),
  approved contract baselines (M2Q-24), Dev windows (PII outage, payment sandbox).
- **Read gates / special statuses** (QA lead, 2026-10-24): read gates are OFF on testa2 and QA cannot switch them
  (M2Q-02), so tests check gate-OFF behaviour; a gate-ON part is recorded as a `waiting` annotation, and a case that
  is gate-ON only is **WAITING** (M2Q-43, skipped with the reason). Unmigrated-profile cases were **removed**:
  all staging profiles are migrated (M2Q-05, QA lead 2026-10-24). All DB cases are **on hold** (M2Q-44).
- **Accounts**: `m2/src/accounts/accounts.ts` + `m2/src/auth/session.ts` (phone login, +91 10… never 106…, OTP
  1234). Created accounts go to the git-ignored ledger `reports/m2/accounts/` and are deleted where staging allows.
  Delete / reset / deactivate / report routes never run for Dev-provided accounts.
  The run pool `reports/m2/accounts/<run>-pool.json` keeps onboarded, throwaway and invite-sender accounts, the
  pair's conversation id and each account's approval clock, so a restarted worker re-uses them. At worker start the
  accounts that need staging's approval are onboarded (`M2_PREONBOARD=false` switches it off); approval is waited for
  up to `M2_APPROVAL_WAIT_MS` (default 15 min) from onboarding, and the approval-dependent cases run last.
  `M2_PREONBOARD_SENDERS` (default 2; 8 for `m2:contracts:record`) female invite senders / partners are onboarded
  at worker start; each serves a receiver once (invite, like, pass), tracked in the run pool.
- **Shared accounts stay consistent** (2026-10-25): cases that send invalid / oversized names (M2-PIIR-005 on its own
  throwaway; M2-PIIR-006, M2-FNAME-008, FIELD / PARAM / BODY on name routes) put the previous first name back through
  the G1 write route afterwards — a refused write can still change the PII name (256 characters → 500).
- **Writer visible to the reader** (EXPOSE / CACHE, `m2/src/checks/visibility.ts`, 2026-10-25): the connected pair hides
  A from likes / invite / discover lists, so each list route creates its own relationship first — a pending invite
  (005, 116, 006–008), a like A → B (048, 126, 054), B's like (047) or pass (049), a chat message (069), a share link
  (016 with `?ps=`), or an account already listed (014, 015, 019, 020). GET `/V1/users/:ref` and `/web/users/:ref`
  answer the caller's own profile, so their CACHE case is own-profile. API-106 stays Blocked (M2Q-45).
- **Removed for good** (user decision 2026-10-25, IDs never reused, UT-M2-034): 73 IDOR cases whose request names no
  user / profile id, and 30 EXPOSE / CACHE cases on routes whose reply never contains another member (code references
  in `m2/scripts/m2-code-evidence.ts` NO_OTHER_USER). The design rules in `m2/scripts/m2-baseline.ts` keep them out.
- **Contract states** (item 4, 2026-10-25): send_request_to_profile (API-004) runs as an approved account with daily
  requests left towards a fresh approved receiver; deactivate (API-029 / API-123) on an approved throwaway that is
  re-activated for re-use; fetch_login_response (API-062) on a brand-new account per case; invite accept / pass routes
  on a pending invite from a sender with no prior invite.
- **Contracts**: `npm run m2:contracts:record` (explicit only) → `m2/contracts/recorded/` → `npm run m2:contracts:review`
  (`m2/contracts/REVIEW.md`) → `npm run m2:contracts:approve -- --by "<name>" <case…|all>` → asserted from
  `m2/contracts/approved/`. A 2xx to INVALID input (PARAM / BODY, STATE except "valid request") fails unless the
  approved file names the code reference in `acceptedBecause` (`--accept "<variant>=<code ref>"`, one case at a time).
  A sent variant without an approved reference is checked by its invariants only and the case is then Blocked
  (M2Q-24, "re-record and approve") — approved variants that are not sent now (safety) are not compared.
- **No false passes** (audit fixes 2026-10-25): a refusal is a 4xx — a 5xx fails (M2Q-39); TOKEN sends a parseable
  credential of the wrong type (web JWT on app routes); "unchanged" compares the whole own profile minus volatile keys
  plus the about text (`m2/src/checks/own-view.ts`); STATE is decided by state; EXPOSE needs the writer in the reply
  and IDOR a target id in the request, otherwise Blocked (`m2/src/checks/verdicts.ts`).
- **Results**: `npm run m2:test` → `reports/m2/latest/run-data.json` → `npm run m2:report` (HTML) and
  `npm run m2:docs` (workbook "Current Status", "Automation Status", "Last Run (observed)").
