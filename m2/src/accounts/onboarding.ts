/**
 * Onboarding a synthetic account (flow from the Aisle UI automation team, verified by QA on staging 2026-10-23;
 * m2/docs/onboarding-flow.md):
 *
 *   1. POST /V1/user/submit_profile (Bearer) — the body below: hard-coded option ids, synthetic first name, a
 *      synthetic email on the non-deliverable test domain, 4 Aisle-CDN photos → 200, profile_state
 *      "pending_not_verified".
 *   2. POST /V1/account_journey/update_community_message_agreed (Bearer, no body) → 200.
 *   3. Re-verify the login: application_stage must be "completed" (a 200 from submit alone is not proof).
 *   4. GET /V1/users/fetch_own_info → 200 (user_id, first_name, profile_state, gender, hide_first_name; no email).
 *
 * Photos (2026-10-23 correction): moderation compares faces with the declared gender, so a profile gets only the
 * hosted photo set of its OWN gender (default Male), never a repeated photo. submit_profile copies each image from
 * its URL — if it cannot fetch one it stores a 54-byte placeholder and still answers 200 (moderation then rejects) —
 * so every URL is fetched first and must return real image bytes. Optional: upload SYNTHETIC, non-person test
 * images (POST /V1/images, multipart field "image") via M2_ONBOARDING_UPLOAD_IMAGE — never real people's photos.
 *
 * Moderation caveat (open sub-question of M2Q-36): API-onboarded profiles may become "image_inappropriate" →
 * "disapproved" within ~26–35 s (UI team; QA saw it with gender-mixed sets). With the gender-matched male set QA saw
 * the profile stay "pending_not_verified" >60 s. Callers re-check the state before using an account.
 */
import axios from 'axios';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { ApiResponse } from '../../../core/http/api-response';
import type { M2Config } from '../config/m2-config';
import type { ExtraRoute } from '../clients/m2-client';
import { AUTH } from '../auth/credentials';
import { COMMUNITY_AGREED, field, SessionError, type SessionHelper, type UserSession } from '../auth/session';

/** An option object as the app sends it (note the app's own spelling "positon"). */
export const opt = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  positon: id,
  ...extra,
});

export interface OnboardingInput {
  firstName: string;
  email: string;
  gender: 'Male' | 'Female';
  /** Photo URLs (4, all different); filled by preparePhotos() when omitted. */
  photos?: readonly string[];
}

export const UPLOAD_IMAGE: ExtraRoute = {
  key: 'uploadImage',
  method: 'POST',
  path: '/V1/images',
  headers: ['Accept'],
};

/** Smallest size accepted as a real image (the placeholder stored for an unreachable URL is 54 bytes). */
export const MIN_IMAGE_BYTES = 10_000;

/** GET a photo URL and require real image bytes; returns the byte count. */
export async function checkPhoto(url: string, timeoutMs: number): Promise<number> {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: timeoutMs,
    validateStatus: () => true,
    maxRedirects: 3,
  });
  const type = String(res.headers['content-type'] ?? '');
  const bytes = res.data ? (res.data as ArrayBuffer).byteLength : 0;
  if (res.status !== 200 || !type.startsWith('image/') || bytes < MIN_IMAGE_BYTES)
    throw new SessionError(`photo not usable (HTTP ${res.status}, ${type || 'no type'}, ${bytes} bytes)`);
  return bytes;
}

/** Upload one synthetic image file (multipart field "image") → its CDN URL. */
async function upload(sessions: SessionHelper, s: UserSession, file: string): Promise<string> {
  const boundary = `----qa-m2-${randomBytes(8).toString('hex')}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${path.basename(file)}"\r\nContent-Type: image/${path.extname(file).slice(1) || 'png'}\r\n\r\n`,
    ),
    readFileSync(file),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await sessions.client.callRoute(UPLOAD_IMAGE, {
    auth: AUTH.user(s.token),
    device: s.device,
    rawBody: body,
    contentType: `multipart/form-data; boundary=${boundary}`,
    retry: false,
  });
  const url = JSON.stringify(res.json() ?? '').match(
    /https:\/\/prodimages\.aisle\.co\/[0-9a-zA-Z]+\.(?:png|jpe?g)/,
  )?.[0];
  if (res.status !== 200 || !url) throw new SessionError(`image upload refused: HTTP ${res.status}`);
  return url;
}

/**
 * The 4 photos for a profile: uploaded synthetic images (M2_ONBOARDING_UPLOAD_IMAGE=<4+ comma-separated paths>) or
 * the hosted set of the profile's gender. All distinct; every URL fetched and checked for real image bytes.
 */
export async function preparePhotos(
  sessions: SessionHelper,
  config: M2Config,
  s: UserSession,
  gender: 'Male' | 'Female',
): Promise<string[]> {
  let photos: string[];
  if (config.onboardingUploadImage) {
    const files = config.onboardingUploadImage
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    if (new Set(files).size < 4)
      throw new SessionError('M2_ONBOARDING_UPLOAD_IMAGE needs 4 different synthetic image files');
    photos = [];
    for (const f of files.slice(0, 4)) photos.push(await upload(sessions, s, f));
  } else photos = [...config.onboardingPhotos[gender]];
  if (new Set(photos).size !== photos.length) throw new SessionError('a photo repeats within the profile');
  for (const url of photos) await checkPhoto(url, config.http.timeoutMs);
  return photos;
}

/** The submit_profile body of the UI automation team's flow, with the run's synthetic values. */
export function submitProfileBody(i: OnboardingInput): Record<string, unknown> {
  return {
    data: {
      general_information: {
        date_of_birth_v1: '15/01/1996',
        diet: opt(1, 'Non-Vegetarian'),
        drinking_v2: opt(4, 'Regularly'),
        faith: opt(6, 'Hindu'),
        first_name: i.firstName,
        gender: i.gender,
        height: 60,
        languages: [
          { id: 2, is_mother_tongue: false },
          { id: 1, is_mother_tongue: true },
        ],
        marital_status_v1: opt(9, 'Single'),
        personal_email: i.email,
        ref_id: '',
        smoking_v2: opt(4, 'Regularly'),
        workout: opt(4, 'Regularly'),
      },
      hide_first_name: false,
      photos: (i.photos ?? []).map((photo, n) => ({
        faceDetectionTime: 330,
        isFaceDetected: true,
        is_replace: false,
        original_image_path: `automation_photo_${n + 1}.jpg`,
        photo,
        selected: false,
      })),
      relationship_goal: opt(2, 'Settle down', {
        is_default: true,
        show_on_profile: true,
        optional_relationship_goal_message: '',
        prefix: 'Relationship goals',
      }),
      about: '',
      reply_id: 0,
    },
  };
}

export interface Onboarded {
  session: UserSession;
  ref: string | undefined;
  profileState: string | undefined;
  steps: { label: string; status: number }[];
}

const ok = (r: ApiResponse) => r.status >= 200 && r.status < 300;

/** Run the onboarding flow for a NEW account; throws SessionError with the failing step (value-free). */
export async function onboard(
  sessions: SessionHelper,
  config: M2Config,
  s: UserSession,
  input: OnboardingInput,
): Promise<Onboarded> {
  const steps: Onboarded['steps'] = [];
  const photos = input.photos ?? (await preparePhotos(sessions, config, s, input.gender));
  const submit = await sessions.client.call('API-057', {
    auth: AUTH.user(s.token),
    device: s.device,
    body: submitProfileBody({ ...input, photos }),
    retry: false,
  });
  steps.push({ label: 'submit_profile', status: submit.status });
  if (!ok(submit)) throw new SessionError(`submit_profile refused: HTTP ${submit.status}`);
  const agree = await sessions.client.callRoute(COMMUNITY_AGREED, {
    auth: AUTH.user(s.token),
    device: s.device,
    noBody: true,
    retry: false,
  });
  steps.push({ label: 'update_community_message_agreed', status: agree.status });
  if (!ok(agree)) throw new SessionError(`community agreement refused: HTTP ${agree.status}`);
  const again = await sessions.loginWithNumber(s.mobileNumber, s.device.uniqueIdentifier);
  if (again.applicationStage !== 'completed')
    throw new SessionError(`onboarding not completed: application_stage ${again.applicationStage ?? '—'}`);
  const own = await ownState(sessions, again);
  steps.push({ label: 'fetch_own_info', status: own.status });
  if (own.status !== 200) throw new SessionError(`fetch_own_info after onboarding: HTTP ${own.status}`);
  return { session: again, ref: again.ref, profileState: own.profileState, steps };
}

/** Current profile_state of an account (fetch_own_info), value-free. */
export async function ownState(
  sessions: SessionHelper,
  s: UserSession,
): Promise<{ status: number; profileState: string | undefined; ref: string | undefined }> {
  const res = await sessions.client.call('API-013', { auth: AUTH.user(s.token), device: s.device });
  const body = res.json();
  const state = field(body, 'profile_state');
  const ref = field(body, 'ref');
  return {
    status: res.status,
    profileState: state === undefined || state === null ? undefined : String(state),
    ref: ref === undefined || ref === null ? undefined : String(ref),
  };
}

/** Profile states in which an account cannot serve tests that need an active profile. */
export const UNUSABLE_STATES = ['image_inappropriate', 'disapproved', 'disabled'];
