/**
 * HTTP client for the vernac backend + CMS (https://testapp.koode.co). The app is chosen by the `app-name` header.
 *
 * Seen on staging 2026-11-11: the backend reads the header as HTTP_APP_NAME, which the proxy only passes when it is
 * spelled with a dash (`app-name`); `app_name` gives 500 on login. Device headers are sent dash-style too, and NO
 * unique-identifier header — without it the login does not touch the team member’s device / push-token records
 * (DeviceInfo::UserDetail.set_data returns early, user_detail.rb:14).
 *
 * Credentials travel only as `Secret`s (shown in reports as their placeholder). The recorder is optional: logins
 * go through a client WITHOUT a recorder (the reply carries a fresh token).
 */
import type { ApiResponse } from '../../../core/http/api-response';
import { BaseApiClient, type HttpMethod } from '../../../core/http/base-api-client';
import type { ExchangeRecorder } from '../../../core/utils/exchange-recorder';
import type { Logger } from '../../../core/utils/logger';
import type { Secret } from '../../../core/utils/secret';
import { assertVnApp, assertVnHost, type VnApp } from './guard';

export interface VnRoute {
  key: string;
  method: HttpMethod;
  path: string;
  cms?: boolean;
}

export interface VnCall {
  app: VnApp;
  /** Bearer credential (user JWT or CMS admin JWT); none = no Authorization header. */
  auth?: Secret | undefined;
  query?: Record<string, string>;
  body?: unknown;
  pathParams?: Record<string, string>;
}

export class VnClient {
  private readonly http: BaseApiClient;

  constructor(baseUrl: string, logger: Logger, recorder?: ExchangeRecorder) {
    assertVnHost(baseUrl);
    this.http = new BaseApiClient({
      baseUrl,
      timeoutMs: 45_000,
      retryPolicy: { maxRetries: 1, baseDelayMs: 500 },
      logger,
      ...(recorder ? { recorder } : {}),
    });
  }

  call(route: VnRoute, o: VnCall): Promise<ApiResponse> {
    assertVnApp(o.app);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'app-name': o.app,
      'device-type': 'android',
      'app-version': '1.0.0',
    };
    if (route.cms) headers.webcms = 'true';
    const payload = o.body !== undefined ? o.body : route.method === 'GET' ? undefined : {};
    return this.http.request(
      {
        key: route.key,
        method: route.method,
        path: route.path,
        authenticated: false,
        retrySafe: route.method === 'GET',
      },
      payload,
      {
        headers,
        ...(o.query ? { query: o.query } : {}),
        ...(o.pathParams ? { pathParams: o.pathParams } : {}),
        ...(o.auth ? { credential: o.auth } : { tamper: { authorization: null } }),
        ...(route.method === 'GET' ? {} : { retry: false }),
      },
    );
  }
}

/** Routes used by the vernac cases (config/routes.rb @ f89046944). */
export const VN = {
  login: { key: 'FN-VRN-021', method: 'POST', path: '/v1/session/verify_number_login' },
  fetchLoginResponse: { key: 'FN-VRN-019', method: 'POST', path: '/v1/session/fetch_login_response' },
  updateProfile: { key: 'FN-VRN-045', method: 'POST', path: '/v1/session/update_profile' },
  appLaunch: { key: 'FN-VRN-022', method: 'GET', path: '/v1/user/app_launch' },
  ownProfile: { key: 'FN-VRN-025', method: 'GET', path: '/v1/user/fetch_own_profile' },
  ownInfo: { key: 'FN-VRN-024', method: 'GET', path: '/v1/user/fetch_own_info' },
  profile: { key: 'FN-VRN-002', method: 'GET', path: '/v1/user/fetch_profile' },
  editProfile: { key: 'FN-VRN-023', method: 'POST', path: '/v1/user/edit_profile' },
  updateInterests: { key: 'FN-VRN-027', method: 'POST', path: '/v1/user/update_interests' },
  story: { key: 'FN-VRN-049', method: 'POST', path: '/v1/user/story' },
  toggleHide: { key: 'FN-VRN-043', method: 'POST', path: '/v1/user/toggle_hide_name' },
  passed: { key: 'FN-VRN-005', method: 'GET', path: '/v1/list_all_passed' },
  requestSent: { key: 'FN-VRN-007', method: 'GET', path: '/v1/list_request_sent' },
  allRequests: { key: 'FN-VRN-003', method: 'GET', path: '/v1/invites/list_all_requests' },
  combined: { key: 'FN-VRN-014', method: 'GET', path: '/v1/combined_messages_list' },
  active: { key: 'FN-VRN-013', method: 'GET', path: '/v1/active_conversation_list' },
  linked: { key: 'FN-VRN-016', method: 'GET', path: '/v1/linked_conversation_list' },
  chatMessages: { key: 'FN-VRN-018', method: 'POST', path: '/v1/chat/chat_messages' },
  // ---- Setup writes between team users only (QA lead 2026-11-12; cannot be undone, see src/vn/setup.ts) ----
  like: { key: 'FN-VRN-039', method: 'POST', path: '/v1/like' },
  sendMessage: { key: 'VN-SETUP-SEND-MESSAGE', method: 'POST', path: '/v1/chat/send_message' },
  // ---- CMS (webcms: true) ----
  cmsUser: { key: 'FN-VCM-025', method: 'GET', path: '/admin/users/{ref}', cms: true },
  cmsCompleteInfo: { key: 'FN-VCM-008', method: 'GET', path: '/admin/member/fetch_complete_info', cms: true },
  cmsSearch: { key: 'FN-VCM-045', method: 'GET', path: '/admin/member/search', cms: true },
  cmsSearchProfiles: { key: 'FN-VCM-046', method: 'GET', path: '/admin/members/search_profiles', cms: true },
  cmsActivity: { key: 'FN-VCM-031', method: 'GET', path: '/admin/member/user_activity_v1', cms: true },
  cmsConnected: {
    key: 'FN-VCM-009',
    method: 'GET',
    path: '/admin/member/fetch_connected_profiles',
    cms: true,
  },
  cmsMessages: { key: 'FN-VCM-005', method: 'GET', path: '/admin/connections/fetch_messages', cms: true },
  cmsDownload: {
    key: 'FN-VCM-014',
    method: 'GET',
    path: '/admin/members/download_profile_details',
    cms: true,
  },
  cmsUpdateProfile: { key: 'FN-VCM-043', method: 'POST', path: '/admin/update_profile', cms: true },
  cmsApproveAndEdit: { key: 'FN-VCM-036', method: 'POST', path: '/admin/approve_and_edit', cms: true },
  cmsMarkSelfie: {
    key: 'FN-VCM-SELFIE',
    method: 'POST',
    path: '/admin/images/mark_selfie_verified',
    cms: true,
  },
  redisGet: { key: 'FN-VCM-051', method: 'GET', path: '/admin/redis-keys', cms: true },
  redisDelete: { key: 'FN-VCM-050', method: 'DELETE', path: '/admin/redis-keys', cms: true },
} satisfies Record<string, VnRoute>;
