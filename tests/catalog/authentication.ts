import type { TestCaseCatalog } from './types';

export const AUTHENTICATION_CASES: TestCaseCatalog = {
  'PII-AUTH-001': {
    what: 'Sends a normal, correctly signed save request for a fake user’s name (the signature is a cryptographic stamp proving who sent the request and that it was not changed).',
    why: 'This is the baseline for every signing test: if a valid request fails, the rejections in the other tests prove nothing.',
    steps: [
      'Build a save request for a fake user’s name',
      'Sign it with the registered caller’s key',
      'Send it',
      'Check the response',
    ],
    expected: '201 Created; the response body matches the documented save-response format.',
    type: 'Positive',
    priority: 'High',
  },
  'PII-AUTH-002': {
    what: 'Sends a save request with the signature header removed (the signature is the cryptographic stamp proving who sent the request).',
    why: 'Without a signature anyone could pretend to be a registered app; the service must refuse unsigned requests and store nothing.',
    steps: [
      'Build a normal save request for a fake user',
      'Remove the signature header',
      'Send it',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Critical',
  },
  'PII-AUTH-003': {
    what: 'Sends a save request whose signature header is present but empty.',
    why: 'If an empty signature were treated as valid, an attacker could skip signing entirely and still be let in.',
    steps: [
      'Build a normal save request for a fake user',
      'Set the signature header to an empty value',
      'Send it',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Critical',
  },
  'PII-AUTH-004': {
    what: 'Sends a save request whose signature is garbage text that is not valid Base64 (the text encoding signatures must use).',
    why: 'Badly formed signatures must be rejected cleanly; if the service accepted or crashed on them, an attacker could bypass or break the check.',
    steps: [
      'Build a normal save request for a fake user',
      'Set the signature header to "not base64 !!!"',
      'Send it',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Critical',
  },
  'PII-AUTH-005': {
    what: 'Sends a save request with a signature that is too short (32 bytes instead of the 64 bytes a real Ed25519 signature has).',
    why: 'If the service did not check the length, a truncated or fake signature might slip through and let an attacker in.',
    steps: [
      'Build a normal save request for a fake user',
      'Replace the signature with a 32-byte value',
      'Send it',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Critical',
  },
  'PII-AUTH-006': {
    what: 'Sends a save request with a made-up signature of the correct length (64 bytes) that was not produced by any key.',
    why: 'Proves the service really verifies the signature and does not just check that it looks right; otherwise anyone could forge one.',
    steps: [
      'Build a normal save request for a fake user',
      'Replace the signature with 64 random bytes',
      'Send it',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Critical',
  },
  'PII-AUTH-007': {
    what: 'Sends a save request signed with a private key the service has never seen, while using the real caller ID (the registered name of the app making the call).',
    why: 'If a signature from an unknown key were accepted, an attacker could impersonate a registered app just by knowing its name.',
    steps: [
      'Build a normal save request for a fake user',
      'Sign it with a freshly generated, unregistered key',
      'Send it with the normal caller ID',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Critical',
  },
  'PII-AUTH-008': {
    what: 'Signs one version of the request body, then sends a different body (the user ID was changed) with that same signature.',
    why: 'If the service did not detect the change, an attacker who intercepted a request could alter whose data is written.',
    steps: [
      'Build a save request and sign a copy with a different user ID',
      'Send the real body with that signature',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Critical',
  },
  'PII-AUTH-009': {
    what: 'Signs the compact request body, then sends the same data re-formatted with extra spaces and line breaks.',
    why: 'The signature must cover the exact bytes sent; if re-formatted bodies were accepted, the check would not truly prove the body is unchanged.',
    steps: [
      'Build a save request and sign the compact body',
      'Re-format the body with indentation (same data)',
      'Send the re-formatted body with the original signature',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Critical',
  },
  'PII-AUTH-010': {
    what: 'Signs the request body, then adds a single newline character to the end of the body before sending.',
    why: 'Even a one-byte change must break the signature; otherwise the service is not checking the exact bytes and tampering could go unnoticed.',
    steps: [
      'Build a save request and sign the body',
      'Append a newline to the body',
      'Send it with the original signature',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Critical',
  },
  'PII-AUTH-011': {
    what: 'Signs the raw request body directly instead of first taking its SHA-256 hash (a fixed-size fingerprint of the body), which is the wrong signing method.',
    why: 'The service must accept only the documented signing method; accepting other methods weakens the check and hides client bugs.',
    steps: [
      'Build a normal save request for a fake user',
      'Sign the raw body without hashing it first',
      'Send it',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Critical',
  },
  'PII-AUTH-012': {
    what: 'Sends a correctly signed save request with the caller ID header (the registered name of the app making the call) removed.',
    why: 'Without a caller ID the service cannot know whose key to check; if it let the request through, identity checks would be bypassed.',
    steps: [
      'Build a normal save request for a fake user',
      'Remove the caller ID header',
      'Send it',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'High',
  },
  'PII-AUTH-013': {
    what: 'Sends a save request with a caller ID that is not registered with the service.',
    why: 'If unknown callers were accepted, any app could invent a name and gain access to personal data.',
    steps: [
      'Build a normal save request for a fake user',
      'Set the caller ID header to an unregistered name',
      'Send it',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Critical',
  },
  'PII-AUTH-014': {
    what: 'Sends a save request whose caller ID header is present but empty.',
    why: 'An empty caller ID must not be treated as a valid or default identity; otherwise an attacker could skip identifying themselves.',
    steps: [
      'Build a normal save request for a fake user',
      'Set the caller ID header to an empty value',
      'Send it',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'High',
  },
  'PII-AUTH-015': {
    what: 'Sends a save request with the request ID header (a unique ID for each call, used for tracing) removed.',
    why: 'The documentation makes the request ID mandatory; if it were optional, calls could not be traced and future replay protection would not work.',
    steps: [
      'Build a normal save request for a fake user',
      'Remove the request ID header',
      'Send it',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'High',
  },
  'PII-AUTH-016': {
    what: 'Sends a save request with none of the security headers at all (no caller ID, no signature, no request ID).',
    why: 'A completely anonymous request must never be able to write personal data.',
    steps: [
      'Build a normal save request for a fake user',
      'Send it without any security headers',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'High',
  },
  'PII-AUTH-017': {
    what: 'Signs a save request with a second registered app’s key while sending the first app’s caller ID.',
    why: 'If one app’s key worked for another app’s name, any registered app could impersonate any other and use its permissions.',
    steps: [
      'Build a normal save request for a fake user',
      'Sign it with the secondary caller’s key',
      'Send it with the primary caller ID',
      'Try to read the value back',
    ],
    expected:
      '401 Unauthorized with a documented authentication error code; the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Critical',
    preconditions: 'Needs a second registered caller (secondary) — skipped until configured',
  },
  'PII-AUTH-018': {
    what: 'Sends a correctly signed save request without the Content-Type header (the header saying the body is JSON).',
    why: 'The documentation lists Content-Type as required; requests without it must not be processed or save anything.',
    steps: [
      'Build a normal save request for a fake user',
      'Remove the Content-Type header',
      'Send it',
      'Try to read the value back',
    ],
    expected:
      'Rejected with 400, 401, 415 or 422 (exact status still to be confirmed, question Q-13); the read-back confirms nothing was saved.',
    type: 'Security',
    priority: 'Medium',
  },
  'PII-AUTH-019': {
    what: 'Uses a restricted app that is not allowed to save emails: first sends an email save with a bad signature, then the same request correctly signed.',
    why: 'Identity must be checked before permissions; if a forged request got a 403 it would leak what the real app is allowed to do.',
    steps: [
      'Build an email save request as the restricted caller',
      'Sign it with an unregistered key and send it',
      'Send the same request correctly signed',
      'Compare the two responses',
    ],
    expected:
      'Bad signature: 401 Unauthorized with an authentication error code; correct signature: 403 Forbidden with the authorization-denied error code.',
    type: 'Security',
    priority: 'Critical',
    preconditions: 'Needs a restricted caller (limited) — skipped until configured',
  },
  'PII-AUTH-020': {
    endpoint: 'crossEndpoint',
    what: 'Sends an unsigned request (no security headers) to every other /api/v1 endpoint: read, batch read, search, temporary phone create/resolve/promote, and free-text key create/read/revoke.',
    why: 'One unprotected endpoint would be enough for an attacker to read or change personal data without being a registered app.',
    steps: [
      'Prepare a simple body for each endpoint',
      'Send each one without any security headers',
      'Check each response',
    ],
    expected: 'Every endpoint returns 401 Unauthorized with a documented authentication error code.',
    type: 'Security',
    priority: 'Critical',
  },
  'PII-AUTH-021': {
    what: 'Will send two requests with the same request ID (the unique ID that should be new for every call) and check how the service reacts.',
    why: 'If reused IDs are silently accepted, request tracing is unreliable and captured requests could be resent.',
    steps: [
      'Send a correctly signed request',
      'Send another request reusing the same request ID',
      'Check whether the second one is accepted or rejected',
    ],
    expected:
      'Not yet defined: the second request is either accepted or rejected with 401, depending on Dev’s answer.',
    type: 'Security',
    priority: 'Critical',
    preconditions:
      'Waiting on Dev question Q-14 (what the service does when a request ID is reused) — shows as Not Tested until answered',
  },
  'PII-AUTH-022': {
    what: 'Will capture a correctly signed request and send the exact same request again (a replay).',
    why: 'The signature covers only the body (no timestamp or one-time value), so an attacker who captures a request could resend it to repeat the action.',
    steps: [
      'Send a correctly signed request',
      'Send the identical signed request a second time',
      'Check the status of the second request',
    ],
    expected:
      'Not yet defined: the agreed status for the replayed request, once Dev answers Q-21 (the tech doc says replays are rejected with 401 only after its Phase 2 replay protection is switched on).',
    type: 'Security',
    priority: 'Critical',
    preconditions:
      'Waiting on Dev question Q-21 (whether replayed requests are blocked) — shows as Not Tested until answered',
  },
};
