# Free-text APIs (Dev list, 2026-10-23)

Supplement to [aisle-pii-affected-apis.md](aisle-pii-affected-apis.md). Dev shared these free-text (encrypted long
text) APIs on 2026-10-23; more free-text flows will follow ("some work is going on for those flows"). Dev's
`{{base_url}}` placeholder is replaced with the Aisle test base URL `https://testa2.aisle.co` throughout. Request
bodies are Dev's examples, verbatim; the IDs and text are Dev's placeholders, not real data.

Parsed by `m2/scripts/m2-inventory.ts`. "Maps to" links an entry to the same method/path in the main inventory; the
row adds the free-text field to it. Rows without a mapping are new inventory entries.

| ID      | Method | URL                                                                           | Free-text keys         | Maps to | Notes                                          |
| ------- | ------ | ----------------------------------------------------------------------------- | ---------------------- | ------- | ---------------------------------------------- |
| API-210 | GET    | `https://testa2.aisle.co/V1/api/v1/pii-test/health/ready`                     | —                      | —       | PII facade readiness (Milestone 1 route)       |
| API-211 | POST   | `https://testa2.aisle.co/V1/api/v1/pii-test/free-text/keys`                   | —                      | —       | Create a free-text key (Milestone 1 route)     |
| API-212 | POST   | `https://testa2.aisle.co/V1/api/v1/pii-test/free-text/keys/read`              | —                      | —       | Read a free-text key by key_id (Milestone 1)   |
| FT-187  | POST   | `https://testa2.aisle.co/V1/messages/send`                                    | text, previous_message | API-187 | Chat message text and quoted previous message  |
| FT-063  | GET    | `https://testa2.aisle.co/V1/list_connected_profiles?page=1&items_per_page=20` | — (returns)            | API-063 | Connection list (returns chat free text)       |
| FT-069  | POST   | `https://testa2.aisle.co/V1/chat/chat_messages`                               | — (returns)            | API-069 | Conversation messages (returns chat free text) |
| FT-121  | POST   | `https://testa2.aisle.co/web/users/about`                                     | about                  | API-121 | Profile bio ("about")                          |
| FT-119  | GET    | `https://testa2.aisle.co/web/users/profile_info`                              | — (returns)            | API-119 | Profile info (returns the bio)                 |

## Dev's example requests (verbatim, base URL filled in)

```text
POST https://testa2.aisle.co/V1/api/v1/pii-test/free-text/keys/read
{ "key_id": "8ad3c7aa-9452-42c8-a293-1667fff2f6d7" }

POST https://testa2.aisle.co/V1/messages/send
{
  "ref": "FTRECEIVER",
  "text": "FT_CHAT_TEST_001 hello from free text pii encryption",
  "previous_message": "FT_PREVIOUS_TEST_001 quoted free text message",
  "message_time_token": "pm-msg-001",
  "action_time_token": "pm-action-001"
}

GET https://testa2.aisle.co/V1/list_connected_profiles?page=1&items_per_page=20

POST https://testa2.aisle.co/V1/chat/chat_messages
{ "conversation_id": "1", "created_at": "2099-01-01T00:00:00Z", "page": 1 }

POST https://testa2.aisle.co/web/users/about
{ "about": "this is my bio ency" }

GET https://testa2.aisle.co/web/users/profile_info
```

## Staging observations (QA, 2026-10-23, no credentials)

| Request                         | Status | Body                     |
| ------------------------------- | ------ | ------------------------ |
| POST /V1/messages/send          | 401    | `{unauthorized_request}` |
| GET /V1/list_connected_profiles | 401    | `{unauthorized_request}` |
| POST /V1/chat/chat_messages     | 401    | `{unauthorized_request}` |
| POST /web/users/about           | 401    | empty (text/html)        |
| GET /web/users/profile_info     | 401    | empty (text/html)        |
