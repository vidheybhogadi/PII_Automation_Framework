# Synthetic account login and onboarding (Milestone 2)

Source: the Aisle UI automation team, verified by QA on staging (`https://testa2.aisle.co`) on 2026-10-23 with two
throwaway accounts. Code: `m2/src/auth/session.ts`, `m2/src/accounts/onboarding.ts`, `m2/src/accounts/accounts.ts`.
All data is synthetic. Accounts are created only when `M2_CREATE_ACCOUNTS=true`.

## Numbers

- +91 mobile numbers starting with `10` (10 digits), generated per run.
- **Never the 106 series** (1060000000–1069999999): the UI team's fixed and approved accounts live there. Never
  touch any 106 number.
- OTP on staging: `1234`.
- Every number the suite creates is written to the git-ignored ledger `reports/m2/accounts/<run>-w<n>.json`
  **before** the first request. The ledger holds the full synthetic number, app user id, ref, device id, stage,
  profile state and the deletion outcome — never tokens.

## 1. Log in

1. `POST /V1/sessions/login_with_phone_number` (no credential). JSON body:
   `mobile_number`, `phone_code_id: 242` (+91), `device_type` (`ios`), `app_version` (`7.9.15`),
   `unique_identifier` (a run-scoped device id), `signature_v1`.
   - `signature_v1` is the app's static value **from `.env` `M2_LOGIN_SIGNATURE_V1`**. It is a secret: never
     commit, log, record or print it.
   - The device fields go in the body; headers are optional.
2. `POST /V1/sessions/verify_number_login_v1` `{phone_code_id: 242, mobile_number, otp: "1234"}`.
   - The reply carries `auth_token`, `id`, `ref`, `application_stage` and `profile_state`, either at the top level or
     under `data` (read both).
   - Errors: "The entered OTP is invalid." and "No OTP has been generated for this user or number." These come
     back as HTTP 200 with no token (observed 2026-10-23 for a wrong OTP, a too-short number, letters and an empty
     number).
3. The token is an RS256 JWT (about 168 h) bound to the device. Send the same `unique_identifier` and `device_type`
   on every later call, as `Authorization: Bearer <token>`.

Optional: `GET /V1/fields/phonecodes` (no auth) lists the phone codes.

## 2. Onboard

1. `POST /V1/user/submit_profile` (Bearer). The body is `data` with:
   - `general_information`:
     - `date_of_birth_v1` (`DD/MM/YYYY`), `gender` (`Male` / `Female`), `height` 60
     - a synthetic `first_name`
     - `personal_email` on the non-deliverable test domain (`AISLE_TEST_EMAIL_DOMAIN`, default `example.test`)
       — never a real inbox
     - options: `diet` (1 "Non-Vegetarian"), `drinking_v2` (4 "Regularly"), `faith` (6 "Hindu"),
       `marital_status_v1` (9 "Single"), `smoking_v2` (4 "Regularly"), `workout` (4 "Regularly")
     - `languages` [{id 2, not mother tongue}, {id 1, mother tongue}]
     - `ref_id` ""
   - `hide_first_name` false
   - `photos`: 4 items (`faceDetectionTime` 330, `isFaceDetected` true, `is_replace` false,
     `original_image_path` `automation_photo_N.jpg`, `photo` = an Aisle CDN URL, `selected` false)
   - `relationship_goal` (2 "Settle down", default, shown on profile)
   - `about` "" and `reply_id` 0

   An option is the app's full option object (it carries the app's own spelling `positon`). Latitude, longitude and
   preferences are not needed.

   **Photos must match the declared gender.** Moderation compares faces with the gender, and a mismatch is rejected.
   - The fixtures default to gender Male with the hosted male set; Female uses the female set. Both sets are four
     different photos on `https://prodimages.aisle.co/<hash>.png`, listed in `m2/src/config/m2-config.ts`.
   - No photo repeats within one profile.
   - `submit_profile` copies each image from its URL. If it cannot fetch one, it stores a 54-byte placeholder and
     still returns 200, and moderation then rejects the profile. So before submit every URL is fetched and must
     return real image bytes. QA saw 245–2,830 KB for the male set.
   - Upload: `POST /V1/images` (Bearer, multipart/form-data, field `image`) → 200 with a CDN URL. It is used only
     when `M2_ONBOARDING_UPLOAD_IMAGE` lists 4 synthetic, non-person test images. Never real people's photos.

   Expected reply: 200, `profile_state` "pending_not_verified", and the submitted first name.

2. `POST /V1/account_journey/update_community_message_agreed` (Bearer, no body) → 200.
3. Verify the login again. `application_stage` must be "completed" — a 200 from submit alone is not proof.
4. `GET /V1/users/fetch_own_info` → 200 with `user_id`, `first_name`, `profile_state`, `gender`, `hide_first_name`,
   … (no email).

### Moderation caveat (open — M2Q-36)

- The UI team reports that API-onboarded profiles usually become "image_inappropriate" and then "disapproved" after
  about 26–32 s. Their photo sets were gender-mixed.
- QA saw "image_inappropriate" about 35 s after submit with gender-mixed sets.
- With the gender-matched male set (2026-10-23), the profile stayed "pending_not_verified" for more than 60 s. These
  calls all returned 200 before and after that time, with the old and a fresh token: `fetch_own_info`,
  `verify_user_v1`, `list_connected_profiles`, `matches_list_v2`, `invites/all_requests` and `/users/:ref`.
- Still open: an admin approval or a test allow-list for API-onboarded profiles.

The fixtures re-check `profile_state` before they hand out an account. If it is "image_inappropriate",
"disapproved" or "disabled", tests that need an active profile are **Blocked** with that reason (never failed,
never passed).

## 3. Delete (end of run and `npm run m2:accounts:cleanup`)

Accounts are deleted once at the end of a run (Playwright global teardown), not per worker: a worker restarted
after a failure logs in again to the run's accounts (`reports/m2/accounts/<run>-pool.json`) instead of creating new
ones.

- `POST /V1/user/delete` `{id: <ref>, reason_id: 1, note: "Synthetic QA account"}` (Bearer) → 200.
  `{id}` alone returns 500.
- After a delete the old token is dead. A new login starts again at application_stage
  "general_information_stage_1" (no profile).
- A never-onboarded account cannot be deleted. The clean-up onboards it first (synthetic values), then deletes it.
- A "disabled" profile cannot be recovered (activate_user returns 403, delete has no effect). It is marked
  `unusable` in the ledger.

## Not covered by this flow

- Option-list routes: unknown even to the UI team (still open in M2Q-36).
- Web token issuance: the UI team has no web app (M2Q-41).
- Selfie verification: the UI team cannot complete it (M2Q-32).

The three flow routes (`GET /V1/fields/phonecodes`, `POST /V1/sessions/login_with_phone_number`,
`POST /V1/account_journey/update_community_message_agreed`) are not PII-affected. They are not in the Dev PII
inventory or the workbook.
