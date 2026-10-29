<!-- GENERATED from m2/docs/code-discovered-routes.json by `npm run docs:api:drift -- --apply --document-new-routes` — do not edit by hand. -->

# Code-discovered routes (no Dev document)

Routes found in the Aisle code (`origin/develop_new`, read-only) that are not in any Dev API document. They are documented **docs-only**, labelled **from code — confirm with Dev**: no QA group, no test case. Only what the code literally shows is recorded; purpose, auth, caller, personal data, flow and data stores are not stated.

35 routes.

| ID       | Method | Path                                                        | Area                | Controller#action                                               | Code                                                                               |
| -------- | ------ | ----------------------------------------------------------- | ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| CODE-001 | POST   | `/V1/messages/firebase_webhook`                             | Provider callbacks  | `v1/messages#firebase_webhook`                                  | `app/controllers/v1/messages_controller.rb @004e72c`, `config/routes.rb:197`       |
| CODE-002 | POST   | `/V1/payment/cashfree/subscription/create`                  | Payments — checkout | `v1/payment#create_cashfree_subscription`                       | `app/controllers/v1/payment_controller.rb:276 @004e72c`, `config/routes.rb:230`    |
| CODE-003 | GET    | `/V1/payment/cashfree/subscription/status`                  | Payments — checkout | `v1/payment#cashfree_subscription_status`                       | `app/controllers/v1/payment_controller.rb:281 @004e72c`, `config/routes.rb:231`    |
| CODE-004 | POST   | `/V1/payment/cashfree/subscription/cancel`                  | Payments — checkout | `v1/payment#cancel_cashfree_subscription`                       | `app/controllers/v1/payment_controller.rb:286 @004e72c`, `config/routes.rb:232`    |
| CODE-005 | POST   | `/V1/payment/cashfree/subscription/webhook`                 | Provider callbacks  | `v1/payment#cashfree_subscription_webhook`                      | `app/controllers/v1/payment_controller.rb:291 @004e72c`, `config/routes.rb:233`    |
| CODE-006 | POST   | `/V1/payment/cashfree/subscription/authorization_callback`  | Provider callbacks  | `v1/payment#cashfree_subscription_authorization_callback`       | `app/controllers/v1/payment_controller.rb:297 @004e72c`, `config/routes.rb:234`    |
| CODE-007 | POST   | `/V1/payment/ms/activateAnySubscriptionWithExpiry`          | Payments — checkout | `v1/payment#activate_any_subscription_with_expiry_ms`           | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:285`        |
| CODE-008 | POST   | `/V1/payment/ms/addExtraInvites`                            | Payments — checkout | `v1/payment#add_extra_invites_ms`                               | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:286`        |
| CODE-009 | POST   | `/V1/payment/ms/addBoostToProfile`                          | Payments — checkout | `v1/payment#add_boost_to_profile_ms`                            | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:287`        |
| CODE-010 | POST   | `/V1/payment/ms/activePremiumSubscription`                  | Payments — checkout | `v1/payment#active_premium_subscription_ms`                     | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:288`        |
| CODE-011 | POST   | `/V1/payment/ms/activateAnySubscription`                    | Payments — checkout | `v1/payment#activate_any_subscription_ms`                       | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:289`        |
| CODE-012 | POST   | `/V1/payment/ms/enableExclusivity`                          | Payments — checkout | `v1/payment#enable_exclusivity_ms`                              | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:290`        |
| CODE-013 | POST   | `/V1/payment/ms/fetchUserIdFromIosIdentifier`               | Payments — checkout | `v1/payment#fetch_user_id_from_ios_identifier_ms`               | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:291`        |
| CODE-014 | POST   | `/V1/payment/ms/deactivateActiveSubscription`               | Payments — checkout | `v1/payment#deactivate_active_subscription_ms`                  | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:292`        |
| CODE-015 | POST   | `/V1/payment/ms/editUserSubscription`                       | Payments — checkout | `v1/payment#edit_user_subscription_ms`                          | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:293`        |
| CODE-016 | POST   | `/V1/payment/ms/addConsumableDataGoogle`                    | Payments — checkout | `v1/payment#add_consumable_data_google_ms`                      | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:294`        |
| CODE-017 | POST   | `/V1/payment/ms/getAccountSubscription`                     | Payments — checkout | `v1/payment#get_account_subscription_ms`                        | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:295`        |
| CODE-018 | POST   | `/V1/payment/ms/removeAccountSubscription`                  | Payments — checkout | `v1/payment#remove_account_subscription_ms`                     | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:296`        |
| CODE-019 | POST   | `/V1/payment/ms/getActiveConciergeSubscription`             | Payments — checkout | `v1/payment#get_active_concierge_subscription_ms`               | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:297`        |
| CODE-020 | POST   | `/V1/payment/ms/getActiveAislePlusSubscription`             | Payments — checkout | `v1/payment#get_active_aisle_plus_subscription_ms`              | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:298`        |
| CODE-021 | POST   | `/V1/payment/ms/getActivePremiumSubscriptionByGooglePlay`   | Payments — checkout | `v1/payment#get_active_premium_subscription_by_google_play_ms`  | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:299`        |
| CODE-022 | POST   | `/V1/payment/ms/extendSubscription`                         | Payments — checkout | `v1/payment#extend_subscription_ms`                             | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:300`        |
| CODE-023 | POST   | `/V1/payment/ms/reduceSubscription`                         | Payments — checkout | `v1/payment#reduce_subscription_ms`                             | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:301`        |
| CODE-024 | POST   | `/V1/payment/ms/addConsummableDataGoogle`                   | Payments — checkout | `v1/payment#add_consumable_data_google_ms`                      | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:302`        |
| CODE-025 | POST   | `/V1/payment/ms/validateIosConsumable`                      | Payments — checkout | `v1/payment#validate_ios_consummable_response_ms`               | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:303`        |
| CODE-026 | POST   | `/V1/payment/ms/getActiveSubscriptionByPlan`                | Payments — checkout | `v1/payment#get_active_subscription_by_plan_ms`                 | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:304`        |
| CODE-027 | POST   | `/V1/payment/ms/editUserSubscriptionPostAppleSubscriptions` | Payments — checkout | `v1/payment#edit_user_subscription_post_apple_subscriptions_ms` | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:305`        |
| CODE-028 | POST   | `/V1/payment/ms/saveToS3`                                   | Payments — checkout | `v1/payment#save_to_s3_ms`                                      | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:306`        |
| CODE-029 | POST   | `/V1/payment/ms/profileExists`                              | Payments — checkout | `v1/payment#profile_exists_ms`                                  | `app/controllers/v1/payment_controller.rb @004e72c`, `config/routes.rb:307`        |
| CODE-030 | POST   | `/V1/images/upload`                                         | Profile updates     | `v1/images#create`                                              | `app/controllers/v1/images_controller.rb:7 @004e72c`, `config/routes.rb:331`       |
| CODE-031 | POST   | `/V1/images/detect_face_in_image`                           | Profile updates     | `v1/images#detect_face_in_image`                                | `app/controllers/v1/images_controller.rb:43 @004e72c`, `config/routes.rb:333`      |
| CODE-032 | POST   | `/V1/images/image_modifications`                            | Profile updates     | `v1/images#image_modifications`                                 | `app/controllers/v1/images_controller.rb:48 @004e72c`, `config/routes.rb:334`      |
| CODE-033 | GET    | `/admin/member/fetch_spark_purchase_history`                | CMS / admin         | `admin/members#fetch_spark_purchase_history`                    | `app/controllers/admin/members_controller.rb:83 @004e72c`, `config/routes.rb:662`  |
| CODE-034 | GET    | `/admin/members/download_account_data`                      | CMS / admin         | `admin/members#download_account_data`                           | `app/controllers/admin/members_controller.rb:604 @004e72c`, `config/routes.rb:686` |
| CODE-035 | GET    | `/admin/stories/fetch_deleted_reasons`                      | CMS / admin         | `admin/stories#fetch_deleted_reasons`                           | `app/controllers/admin/stories_controller.rb:8 @004e72c`, `config/routes.rb:704`   |

## CODE-001 · `POST /V1/messages/firebase_webhook`

- Route: `config/routes.rb:197` @004e72c → `v1/messages#firebase_webhook`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Provider callbacks (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action firebase_webhook is not defined in app/controllers/v1/messages_controller.rb (inherited or generated)`

## CODE-002 · `POST /V1/payment/cashfree/subscription/create`

- Route: `config/routes.rb:230` @004e72c → `v1/payment#create_cashfree_subscription`
- Action: `app/controllers/v1/payment_controller.rb:276`
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `app/controllers/v1/payment_controller.rb:277 passes all params to Payment::Cashfree.create_cashfree_subscription — the fields read there are not determined`; `app/controllers/v1/payment_controller.rb:278 renders response — its full key set is built at run time`

## CODE-003 · `GET /V1/payment/cashfree/subscription/status`

- Route: `config/routes.rb:231` @004e72c → `v1/payment#cashfree_subscription_status`
- Action: `app/controllers/v1/payment_controller.rb:281`
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `app/controllers/v1/payment_controller.rb:282 passes all params to Payment::Cashfree.cashfree_subscription_status — the fields read there are not determined`; `app/controllers/v1/payment_controller.rb:283 renders response — its full key set is built at run time`

## CODE-004 · `POST /V1/payment/cashfree/subscription/cancel`

- Route: `config/routes.rb:232` @004e72c → `v1/payment#cancel_cashfree_subscription`
- Action: `app/controllers/v1/payment_controller.rb:286`
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `app/controllers/v1/payment_controller.rb:287 passes all params to Payment::Cashfree.cancel_cashfree_subscription — the fields read there are not determined`; `app/controllers/v1/payment_controller.rb:288 renders response — its full key set is built at run time`

## CODE-005 · `POST /V1/payment/cashfree/subscription/webhook`

- Route: `config/routes.rb:233` @004e72c → `v1/payment#cashfree_subscription_webhook`
- Action: `app/controllers/v1/payment_controller.rb:291`
- Request params read: none read literally
- Response keys (literal `render json:`): not stated
- Area: Provider callbacks (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `app/controllers/v1/payment_controller.rb:294 renders response — its full key set is built at run time`

## CODE-006 · `POST /V1/payment/cashfree/subscription/authorization_callback`

- Route: `config/routes.rb:234` @004e72c → `v1/payment#cashfree_subscription_authorization_callback`
- Action: `app/controllers/v1/payment_controller.rb:297`
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Provider callbacks (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `app/controllers/v1/payment_controller.rb:298 passes all params to Payment::Cashfree.cashfree_subscription_authorization_callback — the fields read there are not determined`; `app/controllers/v1/payment_controller.rb:299 renders response — its full key set is built at run time`

## CODE-007 · `POST /V1/payment/ms/activateAnySubscriptionWithExpiry`

- Route: `config/routes.rb:285` @004e72c → `v1/payment#activate_any_subscription_with_expiry_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action activate_any_subscription_with_expiry_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-008 · `POST /V1/payment/ms/addExtraInvites`

- Route: `config/routes.rb:286` @004e72c → `v1/payment#add_extra_invites_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action add_extra_invites_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-009 · `POST /V1/payment/ms/addBoostToProfile`

- Route: `config/routes.rb:287` @004e72c → `v1/payment#add_boost_to_profile_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action add_boost_to_profile_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-010 · `POST /V1/payment/ms/activePremiumSubscription`

- Route: `config/routes.rb:288` @004e72c → `v1/payment#active_premium_subscription_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action active_premium_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-011 · `POST /V1/payment/ms/activateAnySubscription`

- Route: `config/routes.rb:289` @004e72c → `v1/payment#activate_any_subscription_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action activate_any_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-012 · `POST /V1/payment/ms/enableExclusivity`

- Route: `config/routes.rb:290` @004e72c → `v1/payment#enable_exclusivity_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action enable_exclusivity_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-013 · `POST /V1/payment/ms/fetchUserIdFromIosIdentifier`

- Route: `config/routes.rb:291` @004e72c → `v1/payment#fetch_user_id_from_ios_identifier_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action fetch_user_id_from_ios_identifier_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-014 · `POST /V1/payment/ms/deactivateActiveSubscription`

- Route: `config/routes.rb:292` @004e72c → `v1/payment#deactivate_active_subscription_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action deactivate_active_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-015 · `POST /V1/payment/ms/editUserSubscription`

- Route: `config/routes.rb:293` @004e72c → `v1/payment#edit_user_subscription_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action edit_user_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-016 · `POST /V1/payment/ms/addConsumableDataGoogle`

- Route: `config/routes.rb:294` @004e72c → `v1/payment#add_consumable_data_google_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action add_consumable_data_google_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-017 · `POST /V1/payment/ms/getAccountSubscription`

- Route: `config/routes.rb:295` @004e72c → `v1/payment#get_account_subscription_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action get_account_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-018 · `POST /V1/payment/ms/removeAccountSubscription`

- Route: `config/routes.rb:296` @004e72c → `v1/payment#remove_account_subscription_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action remove_account_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-019 · `POST /V1/payment/ms/getActiveConciergeSubscription`

- Route: `config/routes.rb:297` @004e72c → `v1/payment#get_active_concierge_subscription_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action get_active_concierge_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-020 · `POST /V1/payment/ms/getActiveAislePlusSubscription`

- Route: `config/routes.rb:298` @004e72c → `v1/payment#get_active_aisle_plus_subscription_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action get_active_aisle_plus_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-021 · `POST /V1/payment/ms/getActivePremiumSubscriptionByGooglePlay`

- Route: `config/routes.rb:299` @004e72c → `v1/payment#get_active_premium_subscription_by_google_play_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action get_active_premium_subscription_by_google_play_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-022 · `POST /V1/payment/ms/extendSubscription`

- Route: `config/routes.rb:300` @004e72c → `v1/payment#extend_subscription_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action extend_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-023 · `POST /V1/payment/ms/reduceSubscription`

- Route: `config/routes.rb:301` @004e72c → `v1/payment#reduce_subscription_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action reduce_subscription_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-024 · `POST /V1/payment/ms/addConsummableDataGoogle`

- Route: `config/routes.rb:302` @004e72c → `v1/payment#add_consumable_data_google_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action add_consumable_data_google_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-025 · `POST /V1/payment/ms/validateIosConsumable`

- Route: `config/routes.rb:303` @004e72c → `v1/payment#validate_ios_consummable_response_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action validate_ios_consummable_response_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-026 · `POST /V1/payment/ms/getActiveSubscriptionByPlan`

- Route: `config/routes.rb:304` @004e72c → `v1/payment#get_active_subscription_by_plan_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action get_active_subscription_by_plan_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-027 · `POST /V1/payment/ms/editUserSubscriptionPostAppleSubscriptions`

- Route: `config/routes.rb:305` @004e72c → `v1/payment#edit_user_subscription_post_apple_subscriptions_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action edit_user_subscription_post_apple_subscriptions_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-028 · `POST /V1/payment/ms/saveToS3`

- Route: `config/routes.rb:306` @004e72c → `v1/payment#save_to_s3_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action save_to_s3_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-029 · `POST /V1/payment/ms/profileExists`

- Route: `config/routes.rb:307` @004e72c → `v1/payment#profile_exists_ms`
- Action: not defined in the controller file (not stated)
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Payments — checkout (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `action profile_exists_ms is not defined in app/controllers/v1/payment_controller.rb (inherited or generated)`

## CODE-030 · `POST /V1/images/upload`

- Route: `config/routes.rb:331` @004e72c → `v1/images#create`
- Action: `app/controllers/v1/images_controller.rb:7`
- Request params read: none read literally — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Profile updates (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `app/controllers/v1/images_controller.rb:8 passes all params to Amazon::Url.upload_image — the fields read there are not determined`; `app/controllers/v1/images_controller.rb:9 renders response — its full key set is built at run time`

## CODE-031 · `POST /V1/images/detect_face_in_image`

- Route: `config/routes.rb:333` @004e72c → `v1/images#detect_face_in_image`
- Action: `app/controllers/v1/images_controller.rb:43`
- Request params read: `image_url` (optional, L44)
- Response keys (literal `render json:`): not stated
- Area: Profile updates (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `app/controllers/v1/images_controller.rb:45 renders response — its full key set is built at run time`

## CODE-032 · `POST /V1/images/image_modifications`

- Route: `config/routes.rb:334` @004e72c → `v1/images#image_modifications`
- Action: `app/controllers/v1/images_controller.rb:48`
- Request params read: `original_url` (optional, L50) — not complete (see notes)
- Response keys (literal `render json:`): not stated
- Area: Profile updates (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `app/controllers/v1/images_controller.rb:51 passes all params to image_optimizer_obj.image_modifications_api — the fields read there are not determined`; `app/controllers/v1/images_controller.rb:52 renders response — its full key set is built at run time`

## CODE-033 · `GET /admin/member/fetch_spark_purchase_history`

- Route: `config/routes.rb:662` @004e72c → `admin/members#fetch_spark_purchase_history`
- Action: `app/controllers/admin/members_controller.rb:83`
- Request params read: `ref` (optional, L84)
- Response keys (literal `render json:`): `spark_purchase_history` (L88)
- Area: CMS / admin (assigned from the path, see scripts/api-docs/code-routes.ts)

## CODE-034 · `GET /admin/members/download_account_data`

- Route: `config/routes.rb:686` @004e72c → `admin/members#download_account_data`
- Action: `app/controllers/admin/members_controller.rb:604`
- Request params read: `export_id` (optional, L605), `ref` (optional, L607)
- Response keys (literal `render json:`): `status` (L624), `export_id` (L624), `reused` (L624)
- Area: CMS / admin (assigned from the path, see scripts/api-docs/code-routes.ts)

## CODE-035 · `GET /admin/stories/fetch_deleted_reasons`

- Route: `config/routes.rb:704` @004e72c → `admin/stories#fetch_deleted_reasons`
- Action: `app/controllers/admin/stories_controller.rb:8`
- Request params read: none read literally
- Response keys (literal `render json:`): not stated
- Area: CMS / admin (assigned from the path, see scripts/api-docs/code-routes.ts)
- Notes: `app/controllers/admin/stories_controller.rb:10 renders response — its full key set is built at run time`
