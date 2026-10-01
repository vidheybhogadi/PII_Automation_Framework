import type { TestCaseCatalog } from './types';

const SAVE = 'POST /api/v1/pii-test';
const READ = 'POST /api/v1/pii-test/read';

export const WRITE_CASES: TestCaseCatalog = {
  'AISLE-WR-001': {
    what: 'Saves a fake name (the NAME field) for a brand-new fake test user through the Aisle facade (Aisle’s front door to the PII service).',
    why: 'Saving personal data is the core job of the service. If new users cannot be saved, nothing else works.',
    steps: [
      'Make a new fake user ID and a fake name',
      'Send the save request with the token (the secret pass proving the caller is Aisle’s test app)',
      'Check the reply',
    ],
    expected:
      '201 Created (a new value was saved). The reply shows the same user ID, field NAME and a key version (the number of the encryption key used) of 1 or more. The name itself is not repeated in the reply.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User <letters>"}`,
    validation: [
      'Status is 201',
      'Reply data has the same user ID and field NAME',
      'Key version is 1 or more',
      'The fake name is not repeated in the reply',
    ],
    type: 'Positive',
    priority: 'Critical',
  },
  'AISLE-WR-002': {
    what: 'Runs the full life of a saved name for one fake test user: save name A, read it, replace it with name B, read again, then bulk read (one request for several users).',
    why: 'If the old value survived an update, users would see outdated or wrong personal details.',
    steps: [
      'Save fake name A for a new fake user and read it back',
      'Save fake name B for the same user',
      'Read the name again',
      'Bulk read the name for that user',
    ],
    expected:
      'The first read returns name A. The second save returns 200 OK (an existing value was replaced). The second read and the bulk read both return name B, never name A.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User A"} · ${READ} {"user_id":"<same user>","field_names":["NAME"]} · ${SAVE} {… "value":"QA Automation User B"} · ${READ} (again) · POST /api/v1/pii-test/batch/read {"user_ids":["<same user>"],"fields":["NAME"]}`,
    validation: [
      'First read returns name A',
      'Replace returns 200',
      'Second read returns name B',
      'Bulk read returns exactly one item for that user with name B',
    ],
    type: 'Positive',
    priority: 'Critical',
  },
  'AISLE-WR-003': {
    what: 'Saves a fake name, then sends two saves that use a number where text is expected: once as the value and once as the user ID.',
    why: 'A bug in the app must never overwrite or damage a user’s saved data.',
    steps: [
      'Save a fake name for a new fake user',
      'Send a save with the number 12345 as the value',
      'Send a save with the number 12345 as the user ID',
      'Read the name back',
    ],
    expected:
      'Each broken request gets 422 (refused: the request format is invalid) with a list naming the wrong part (“must be text”). Reading afterwards still returns the original fake name. (Requests that leave a part out are not tested: the facade rebuilds the body, so that result cannot be attributed to the PII service.)',
    request: `${SAVE} {"user_id":"<fake user>","field":"NAME","value":12345} · {"user_id":12345,"field":"NAME","value":"QA Automation User"}`,
    validation: [
      'Number as value → 422 naming value',
      'Number as user ID → 422 naming user_id',
      'The saved name is unchanged afterwards',
    ],
    type: 'Negative',
    priority: 'High',
  },
  'AISLE-WR-004': {
    what: 'Saves a fake name, then sends a save request whose value is empty text.',
    why: 'An empty value would wipe a user’s details without anyone meaning to.',
    steps: ['Save a fake name for a new fake user', 'Send a save with an empty value', 'Read the name back'],
    expected:
      '422 (refused: the request format is invalid) naming the value as too short (the minimum is 1 character). The original fake name is unchanged. Limit observed from the service’s own validation message (2026-09-29).',
    request: `${SAVE} {"user_id":"<fake user>","field":"NAME","value":""}`,
    validation: [
      'Status is 422 in the FastAPI “detail” list format',
      'The problem is reported at value',
      'The saved name is unchanged afterwards',
    ],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-005': {
    what: 'Saves a fake name of exactly 1,024 characters for a fake user ID of exactly 128 characters, then reads it back.',
    why: 'Real users can have long names. The service must accept everything up to the allowed maximum.',
    steps: [
      'Make a 128-character fake user ID and a 1,024-character fake name',
      'Save the name',
      'Read it back',
    ],
    expected:
      '201 Created (a new value was saved). Reading returns the full 1,024-character name unchanged. Limit observed from the service’s own validation message (2026-09-29).',
    request: `${SAVE} {"user_id":"<128-character fake user>","field":"NAME","value":"<1,024-character fake name>"} · ${READ} {"user_id":"<same user>","field_names":["NAME"]}`,
    validation: [
      'The generated user ID is exactly 128 characters and the name exactly 1,024',
      'Save status is 201',
      'Reading returns the full name unchanged',
    ],
    type: 'Positive',
    priority: 'Medium',
  },
  'AISLE-WR-006': {
    what: 'Saves a normal fake name, then sends a save with a 129-character user ID and another with a 1,025-character name for the first user.',
    why: 'Over-long data could break storage or other systems that read it.',
    steps: [
      'Save a normal fake name for a new fake user',
      'Send a save with a 129-character fake user ID',
      'Send a save with a 1,025-character name for the first user',
      'Read the first user’s name',
    ],
    expected:
      'Both saves get 422 (refused: the request format is invalid), naming the user ID and the value as too long. The first user’s name is unchanged. Limit observed from the service’s own validation message (2026-09-29).',
    request: `${SAVE} {"user_id":"<129-character fake user>","field":"NAME","value":"QA Automation User"} · ${SAVE} {"user_id":"<fake user>","field":"NAME","value":"<1,025-character fake name>"}`,
    validation: [
      '129-character user ID → 422 naming user_id',
      '1,025-character name → 422 naming value',
      'The first user’s saved name is unchanged',
    ],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-008': {
    what: 'Tries to save a fake value under a field name the service does not know (a made-up field name).',
    why: 'Only agreed personal fields may be stored. Unknown fields would be data kept outside the rules.',
    steps: ['Send a save with a made-up field name and a fake value', 'Check the reply'],
    expected:
      '403 Forbidden (refused: access denied) with the error code AUTHORIZATION_DENIED, as seen on staging (2026-09-29).',
    request: `${SAVE} {"user_id":"<fake user>","field":"QA_AUTOMATION_UNKNOWN_FIELD","value":"QA Automation User"}`,
    validation: ['Status is 403', 'Error code is AUTHORIZATION_DENIED', 'Reply data is empty'],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-009': {
    what: 'Tries to save a fake email that has no “@” in it, then checks nothing was saved.',
    why: 'Broken emails would make password resets and notifications fail without anyone noticing.',
    steps: [
      'Send a save for the EMAIL field with a fake value that has no “@”',
      'Check the reply',
      'Read EMAIL for that user',
    ],
    expected:
      'The save is refused (400 VALIDATION_ERROR was seen on 2026-10-01; 422 is also accepted) and never answered with a server error (5xx). Reading EMAIL returns 404 (not found): nothing was saved.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"EMAIL","value":"<fake name>.at.example.test"} · ${READ} {"user_id":"<same user>","field_names":["EMAIL"]}`,
    validation: ['Save status is 400 or 422', 'Reading EMAIL afterwards returns 404 PII_NOT_FOUND'],
    type: 'Negative',
    priority: 'High',
    preconditions:
      'Needs EMAIL access for the Aisle caller (granted on 2026-10-01). If it is refused with 403 (access denied), the test is marked Blocked and the report shows that real reply.',
  },
  'AISLE-WR-010': {
    what: 'Saves a messy fake email (capitals and spaces around it) for a new fake test user, then reads the EMAIL field back.',
    why: 'Aisle compares and shows emails. If they are not cleaned up the same way every time, logins and look-ups can fail.',
    steps: [
      'Save a messy fake email for a new fake user',
      'Send a read request for that user asking for EMAIL',
      'Compare the returned value with the expected clean form',
    ],
    expected:
      '200 OK. Exactly one item for that user and field EMAIL. The value is the fake email in lower case with the outer spaces removed. Seen on staging on 2026-10-01.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"EMAIL","value":"  QA.Auto.<run>@EXAMPLE.TEST  "} · ${READ} {"user_id":"<same user>","field_names":["EMAIL"]}`,
    validation: [
      'Save and read are not refused (today they are: 403, so the test is blocked)',
      'Read status is 200 and count 1',
      'The item has the same user ID and field EMAIL',
      'The value is the fake email in lower case with outer spaces removed',
    ],
    type: 'Positive',
    priority: 'High',
    preconditions:
      'Needs EMAIL access for the Aisle caller (granted on 2026-10-01). If it is refused with 403 (access denied), the test is marked Blocked and the report shows that real reply.',
  },
  'AISLE-WR-011': {
    what: 'Tries to save a value made only of spaces (and once of spaces, a tab and a line break) for a fake user’s NAME, and only spaces for a fake user’s EMAIL.',
    why: 'A blank value is not real data. Saving it would replace a real name or email with nothing.',
    steps: [
      'Send a save of “   ” as NAME for a new fake user',
      'Send a save of spaces, a tab and a line break as NAME',
      'Send a save of “   ” as EMAIL',
      'Read each fake user to check nothing was saved',
    ],
    expected:
      'Each save gets 422 Unprocessable Entity (refused: the request format is invalid) naming the value as too short. Reading the users afterwards gets 404 Not Found (nothing was saved). Seen on staging on 2026-10-01.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"   "} · {… "value":" \\t\\n "} · {… "field":"EMAIL","value":"   "}`,
    validation: [
      'Every save is 422, naming body.value',
      'No reply is a server error (5xx)',
      'Every user still has nothing saved (404)',
    ],
    type: 'Negative',
    priority: 'High',
  },
  'AISLE-WR-012': {
    what: 'Saves a fake name for a fake user, then reads it with spaces around the user ID, with the user ID in capitals, and with one extra letter. Also saves a name with spaces around a new user ID.',
    why: 'The user ID decides whose data is returned. If similar-looking IDs matched the same person, one user could see another user’s data. Note: it is not confirmed whether the PII service or the facade trims the user ID (question BQ-34).',
    steps: [
      'Save a fake name for a new fake user',
      'Read it with spaces around the user ID',
      'Read with the user ID in capitals, and with one extra letter',
      'Save a name with spaces around another new user ID and read it with the plain ID',
    ],
    expected:
      'Spaces around the ID are ignored: the read returns the name (200 OK) and the reply shows the ID without spaces; a save with spaces is stored under the trimmed ID. The ID in capitals and the ID with an extra letter are different, empty users: 404 Not Found. Seen on 2026-10-01; Dev still to confirm this rule (question BQ-34).',
    request: `${READ} {"user_id":" <fake user> ","field_names":["NAME"]} · {"user_id":"<FAKE USER>"} · {"user_id":"<fake user>x"} · ${SAVE} {"user_id":" <new fake user> ",…}`,
    validation: [
      'Read with spaces: 200, trimmed user ID, the same name',
      'Capitals and extra letter: 404 PII_NOT_FOUND',
      'Save with spaces: 201 under the trimmed user ID',
    ],
    type: 'Security',
    priority: 'High',
  },
  'AISLE-WR-013': {
    what: 'Saves fake names that look like attacks (a <script> tag, a database query trick) and fake user IDs that contain SQL, script, database-query and folder-path tricks, then reads each one back.',
    why: 'If such text were run as code instead of stored as text, an attacker could steal or destroy data (an “injection” attack).',
    steps: [
      'Save each attack-looking name for a new fake user and read it back',
      'Save a fake name under each attack-looking user ID and read it back',
      'Compare what was read with what was sent',
    ],
    expected:
      'Every save is 201 Created and every read returns exactly what was sent; the user IDs are stored exactly as sent. Seen on 2026-10-01. Names containing SQL-like or folder-path-like text cannot be tested: the edge firewall (a filter in front of the facade) refuses them with 403 before they reach the PII service (question BQ-35).',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"QA <script>alert(1)</script>"} · {"user_id":"<fake user>' OR '1'='1",…}`,
    validation: [
      'Each save is 201',
      'Each read returns the exact text that was sent',
      'The reply shows the attack-looking user ID unchanged',
    ],
    type: 'Security',
    priority: 'Critical',
  },
  'AISLE-WR-014': {
    what: 'Saves five fake names written with accents (Ünïcödé), Chinese characters, emoji, Arabic (written right to left) and Nordic letters, and reads each back.',
    why: 'Real people’s names use every alphabet. A service that damages such characters stores wrong personal data.',
    steps: ['Save each fake name for a new fake user', 'Read each one back', 'Compare with what was sent'],
    expected:
      'Every save is 201 Created and every read returns exactly the same characters. Seen on 2026-10-01.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"QA 测试用户"} (and the other four)`,
    validation: ['Each save is 201', 'Each read returns the identical name'],
    type: 'Positive',
    priority: 'High',
  },
  'AISLE-WR-015': {
    what: 'Saves a fake name of exactly 1,024 Chinese characters, and one of exactly 1,024 emoji, and reads both back.',
    why: 'These characters take 3–4 bytes each. If the limit counted bytes instead of characters, real long names in such alphabets would be refused.',
    steps: ['Save 1,024 Chinese characters as a NAME', 'Save 1,024 emoji as a NAME', 'Read both back'],
    expected:
      'Both saves are 201 Created and the reads return the full text: the 1,024 limit counts characters, not bytes. Seen on 2026-10-01.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"测测…(1,024)"}`,
    validation: ['Both saves are 201', 'Both reads return the full 1,024 characters'],
    type: 'Positive',
    priority: 'Medium',
  },
  'AISLE-WR-016': {
    what: 'Tries to save a fake name of 1,025 Chinese characters, and one of 1,025 emoji (one over the limit).',
    why: 'The 1,024-character limit must hold for every alphabet, so oversized data cannot slip in.',
    steps: ['Send each 1,025-character name for a new fake user', 'Check the replies', 'Read the users'],
    expected:
      '422 Unprocessable Entity (refused: the request format is invalid) naming the value as too long, and nothing saved (404 on read). Seen on 2026-10-01.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"测测…(1,025)"}`,
    validation: ['Both saves are 422 naming body.value', 'No server error (5xx)', 'Nothing saved (404)'],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-017': {
    what: 'Sends three saves for a fake user where the value, the user ID or the field name is null (empty) instead of text.',
    why: 'A null must never be stored as a value or attached to an unknown user.',
    steps: [
      'Send a save with value null',
      'Send a save with user ID null',
      'Send a save with field null',
      'Read the fake user',
    ],
    expected:
      'Each save gets 422 Unprocessable Entity (refused: the request format is invalid) naming the null part (“must be text”). Nothing is saved (404 on read). Seen on 2026-10-01.',
    request: `${SAVE} {"user_id":"<fake user>","field":"NAME","value":null} · {"user_id":null,…} · {"field":null,…}`,
    validation: [
      'Each is 422 naming value, user_id or field',
      'No server error (5xx)',
      'Nothing saved (404)',
    ],
    type: 'Negative',
    priority: 'Medium',
  },
  'AISLE-WR-018': {
    what: 'Saves a fake name using the field name “name” in small letters, reads it with “name”, bulk reads it with “name”, and saves a fake email using “Email”.',
    why: 'Callers may not write field names in capitals. The data must still land in the right field and be found again. Note: it is not confirmed whether the PII service or the facade turns the field name into capitals (question BQ-44).',
    steps: [
      'Save a fake name with field “name”',
      'Read and bulk read with field “name”',
      'Save a fake email with field “Email” for another fake user',
    ],
    expected:
      'The saves are 201 Created and the replies show the field as NAME and EMAIL. The read and bulk read with “name” return the saved name. Seen on 2026-10-01.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"name","value":"QA Automation User <letters>"} · ${READ} {"user_id":"<same user>","field_names":["name"]}`,
    validation: [
      'Saves are 201 with field NAME / EMAIL in the reply',
      'Read and bulk read with “name” return the fake name',
    ],
    type: 'Positive',
    priority: 'Medium',
    endpoint: 'crossEndpoint',
  },
  'AISLE-WR-020': {
    what: 'Saves a fake name, saves exactly the same name again, then replaces it with a different fake name, checking the key version (the number of the encryption key used) each time.',
    why: 'Repeating a save (for example after a network retry) must be harmless, and the key version must be predictable.',
    steps: [
      'Save a fake name (first save)',
      'Save the same name again',
      'Save a different name',
      'Check each reply',
    ],
    expected:
      'First save 201 Created; the same value again is 200 OK; the replace is 200 OK. The key version is 1 every time. Seen on 2026-10-01; what the key version means is still open (question BQ-29).',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME","value":"QA Automation User A"} (twice) · {… "value":"QA Automation User B"}`,
    validation: [
      'First save key version 1',
      'Repeat save 200 with key version 1',
      'Replace 200 with key version 1',
    ],
    type: 'Positive',
    priority: 'Medium',
  },
  'AISLE-WR-021': {
    what: 'Sends five saves with five different fake names for the same fake user at the same moment, then reads the name.',
    why: 'Two apps may update the same person at once. The data must end up in one clean state, never mixed or duplicated.',
    steps: ['Send five saves for one fake user at the same time', 'Check every reply', 'Read the name'],
    expected:
      'Every save succeeds (201 Created or 200 OK). The read returns exactly one name, and it is one of the five sent. Seen on 2026-10-01 (one 201 and four 200).',
    request: `${SAVE} ×5 in parallel {"user_id":"<same fake user>","field":"NAME","value":"QA Automation User <A…E>"}`,
    validation: [
      'All five saves are 201 or 200',
      'Exactly one stored name',
      'It is one of the five names sent',
    ],
    type: 'Positive',
    priority: 'Medium',
  },
  'AISLE-WR-022': {
    what: 'Saves a fake email for a new fake user, replaces it with a second fake email, then reads the email.',
    why: 'If an old email survived an update, messages could go to an address the person no longer uses.',
    steps: ['Save fake email A', 'Save fake email B for the same user', 'Read the email'],
    expected:
      'The first save is 201 Created, the replace is 200 OK. The read returns email B. Seen on 2026-10-01.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"EMAIL","value":"<fake email A>@example.test"} · {… "value":"<fake email B>"} · ${READ} {"field_names":["EMAIL"]}`,
    validation: ['First save 201', 'Replace 200', 'Read returns email B'],
    type: 'Positive',
    priority: 'High',
  },
  'AISLE-WR-023': {
    what: 'Saves two valid but unusual fake emails: one with a “+tag” in the name part and one on a sub-domain (mail.example.test).',
    why: 'Many real people use such addresses. Refusing or changing them would lose real contact data.',
    steps: [
      'Save the “+tag” email for a new fake user',
      'Save the sub-domain email for another',
      'Read both back',
    ],
    expected: 'Both saves are 201 Created and both reads return the email unchanged. Seen on 2026-10-01.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"EMAIL","value":"<name>+tag@example.test"} · {… "value":"<name>.sub@mail.example.test"}`,
    validation: ['Both saves are 201', 'Both reads return the exact email'],
    type: 'Positive',
    priority: 'Medium',
  },
  'AISLE-WR-024': {
    what: 'Tries to save five badly formed fake emails: two “@” signs, nothing after “@”, nothing before “@”, a space inside, and a dot at the end.',
    why: 'Storing broken emails means messages can never reach the person, and searches stop matching.',
    steps: [
      'Send each badly formed email as a save for a new fake user',
      'Check each reply',
      'Read each user',
    ],
    expected:
      'Each save is refused with 400 VALIDATION_ERROR (like an email without “@”) and nothing is saved. Blocked: on 2026-10-01 all five were saved (201); the email rules must be defined by Dev first (question BQ-37).',
    request: `${SAVE} {"user_id":"<new fake user>","field":"EMAIL","value":"<name>@x@example.test"} (and the other four)`,
    validation: ['Each save is 400 VALIDATION_ERROR', 'Nothing saved (404)'],
    type: 'Negative',
    priority: 'Medium',
    preconditions: 'Blocked until Dev defines which email formats are invalid (question BQ-37).',
  },
  'AISLE-WR-025': {
    what: 'Saves fake emails of exactly 254, 255 and 1,024 characters (the domain part is padded with letters).',
    why: 'Internet standards cap emails at 254 characters. QA records which limit the service really uses.',
    steps: [
      'Build fake emails of 254, 255 and 1,024 characters',
      'Save each for a new fake user',
      'Check the replies',
    ],
    expected:
      'All three are 201 Created: EMAIL uses the general 1,024-character limit, not 254. Seen on 2026-10-01; Dev still to confirm (question BQ-37).',
    request: `${SAVE} {"user_id":"<new fake user>","field":"EMAIL","value":"<name>@ddd…d.example.test"} (254 / 255 / 1,024 characters)`,
    validation: ['All three saves are 201'],
    type: 'Positive',
    priority: 'Low',
  },
  'AISLE-WR-026': {
    what: 'Tries to save a fake email of 1,025 characters (one over the general limit).',
    why: 'The size limit protects storage; an over-long email must not get in.',
    steps: ['Build a 1,025-character fake email', 'Save it for a new fake user', 'Read the user'],
    expected:
      '422 Unprocessable Entity (refused: the request format is invalid) naming the value as too long; nothing saved (404). Seen on 2026-10-01.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"EMAIL","value":"<1,025-character fake email>"}`,
    validation: ['Status is 422 naming body.value', 'No server error (5xx)', 'Nothing saved (404)'],
    type: 'Negative',
    priority: 'Low',
  },
  'AISLE-WR-027': {
    what: 'Saves a fake name for a new fake user, then saves that user’s first fake email.',
    why: 'Adding a second kind of data must create it (not count as a replace) and must not touch the existing name.',
    steps: ['Save a fake name', 'Save a fake email for the same user', 'Read the name'],
    expected: 'The email save is 201 Created (a new value), and the name is unchanged. Seen on 2026-10-01.',
    request: `${SAVE} {"user_id":"<new fake user>","field":"NAME",…} · {"user_id":"<same user>","field":"EMAIL","value":"<fake email>"}`,
    validation: ['Email save is 201', 'The name is still the same'],
    type: 'Positive',
    priority: 'High',
  },
  'AISLE-WR-028': {
    what: 'For one fake user with a name and an email, saves a phone, replaces it, reads all three fields and bulk reads the phone.',
    why: 'Phones must behave like the other personal fields when a user has several of them.',
    steps: [
      'Save a fake name and email',
      'Save and replace an approved test phone',
      'Read all three fields',
      'Bulk read the phone',
    ],
    expected:
      'Blocked: needs approved test phone numbers (nobody’s real number) from the team (question BQ-03). No phone number is sent until then.',
    request: `${SAVE} {"user_id":"<fake user>","field":"PHONE","value":"<approved test phone>"} · ${READ} {"field_names":["NAME","EMAIL","PHONE"]}`,
    validation: ['Blocked until approved test phones exist'],
    type: 'Positive',
    priority: 'Medium',
    preconditions: 'Blocked until approved test phone numbers are provided (question BQ-03).',
    endpoint: 'crossEndpoint',
  },
  'AISLE-WR-029': {
    what: 'Sends ten saves for ten different fake users at the same moment, then bulk reads all ten names.',
    why: 'Many users are saved at once in real use. Parallel saves must not fail or mix up whose data is whose.',
    steps: [
      'Make ten fake users and names',
      'Send all ten saves at the same time',
      'Bulk read the ten names',
    ],
    expected:
      'All ten saves are 201 Created, and the bulk read returns each user’s own name (count 10). Seen on 2026-10-01.',
    request: `${SAVE} ×10 in parallel {"user_id":"<fake user N>","field":"NAME","value":"QA Automation User <N>"}`,
    validation: ['All ten saves are 201', 'Bulk read count is 10', 'Each user has their own name'],
    type: 'Positive',
    priority: 'Medium',
  },
};
