# Postgres name columns (plan task 3.2)

Scan of 2026-11-12, read-only (`BEGIN READ ONLY`), on the three databases QA can open: `aisleweb` (Aisle app DB),
`desiapp_production` (vernac **test** data) and `pii` (PII DB). Partitions were skipped.

**Method.** Only the schema and JSON **key names** were read, never values:

1. Every column whose name looks like a person's name (`first_name`, `name`, `full_name`, `nick_name`, `display_name`,
   `sender_name`, `user_name`, `customer_name`, `billing_name` …).
2. Every `json` / `jsonb` column. The top-level keys of the latest 2,000 rows were listed. For logs and webhook payloads,
   the key paths at every depth were listed too.

Columns found: Aisle DB 173, vernac DB 128, PII DB 5.

## Columns that hold a user's name

| Database           | Table . column                                           | What it holds                                                 | Inventory                              |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| aisleweb           | `profiles.first_name` (+ `hide_first_name`, `user_name`) | Profile name, plain text (by design; PII DB holds the cipher) | ✅ many rows                           |
| aisleweb           | `profile_view.first_name` (view)                         | Copy of `profiles.first_name`                                 | ✅                                     |
| aisleweb           | `chat_requests.profile_data_json`                        | Profile snapshot sent with a chat request                     | ✅                                     |
| aisleweb / desiapp | `offline_event_orders.personal_info` → key `name`        | Name typed at event booking                                   | ✅ FN-AIS-093, FN-VRN-053, FN-BKG-052  |
| aisleweb           | `paint_bar_mixers.personal_details` → key `name`         | Name typed at paint & mixer booking (web)                     | 🆕 **FN-AIS-111** (added by this scan) |
| desiapp            | `account_profiles.first_name` (+ `hide_first_name`)      | Vernac profile name                                           | ✅                                     |
| desiapp            | `profile_view.first_name` (view)                         | Copy of `account_profiles.first_name`                         | ✅ (reader unknown, M2FNQ-50)          |
| aisleweb / desiapp | `admin_curations.data`                                   | Curation snapshot                                             | ✅                                     |
| aisleweb / desiapp | `payment_cashfree_subscriptions.raw_response`            | Provider response                                             | ✅                                     |
| aisleweb / desiapp | `spam_filter_scammer_names.name`                         | Blocked-name list (not a user's own row)                      | ✅                                     |

## Columns with a name field that no current code writes (legacy)

| Database | Table . column                                                        | Note                                               |
| -------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| aisleweb | `payment_paypal_transactions.first_name`, `last_name`, `address_name` | No code on `develop_new` reads or writes the table |
| aisleweb | `user_test_data.first_name`                                           | No code on `develop_new` reads or writes the table |

## Checked and holding no user name

- **Staff names, not users:** `admin_ref_sharings.curator_name`, `admin_ref_sharings.checked_by_name`.
- **E-mail addresses, not names:** `account_emails.name` and `account_emails.encrypted_name` hold the e-mail address. They are in scope for Milestone 3, not this suite.
- **Reference lists:** `fields_*` / `field_*`, cities, states, countries, plans, campaigns, moderation labels and similar.
- **JSON with no name key in the sampled rows:**
  - `admin_logs.data`
  - `deloitte_export_invoice_retries.data`. The invoice name is built at run time from the profile; see FN-BKG-053 and FN-VRN-056/057.
  - `payment_money_back_guarantees.metadata`
  - `sms_notification_logs.request_details`. Its only `*name` keys are request headers (`HTTP_APP_NAME`, `SERVER_NAME`).
  - `sms_notification_provider_logs.data`
  - `airbrake_error_groups.parameters`
  - `payment_cashfree_orders.web_checkout_metadata` and `payment_phonepay_subscriptions.web_checkout_metadata` (`plan_name` only).
- **Empty on staging:** `payment_cashfree_subscription_webhook_calls.payload`, in both DBs.
- **PII DB:** the `field_name` columns name the PII field (`NAME`, `EMAIL` …). They do not hold values.

## Not readable by QA (ask Dev)

- `pii.pii_migration_audit_outbox.payload`: permission denied.
- `desiapp_production.sms_notification_tracks.metadata`: permission denied.
