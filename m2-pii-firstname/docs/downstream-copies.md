# Downstream copies of the first name (plan task 3.3)

Read-only code trace of 2026-11-12. Nothing was run.

| Repo                      | Ref                            |
| ------------------------- | ------------------------------ |
| aisle_new                 | `origin/develop_new` @ bd85044 |
| desiapp                   | `origin/develop` @ f89046944   |
| notification-microservice | HEAD aa9c875                   |
| django_algorithm          | HEAD 599bb840                  |

These are from code — confirm with Dev.

## Where the name leaves the backend

| Target                                                  | Carries the name?                                                                  | Inventory                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| Kafka `prod_/test_aisle_profile_sync` (Aisle)           | **Yes**: `data.general_information.first_name`, taken from the Redis profile cache | FN-BKG-059                              |
| Kafka `test_graph_sync` → Django → Neo4j                | No (first_name is not in the property allowlist, profile.rb:63-84)                 | FN-DJG-010                              |
| Kafka `aisle_profile_sync_ds_v1`, CleverTap, AppsFlyer  | No                                                                                 | FN-BKG-058                              |
| Kafka `push_notification_events` → notification-ms      | Yes, inside the rendered push text (the consumer logs the whole message)           | FN-BKG-034/039, FN-NTF-003/005/006      |
| Sidekiq job arguments (push workers)                    | Yes (`first_name`, `sender_name`)                                                  | FN-BKG-035 … 038, 066                   |
| Meta Conversions API                                    | sha256 of the name (Aisle and vernac)                                              | FN-BKG-054, FN-VRN-060                  |
| Firebase, PubNub, Pusher, Exotel                        | Yes                                                                                | FN-BKG-063/064/013, 025 … 027, 047      |
| Cashfree, PayU, Deloitte e-invoice, Mandrill, Mailchimp | Yes                                                                                | FN-BKG-040 … 053, 065, FN-VRN-053 … 057 |
| Slack alert for a paid offline-event order (Aisle)      | Yes (`personal_info.name`)                                                         | 🆕 **FN-BKG-070**                       |
| Vernac Rails log of every push (`noti_params`)          | Yes                                                                                | 🆕 **FN-VRN-064**                       |
| Vernac Kafka `socket_events_test`, `appsflyer_events`   | No                                                                                 | none (carries no name)                  |
| Vernac PubNub messages                                  | No (sender ref only)                                                               | none (carries no name)                  |
| Vernac Firebase message builder                         | Would carry it, but the code has no callers                                        | FN-VRN-028                              |
| Django API responses and the share-link header          | Yes (Redis cache / Postgres)                                                       | FN-DJG-001 … 009                        |

None of these repos has a search index (Elasticsearch, OpenSearch, Algolia). They also have no Segment, Mixpanel or
BigQuery code.

## Cannot be traced from these repos (ask Dev)

- **Kafka consumers outside these repos.** Nobody here consumes the profile-sync, DS, CleverTap-forwarder, AppsFlyer and socket topics. It is unknown whether those consumers store the name. The profile sync is the one that matters, since it is the only topic that carries the name.
- **Graph sync.** It is not known whether `testgraph.aisle.co` runs `django_algorithm`, or whether its `KAFKA_TOPIC` is set to `test_graph_sync`. Either way, the payload carries no name.
- **Vernac notification event server.** `NOTIFICATION_EVENT_SERVER_URL` comes from env, so the service that receives these events cannot be identified.
- **Third-party retention.** How long Meta, Firebase, PubNub, Pusher, Exotel, the payment providers, Deloitte, Mandrill/Mailchimp, Slack and Airbrake keep the name is unknown.
- **Client CleverTap metadata.** Whether the apps put a name into CleverTap event metadata cannot be seen from these repos. notification-microservice forwards that metadata as it receives it.
- **Test push topic.** `push_notification_events_test` has no consumer in notification-microservice, so test pushes sent over Kafka are probably never delivered.
