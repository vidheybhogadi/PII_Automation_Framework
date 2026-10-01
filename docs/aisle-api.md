# PII Test API Curl Collection

Use these commands to test the Aisle PII facade endpoints. Aisle receives the request, sets `tenant_id` internally, adds the PII service authentication headers, and forwards the request to the PII service.

> QA notes: this is the Aisle-provided curl collection, kept for manual checks. The token is **not** stored here —
> it lives only in `.env` / CI secrets. Use synthetic data only (no real names, emails or phone numbers). Observed
> staging behaviour per endpoint is in [endpoint-inventory.md](endpoint-inventory.md); open questions are in
> [backend-open-questions.md](backend-open-questions.md).

## Setup

Set the staging base URL, load the test token from your local `.env` (never paste it into docs, tickets or chat),
and choose synthetic user IDs.

```bash
export AISLE_BASE_URL="https://testa2.aisle.co/V1"
export AISLE_TEST_TOKEN="<token from .env — never commit it>"
export USER_ID="qa-manual-$(date +%s)-a"
export OTHER_USER_ID="qa-manual-$(date +%s)-b"
```

Every request must include the Aisle testing token:

```bash
-H "Authorization: Bearer ${AISLE_TEST_TOKEN}"
```

## Readiness

```bash
curl -i -X GET "${AISLE_BASE_URL}/api/v1/pii-test/health/ready" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}"
```

## Write PII

Creates or replaces one PII field for a tenant-scoped user.

```bash
curl -i -X POST "${AISLE_BASE_URL}/api/v1/pii-test" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "${USER_ID}",
  "field": "EMAIL",
  "value": "Person@Example.com"
}
JSON
```

## Read PII

Reads one or more fields for one tenant-scoped user.

```bash
curl -i -X POST "${AISLE_BASE_URL}/api/v1/pii-test/read" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "${USER_ID}",
  "field_names": ["EMAIL", "PHONE", "NAME"]
}
JSON
```

## Search PII

Performs exact normalized search on a searchable field.

```bash
curl -i -X POST "${AISLE_BASE_URL}/api/v1/pii-test/EMAIL/search" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "value": "Person@Example.com",
  "limit": 10,
  "include_values": false
}
JSON
```

## Batch Read PII

Reads selected fields for multiple users.

```bash
curl -i -X POST "${AISLE_BASE_URL}/api/v1/pii-test/batch/read" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_ids": ["${USER_ID}", "${OTHER_USER_ID}"],
  "fields": ["EMAIL", "PHONE", "NAME"]
}
JSON
```

## Create Transient Phone

Creates a temporary encrypted phone mapping. Use only an approved test number (`AISLE_TEST_PHONES`, see BQ-03) —
never a real person's number.

```bash
curl -i -X POST "${AISLE_BASE_URL}/api/v1/pii-test/transient/phones" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "phone": "<approved test phone from AISLE_TEST_PHONES>",
  "ttl_seconds": 300
}
JSON
```

Copy the `transient_id` from the response:

```bash
export TRANSIENT_ID="<transient-id-from-response>"
```

## Resolve Transient Phone

Returns the normalized phone for an unexpired transient mapping.

```bash
curl -i -X POST "${AISLE_BASE_URL}/api/v1/pii-test/transient/phones/resolve" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "transient_id": "${TRANSIENT_ID}"
}
JSON
```

## Promote Transient Phone

Stores a transient phone as permanent `PHONE` PII for a user.

```bash
curl -i -X POST "${AISLE_BASE_URL}/api/v1/pii-test/transient/phones/promote" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "transient_id": "${TRANSIENT_ID}",
  "user_id": "${USER_ID}"
}
JSON
```

## Create Free-Text Key

Creates a caller-owned free-text encryption key.

```bash
curl -i -X POST "${AISLE_BASE_URL}/api/v1/pii-test/free-text/keys" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
}
JSON
```

Copy the `key_id` from the response:

```bash
export FREE_TEXT_KEY_ID="<key-id-from-response>"
```

## Read Free-Text Key

Returns an active free-text key.

```bash
curl -i -X POST "${AISLE_BASE_URL}/api/v1/pii-test/free-text/keys/read" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "key_id": "${FREE_TEXT_KEY_ID}"
}
JSON
```

## Revoke Free-Text Key

Revokes a caller-owned free-text key.

```bash
curl -i -X POST "${AISLE_BASE_URL}/api/v1/pii-test/free-text/keys/revoke" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "key_id": "${FREE_TEXT_KEY_ID}"
}
JSON
```

## Quick Smoke Sequence

This sequence writes an email and reads it back.

```bash
curl -i -X POST "${AISLE_BASE_URL}/api/v1/pii-test" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "${USER_ID}",
  "field": "EMAIL",
  "value": "smoke.person@example.com"
}
JSON

curl -i -X POST "${AISLE_BASE_URL}/api/v1/pii-test/read" \
  -H "Authorization: Bearer ${AISLE_TEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "${USER_ID}",
  "field_names": ["EMAIL"]
}
JSON
```
