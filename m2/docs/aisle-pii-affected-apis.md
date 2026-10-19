# Aisle APIs affected by first name email and phone PII changes

This reference covers the application endpoints affected by direct first-name (`NAME`), email (`EMAIL`), and phone (`PHONE`) changes on `saurabh/pii-changes`, including response serializers, writes, searches, shared caches, payment payloads, callbacks, and background effects. The endpoint lists come first, followed by cURL examples. An endpoint appears in every applicable field list; shared cURL examples are linked rather than duplicated.

Source snapshot: `ae838f460acd4d9f9d60d0d633f3abe449408bde`. Comparison base: `e42e2dc58406036112f98ec420778d2c40b2ea1f` (merge base with local `origin/master`). Prepared 16 October 2026. Paths are case-sensitive: the mobile prefix is `/V1`.

The inventory contains 209 distinct method/path entries: 200 in first name, 51 in email, and 54 in phone number, with overlap between categories. It includes one ActiveAdmin HTML page and one declared diagnostic route whose action is missing.

## Endpoint lists

Paths through `sync_profile_to_kafka`, profile-save callbacks, moderation, payment reconciliation or workers are conditional reachability entries; their runtime guards may skip direct-field access entirely.

"Conditional" includes an operation reached only for a particular profile state, cache miss, feature flag, successful payment, or queued job. It does not mean the API accepts or returns that field. The final column gives the relevant source path. ActiveAdmin HTML is labelled separately. The declared diagnostic route with a missing action is listed so it is not silently omitted.

### First name APIs

200 method/path entries.

| ID and cURL | Method | Endpoint | PII access path |
|---|---|---|---|
| [API-001](#api-001) | GET | `/V1/pii_integration/first_name` | read_first_name → get_first_name |
| [API-002](#api-002) | POST | `/V1/pii_integration/first_name` | write_first_name → get_first_name |
| [API-003](#api-003) | POST | `/V1/pii_integration/profile_first_names` | profile_first_names → get_multiple_cache_data → hydrate_first_names! → get_first_names_for_users |
| [API-004](#api-004) | POST | `/V1/invites/send_request_to_profile` | send_request_to_profile → send_request → send_request_notification → send_request_push_notification! → select_first_name |
| [API-005](#api-005) | GET | `/V1/invites/all_requests` | list_all_requests → list_all_invitations → create_response → get_multiple_cache_data → hydrate_first_names! → get_first_names_for_users |
| [API-006](#api-006) | GET | `/V1/invites/list_comments_with_pagination` | list_comments_with_pagination → list_all_comments → create_response → get_multiple_cache_data → hydrate_first_names! → get_first_names_for_users |
| [API-007](#api-007) | GET | `/V1/invites/list_comments_and_likes` | list_comments_and_likes → list_all_comments → create_response → get_multiple_cache_data → hydrate_first_names! → get_first_names_for_users |
| [API-008](#api-008) | GET | `/V1/invites/list_request_and_likes` | list_request_and_likes → list_all_invitations → create_response → get_multiple_cache_data → hydrate_first_names! → get_first_names_for_users |
| [API-009](#api-009) | POST | `/V1/invites/accept_request` | accept_request → accept_request → send_connection_push → select_first_name |
| [API-010](#api-010) | POST | `/V1/invites/pass_request` | pass_request → pass_request → assign_negative_reaction → increment_negative_interaction! → assign_official_rating! → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-011](#api-011) | GET | `/V1/users/profile_info` | Profile.fetch_profile_info → profile_details cache hydration |
| [API-012](#api-012) | GET | `/V1/users/profile_info_web` | web_profile_info → fetch_web_profile_info → profile_details → create_cache_response → hydrate_first_name! → get_first_name_for_user |
| [API-013](#api-013) | GET | `/V1/users/fetch_own_info` | fetch_own_info → fetch_own_info → get_first_name |
| [API-014](#api-014) | GET | `/V1/users/matches_list_v2` | matches_list_v2 → select_algorithm_for_discover_profile_list → fetch_discover_profile_list → create_home_page_response_v2 → get_multiple_cache_data → hydrate_first_names! → get_first_names_for_users |
| [API-015](#api-015) | POST | `/V1/users/matches_list_v3` | matches_list_v2 → select_algorithm_for_discover_profile_list → fetch_discover_profile_list → create_home_page_response_v2 → get_multiple_cache_data → hydrate_first_names! → get_first_names_for_users |
| [API-016](#api-016) | GET | `/V1/users/discover_profile_list_v2` | discover_profile_list_v2 → get_profile_from_link_ref → fetch_recommended_profile_header_text → get_first_name |
| [API-017](#api-017) | GET | `/V1/users/meta_for_discover` | meta_for_discover → fetch_meta_for_discover_tab → get_first_name |
| [API-018](#api-018) | GET | `/V1/users/get_shareable_link` | get_shareable_link → get_link → get_first_name |
| [API-019](#api-019) | GET | `/V1/users/fetch_concierge_list` | fetch_concierge_list → fetch_concierge_profile_list → is_partial? → get_first_name |
| [API-020](#api-020) | GET | `/V1/users/fetch_top_matched_profiles` | fetch_top_matched_profiles → fetch_top_matched_profiles → fetch_profiles_list → create_top_matches_response → get_multiple_cache_data → hydrate_first_names! → get_first_names_for_users |
| [API-021](#api-021) | GET | `/V1/users/:ref` | show → get_specific_user → own_detailed_v1 → general_information → select_first_name |
| [API-022](#api-022) | POST | `/V1/users/about` | about → own_detailed_v1 → general_information → select_first_name |
| [API-023](#api-023) | POST | `/V1/users/add_meetup` | add_meetup → add → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-024](#api-024) | POST | `/V1/users/update_interests` | update_interests → own_detailed_v1 → general_information → select_first_name |
| [API-025](#api-025) | POST | `/V1/users/update_interests_v2` | update_interests_v2 → own_detailed_v1 → general_information → select_first_name |
| [API-026](#api-026) | POST | `/V1/users/update_traits` | update_traits → own_detailed_v1 → general_information → select_first_name |
| [API-027](#api-027) | POST | `/V1/users/mail_subscription` | mail_subscription → own_detailed_v1 → general_information → select_first_name |
| [API-028](#api-028) | POST | `/V1/users/sms_subscription` | sms_subscription → own_detailed_v1 → general_information → select_first_name |
| [API-029](#api-029) | POST | `/V1/users/deactivate_user` | deactivate_user → deactivate_profile → deactivated! → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-030](#api-030) | POST | `/V1/users/activate_user` | activate_user → activate_profile → pending! → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-031](#api-031) | POST | `/V1/users/verify_selfie_v1` | verify_selfie_v1 → verify_user_selfie_based_on_app_version → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-032](#api-032) | POST | `/V1/users/toggle_hide_name` | toggle_hide_name → select_first_name |
| [API-033](#api-033) | POST | `/V1/users/toggle_profile_sharing` | toggle_profile_sharing → toggle_profile_sharing! → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-034](#api-034) | POST | `/V1/users/toggle_profile_incognito` | toggle_profile_incognito → toggle_profile_incognito! → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-035](#api-035) | POST | `/V1/users/toogle_concierge_badge_display` | toogle_concierge_badge_display → toogle_concierge_badge_display! → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-036](#api-036) | POST | `/V1/users/update_settle_info` | update_settle_info → own_detailed_v1 → general_information → select_first_name |
| [API-037](#api-037) | POST | `/V1/users/update_relationship_goal_info` | update_relationship_goal_info → own_detailed_v1 → general_information → select_first_name |
| [API-038](#api-038) | POST | `/V1/users/update_philosophy_info` | update_philosophy_info → own_detailed_v1 → general_information → select_first_name |
| [API-039](#api-039) | POST | `/V1/users/update_mbti_info` | update_mbti_info_data → update_profile_cache_by_mbti → general_information |
| [API-040](#api-040) | POST | `/V1/users/update_audio_prompt` | update_audio_prompt → own_detailed_v1 → general_information → select_first_name |
| [API-041](#api-041) | POST | `/V1/users/save_auto_pop_up_info` | save_auto_pop_up_info → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-042](#api-042) | POST | `/V1/users/user_name` | set_public_user_name → set_user_name → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-043](#api-043) | POST | `/V1/users/public_profile` | set_profile_public → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-044](#api-044) | POST | `/V1/setting/update_preferences` | update_preferences → update_interested_faiths → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-045](#api-045) | POST | `/V1/setting/reset_preferences` | reset_preferences → select_algorithm_for_discover_tab → fetch_discover_tab_tester_response → fetch_own_info → get_first_name |
| [API-046](#api-046) | POST | `/V1/like` | create → like_user → like_user_back! → create_like_entry → select_first_name |
| [API-047](#api-047) | GET | `/V1/list_request_sent` | list_request_sent → fetch_activity_list → fetch_own_info → get_first_name |
| [API-048](#api-048) | GET | `/V1/list_likes_received_v1` | UserLike.list_likes_received_v2 → create_likes_received_api_response → profile cache name hydration |
| [API-049](#api-049) | GET | `/V1/list_all_passed` | list_all_passed → list_passed_profiles → fetch_own_info → get_first_name |
| [API-050](#api-050) | POST | `/V1/pass_user` | pass_user → pass_user → assign_negative_reaction → increment_negative_interaction! → assign_official_rating! → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-051](#api-051) | POST | `/V1/like_back` | like_back → like_user → like_user_back! → create_like_entry → select_first_name |
| [API-052](#api-052) | POST | `/V1/like_without_deduction` | like_without_deduction → like_user → like_user_back! → create_like_entry → select_first_name |
| [API-053](#api-053) | POST | `/V1/like_sent` | send_request_or_like → send_request_or_like → like_user → like_user_back! → create_like_entry → select_first_name |
| [API-054](#api-054) | POST | `/V1/like_received` | list_likes_and_requests_received → fetch_likes_and_requests_recieved → fetch_own_info → get_first_name |
| [API-055](#api-055) | POST | `/V1/like_accept` | accept_request_or_like → accept_request_or_like → accept_request → send_connection_push → select_first_name |
| [API-056](#api-056) | POST | `/V1/like_passed` | pass_request_or_like → pass_request_or_like → pass_user → assign_negative_reaction → increment_negative_interaction! → assign_official_rating! → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-057](#api-057) | POST | `/V1/user/submit_profile` | update_profile → submit_profile → update_application_information! → get_first_name |
| [API-058](#api-058) | POST | `/V1/user/edit` | edit_profile → edit_profile_details → get_first_name |
| [API-059](#api-059) | POST | `/V1/user/delete` | delete_account → delete_all_account_info → get_first_name |
| [API-060](#api-060) | POST | `/V1/sessions/verify_number_login_v1` | verify_number_login_v1 → verify_login_with_number → login_from_phone_number → login_response_v1 → send_for_aws_moderation → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-061](#api-061) | POST | `/V1/sessions/submit_profile_web` | update_profile_web → submit_profile_web → update_application_information_web! → get_first_name |
| [API-062](#api-062) | POST | `/V1/sessions/fetch_login_response` | create_login_response_v1 → login_from_phone_number_v1 → login_response_v1 → send_for_aws_moderation → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-063](#api-063) | GET | `/V1/list_connected_profiles` | list_connected_profiles → all_active_conversations_v1 → fetch_cached_conversations → create_cached_response → select_first_name |
| [API-064](#api-064) | POST | `/V1/connect_linked_users` | connect_linked_users → convert_to_full_connection → fill_conversation_cache! → create_cached_response → select_first_name |
| [API-065](#api-065) | POST | `/V1/messages/generate_agora_token` | generate_agora_token → send_request → fill_conversation_cache! → create_cached_response → select_first_name |
| [API-066](#api-066) | POST | `/V1/messages/unlock_video_call` | unlock_video_call → can_video_call? → select_first_name |
| [API-067](#api-067) | GET | `/V1/messages/can_video_call` | can_video_call → can_video_call? → select_first_name |
| [API-068](#api-068) | GET | `/V1/combined_messages_hidden_list` | combined_messages_hidden_list → all_active_conversations → fetch_cached_conversations → create_cached_response → select_first_name |
| [API-069](#api-069) | POST | `/V1/chat/chat_messages` | chat_messages → fetch_chat_messages → get_first_name |
| [API-070](#api-070) | POST | `/V1/payment/verify_razorpay_payment_v1` | verify_razorpay_payment_v1 → verify_by_payment_id → assign_plan_to_profile → activate_any_subscription → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-071](#api-071) | POST | `/V1/payment/verify_ios_payment_v1` | verify_ios_payment_v1 → verify_payment → restore_purchase → validate_receipt_data → validate_ios_consumable_response → activate_any_subscription → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_f… |
| [API-072](#api-072) | POST | `/V1/payment/verify_paytm_payment_v1` | verify_paytm_payment_v1 → verify_by_order_id → assign_plan_to_profile → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-073](#api-073) | POST | `/V1/payment/get_cashfree_request_params` | get_cashfree_request_params → fetch_order_token → new_cashfree_order_response → get_payment_session_id → fetch_payment_session_id → get_first_name |
| [API-074](#api-074) | POST | `/V1/payment/get_cashfree_web_request_params` | get_cashfree_web_request_params → fetch_web_order_token_v2 → new_cashfree_order_response → get_payment_session_id → fetch_payment_session_id → get_first_name |
| [API-075](#api-075) | POST | `/V1/payment/verify_cashfree_payment` | verify_cashfree_payment → verify_transaction → assign_plan_to_profile → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-076](#api-076) | POST | `/V1/payment/get_payu_request_params` | get_payu_request_params → fetch_payment_request_params → get_first_name |
| [API-077](#api-077) | POST | `/V1/payment/send_collect_request` | send_cashfree_collect_request → send_collect_request → collect_request → get_upi_order_token → fetch_upi_order_token → create_payment_link_body_for_web → get_first_name |
| [API-078](#api-078) | POST | `/V1/payment/get_payment_link` | send_payment_link → send_payment_link → fetch_payment_link → create_payment_link_body_for_web → get_first_name |
| [API-080](#api-080) | POST | `/V1/payment/phone_pay/mandate_create_callback` | phone_pay_mandate_create_webhook → handle_create_mandate_webhook → record_transaction → debit_amount → activate_any_subscription → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-081](#api-081) | POST | `/V1/payment/phone_pay/refund_callback` | phone_pay_refund_webhook → check_for_duplicate_payments → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-082](#api-082) | POST | `/V1/payment/phone_pay/one_time_payment_callback` | phone_pay_one_time_webhook → one_time_payment_done → activate_any_subscription → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-085](#api-085) | POST | `/V1/user/location` | update_location_coordinates → update_location → update_residence_info → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-086](#api-086) | GET | `/V1/user/verify_user_v1` | verify_user_v1 → verify_users_details_v1 → percentage_profile_complete → profile_details → create_cache_response → hydrate_first_name! → get_first_name_for_user |
| [API-087](#api-087) | POST | `/V1/user/verify_user_v1` | verify_user_v1 → verify_users_details_v1 → percentage_profile_complete → profile_details → create_cache_response → hydrate_first_name! → get_first_name_for_user |
| [API-088](#api-088) | GET | `/V1/user/verify_user` | verify_user → fetch_app_launch_info → get_first_name |
| [API-089](#api-089) | POST | `/V1/user/app_launch` | app_launch → record_app_launch_info → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-090](#api-090) | POST | `/V1/images/upload_images_v2` | upload_images_v2 → aws_moderation_for_images_by_inappropriate_profile → pending! → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-091](#api-091) | POST | `/V1/images/edit_images` | edit_images → own_detailed_v1 → general_information → select_first_name |
| [API-092](#api-092) | POST | `/V1/subscription/verify_android_payments` | verify_android_payments → verify_android_payment → add_consummable_or_subscription → add_subscription_data → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-093](#api-093) | POST | `/V1/subscription/restore_android_subscription` | restore_android_subscription → restore_subscription_from_previous_user → transfer_active_subscription → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-094](#api-094) | POST | `/V1/payment/googleplay_webhook` | googleplay_webhook → verify_googleplay_webhook_payment → add_consummable_or_subscription → add_subscription_data → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-095](#api-095) | POST | `/V1/payment/apple_webhook_v2` | apple_webhook_v2 → store_and_process_webhook → start_processing_notification → process_notification → renew → edit_user_subscription → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-096](#api-096) | POST | `/V1/subscription/restore_ios_subscription_v1` | restore_ios_subscription_v1 → restore_subscription_from_previous_user → transfer_active_subscription → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-097](#api-097) | POST | `/V1/subscription/boost_profile` | boost_profile → activate_boost → boost_rating! → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-098](#api-098) | POST | `/V1/report` | create → report_user → add_entry → accept_like_or_invite → accept_request → send_connection_push → select_first_name |
| [API-099](#api-099) | POST | `/V1/introduction/edit_icebreaker` | edit_icebreaker → percentage_profile_complete → profile_details → create_cache_response → hydrate_first_name! → get_first_name_for_user |
| [API-100](#api-100) | POST | `/V1/introduction/edit_icebreaker_v1` | edit_icebreaker_v1 → own_detailed_v1 → general_information → select_first_name |
| [API-101](#api-101) | GET | `/V1/speed_dating/event_info` | event_info → fetch_event_info → fetch_user_list → get_cache_from_ref → create_cache_response → hydrate_first_name! → get_first_name_for_user |
| [API-102](#api-102) | POST | `/V1/speed_dating/book_event` | book_event → verify_payment → assign_plan_to_profile → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-103](#api-103) | POST | `/V1/speed_dating/give_feedback` | give_feedback → add_feedback → connect_users! → fill_conversation_cache! → create_cached_response → select_first_name |
| [API-104](#api-104) | POST | `/V1/paint_bar_mixer/update_personal_details` | update_personal_details → update_personal_details → fetch_web_order_token_v2 → new_cashfree_order_response → get_payment_session_id → fetch_payment_session_id → get_first_name |
| [API-105](#api-105) | POST | `/V1/advertisement/vote` | vote → vote! → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-106](#api-106) | GET | `/V1/advertisement/profiles_voted` | profiles_voted → fetch_own_info → get_first_name |
| [API-107](#api-107) | GET | `/V1/live_audio` | index → fetch_all_live_audios → fill_room_cache! → select_first_name |
| [API-108](#api-108) | POST | `/V1/live_audio/go_live` | go_live → go_live → trigger_room_owner_online_update → get_first_name |
| [API-109](#api-109) | POST | `/V1/live_audio/join_room` | join_room → join_room → fetch_current_speaker_info → select_first_name |
| [API-110](#api-110) | POST | `/V1/live_audio/send_request_to_talk` | send_request_to_talk → send_request_to_talk → fill_room_cache! → select_first_name |
| [API-111](#api-111) | POST | `/V1/live_audio/switch_speaker` | switch_speaker → pass_speaker → create_speaker_passed_message → select_first_name |
| [API-112](#api-112) | POST | `/V1/live_audio/leave_room` | leave_room → leave_room → create_speaker_left_room_message → select_first_name |
| [API-113](#api-113) | POST | `/V1/pusher_presence_webhook` | pusher_presence_webhook → fill_room_cache! → select_first_name |
| [API-114](#api-114) | GET | `/V1/pusher_presence_webhook` | pusher_presence_webhook → fill_room_cache! → select_first_name |
| [API-115](#api-115) | POST | `/V1/freebies/claim` | claim_freebie → create_claim_entry → success_text → activate_any_subscription → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-116](#api-116) | GET | `/web/invites/all_requests` | list_all_requests → list_all_invitations → create_response → get_multiple_cache_data → hydrate_first_names! → get_first_names_for_users |
| [API-117](#api-117) | POST | `/web/invites/accept_request_v1` | accept_request_v1 → accept_request → send_connection_push → select_first_name |
| [API-118](#api-118) | POST | `/web/invites/pass_request` | pass_request → pass_request → assign_negative_reaction → increment_negative_interaction! → assign_official_rating! → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-119](#api-119) | GET | `/web/users/profile_info` | Profile.fetch_profile_info → profile_details cache hydration |
| [API-120](#api-120) | GET | `/web/users/:ref` | show → own_profile_web → own_detailed_web → general_information → select_first_name |
| [API-121](#api-121) | POST | `/web/users/about` | about → own_detailed_v1 → general_information → select_first_name |
| [API-122](#api-122) | POST | `/web/users/update_settings` | update_settings → update_age → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-123](#api-123) | POST | `/web/users/deactivate_user` | deactivate_user → deactivate_profile → deactivated! → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-124](#api-124) | POST | `/web/users/activate_user` | activate_user → activate_profile → pending! → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-125](#api-125) | POST | `/web/like` | create → like_user → like_user_back! → create_like_entry → select_first_name |
| [API-126](#api-126) | GET | `/web/list_likes_received` | UserLike.list_likes_received_v2 → create_likes_received_api_response → profile cache name hydration |
| [API-127](#api-127) | POST | `/web/pass_user` | pass_user → pass_user → assign_negative_reaction → increment_negative_interaction! → assign_official_rating! → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-128](#api-128) | POST | `/web/like_back` | like_back → like_user → like_user_back! → create_like_entry → select_first_name |
| [API-129](#api-129) | POST | `/web/user/update` | update_profile → submit_profile → update_application_information! → get_first_name |
| [API-130](#api-130) | POST | `/web/user/edit` | edit_profile → edit_profile_details → get_first_name |
| [API-131](#api-131) | POST | `/web/user/delete` | delete_account → delete_all_account_info → get_first_name |
| [API-132](#api-132) | POST | `/web/connect_linked_users` | connect_linked_users → convert_to_full_connection → fill_conversation_cache! → create_cached_response → select_first_name |
| [API-133](#api-133) | POST | `/web/payment/verify_razorpay_payment` | verify_razorpay_payment → verify_payment → assign_plan_to_profile → activate_any_subscription → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-134](#api-134) | POST | `/web/user/location` | update_location_coordinates → update_location → update_residence_info → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-135](#api-135) | POST | `/web/report` | create → report_user → add_entry → accept_like_or_invite → accept_request → send_connection_push → select_first_name |
| [API-136](#api-136) | GET | `/users/:ref` | Profile.get_specific_user_for_admin → detailed_for_admin serializer |
| [API-137](#api-137) | POST | `/users/send_misuse_email` | send_misuse_email → send_about_warning → get_first_name |
| [API-138](#api-138) | GET | `/admin/users/:ref` | Profile.get_specific_user_for_admin → detailed_for_admin serializer |
| [API-139](#api-139) | POST | `/admin/approve_and_edit` | approve_and_edit → update_profile_data → update_application_by_admin! → assign_first_name |
| [API-140](#api-140) | POST | `/admin/update_profile` | update_profile → update_profile_data → update_application_by_admin! → assign_first_name |
| [API-141](#api-141) | POST | `/admin/disapprove` | disapprove → disapprove_profile → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-142](#api-142) | GET | `/admin/pending/curation_tab` | curation_tab → pending_profile_list → curation_tab_pending → get_flags_raised → get_first_name |
| [API-143](#api-143) | GET | `/admin/pending/vip_tab` | vip_tab → fetch_vip_users → curation_tab_pending → get_flags_raised → get_first_name |
| [API-144](#api-144) | GET | `/admin/pending/people_hni_tab` | people_hni_tab → people_hni_tab_list → curation_tab_pending → get_flags_raised → get_first_name |
| [API-145](#api-145) | POST | `/admin/pending/people_hni_tab` | people_hni_tab_update_profiles → update_hni_registry → get_first_name |
| [API-146](#api-146) | POST | `/admin/pending/curation_tab_update_profiles_state` | curation_tab_update_profiles_state → add_to_list → pending_profile_list → curation_tab_pending → get_flags_raised → get_first_name |
| [API-147](#api-147) | POST | `/admin/pending/vip_tab_update_profiles_state` | vip_tab_update_profiles_state → add_to_list → pending_profile_list → curation_tab_pending → get_flags_raised → get_first_name |
| [API-148](#api-148) | GET | `/admin/images/list_multiple_profiles_v1` | list_multiple_profiles_v1 → fetch_pending_image_list → pending_image_response_1 → get_first_name_for_user |
| [API-149](#api-149) | POST | `/admin/images/images_updates_tab` | images_updates_tab → update_profile_images → assign_first_name |
| [API-150](#api-150) | GET | `/admin/images/list_auto_updates_images` | list_auto_updates_images → fetch_pending_auto_updates_images → pending_image_response_1 → get_first_name_for_user |
| [API-151](#api-151) | POST | `/admin/images/auto_updates_images_update` | auto_updates_images_update → update_profile_images → assign_first_name |
| [API-152](#api-152) | GET | `/admin/images/list_multiple_profiles_disapproved_v1` | list_multiple_profiles_disapproved_v1 → fetch_pending_image_update_disapproved_profile_list_2 → curation_tab_disapproved → get_first_name_for_user |
| [API-153](#api-153) | POST | `/admin/images/approve_reject_multiple_photos_v1` | approve_reject_multiple_photos_v1 → update_profile_images → assign_first_name |
| [API-154](#api-154) | POST | `/admin/images/approve_reject_multiple_photos_disapproved` | approve_reject_multiple_photos_disapproved → assign_first_name |
| [API-155](#api-155) | POST | `/admin/images/mark_selfie_verified` | mark_selfie_verified → verify_selfie_admin → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-156](#api-156) | GET | `/admin/reviews/list_multiple` | list_multiple → get_first_name |
| [API-157](#api-157) | GET | `/admin/reviews/fetch_individual` | fetch_individual → get_first_name |
| [API-158](#api-158) | POST | `/admin/reviews/update_multiple` | update_multiple → update_individual → send_about_warning → get_first_name |
| [API-159](#api-159) | POST | `/admin/reviews/save` | save → update_individual → send_about_warning → get_first_name |
| [API-160](#api-160) | GET | `/admin/member/search` | search → get_first_name |
| [API-161](#api-161) | GET | `/admin/member/aws_moderated_list` | aws_moderated_list → get_first_name |
| [API-162](#api-162) | GET | `/admin/member/feed` | feed → get_first_name |
| [API-163](#api-163) | GET | `/admin/member/fetch_complete_info` | fetch_complete_info → fetch_complete_details → fetch_connected_users_info → get_first_names_for_users |
| [API-164](#api-164) | GET | `/admin/member/fetch_bait_profile_info` | fetch_bait_profile_info → fetch_by_latest_interaction → fetch_complete_details → fetch_connected_users_info → get_first_names_for_users |
| [API-165](#api-165) | GET | `/admin/member/fetch_connected_profiles` | fetch_connected_profiles → fetch_connected_users_info → get_first_names_for_users |
| [API-166](#api-166) | GET | `/admin/member/user_activity_v1` | user_activity_v1 → user_reported_activity → get_first_name |
| [API-167](#api-167) | POST | `/admin/members/ban_profile` | ban_profile → ban_user → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-168](#api-168) | POST | `/admin/members/inappropriate_profile` | inappropriate_profile → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-169](#api-169) | POST | `/admin/members/review_update` | review_update → approveImages → sync_profile_to_kafka → create_profile_response → general_information → select_first_name |
| [API-170](#api-170) | GET | `/admin/members/autofeed` | autofeed → get_first_name |
| [API-171](#api-171) | GET | `/admin/members/retry_curation_bucket_list` | retry_curation_bucket_list → fetch_failed_review_profile_list → curation_tab_pending → get_flags_raised → get_first_name |
| [API-172](#api-172) | GET | `/admin/members/fetch_verified_profile` | fetch_verified_profile → fetch_verified_not_admin_approved_profiles_list → verified_account → curation_tab_pending → get_flags_raised → get_first_name |
| [API-173](#api-173) | POST | `/admin/members/update_verified_profile` | update_verified_profile → update_verified_profiles_list → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-174](#api-174) | POST | `/admin/members/refund_payment` | refund_payment → initiate_refund → refund_subscription → check_for_duplicate_payments → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-175](#api-175) | POST | `/admin/members/toggle_subscription` | toggle_subscription → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-176](#api-176) | POST | `/admin/members/capture_payment` | capture_payment → cms_restore_purchase → restore_purchase → validate_receipt_data → validate_ios_consumable_response → activate_any_subscription → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_f… |
| [API-177](#api-177) | POST | `/admin/members/correct_profile_location` | correct_profile_location → fetch_complete_details → fetch_connected_users_info → get_first_names_for_users |
| [API-178](#api-178) | GET | `/admin/members/search_profiles` | search_profiles → search_profiles_by_params → profile_response_cms → get_first_name |
| [API-179](#api-179) | GET | `/admin/members/download_profile_details` | download_profile_details → fetch_profile_data_cms → create_profile_json_for_cyber_cell → get_first_name |
| [API-180](#api-180) | POST | `/admin/members/approve_disapprove_banned_profiles` | approve_disapprove_banned_profiles → approve_profile → assign_first_name |
| [API-181](#api-181) | GET | `/admin/connections/fetch_messages` | fetch_messages → fetch_two_user_connection_details → get_first_name |
| [API-182](#api-182) | POST | `/admin/payments/subscription_transfer` | subscription_transfer → transfer_active_subscription → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-183](#api-183) | POST | `/admin/payments/capture_android_payment` | capture_android_payment → capture_android_payment_cms → verify_android_payment → add_consummable_or_subscription → add_subscription_data → activate_any_subscription_with_expiry → fill_cache! → create_profile_response → general_information → select_first_name |
| [API-184](#api-184) | GET | `/admin/stories` | index → fetch_all → get_first_name |
| [API-185](#api-185) | GET | `/admin/reports` | index → fetch_all → fetch_by_latest_reported → get_first_name |
| [API-186](#api-186) | GET | `/api/profile_data/:user_id` | profile_data → profile_details → create_cache_response → hydrate_first_name! → get_first_name_for_user |
| [API-187](#api-187) | POST | `/V1/messages/send` | Chat::Conversation.send_message → ChatMessageWorker → Chat::Message callbacks and sender_name |
| [API-188](#api-188) | POST | `/web/messages/send` | Chat::Conversation.send_message → ChatMessageWorker → Chat::Message callbacks and sender_name |
| [API-189](#api-189) | POST | `/V1/payment/get_cashfree_request_params_web` | get_cashfree_request_params_web → get_cashfree_web_request_params → Cashfree customer fields |
| [API-190](#api-190) | POST | `/V1/pii_integration/first_names/batch` | Pii::FieldStore.get_first_names |
| [API-191](#api-191) | GET | `/V1/users/test_profile_list` | TestApi invites/likes profile cache hydration |
| [API-192](#api-192) | GET | `/bangalore745/irl` | ActiveAdmin IRL content → get_first_name / fetch_email / fetch_mobile_number |
| [API-193](#api-193) | POST | `/V1/payment/generate_qr_code` | Cashfree get_upi_qr_code → generate_qr_code → get_upi_order_token → create_payment_link_body_for_web |
| [API-195](#api-195) | POST | `/V1/payment/verify_cashfree_payments_web` | Alias of verify_cashfree_payment; successful subscription assignment can rebuild the profile cache |
| [API-196](#api-196) | POST | `/V1/users/delete_older_account` | User.delete_older_account → delete_all_account_info → deletion email name and recipient |
| [API-197](#api-197) | POST | `/V1/users/delete_current_account` | User.delete_current_account → delete_all_account_info → deletion email name and recipient |
| [API-198](#api-198) | POST | `/V1/user/reset_profile` | User.reset_profile → copied/new Profile save callbacks and subscription/cache refresh |
| [API-199](#api-199) | POST | `/V1/api/v1/pii-test` | PiiTestController → ProxyClient → NAME service contract |
| [API-200](#api-200) | POST | `/V1/api/v1/pii-test/read` | PiiTestController → ProxyClient → NAME service contract |
| [API-201](#api-201) | POST | `/V1/api/v1/pii-test/batch/read` | PiiTestController → ProxyClient → NAME service contract |
| [API-202](#api-202) | POST | `/V1/api/v1/pii-test/NAME/search` | PiiTestController → ProxyClient → NAME service contract |
| [API-208](#api-208) | POST | `/V1/pii_integration/profile_first_name_source` | Declared route; profile_first_name_source action is absent (broken) |
| [API-209](#api-209) | POST | `/admin/members/autofeed_update` | MembersController.autofeed_update → auto_curated_profiles → assign_first_name; normalized approve/reject/inappropriate arrays |

### Email APIs

51 method/path entries.

| ID and cURL | Method | Endpoint | PII access path |
|---|---|---|---|
| [API-021](#api-021) | GET | `/V1/users/:ref` | show → get_specific_user → own_detailed_v1 → own_general_information → fetch_email |
| [API-022](#api-022) | POST | `/V1/users/about` | about → own_detailed_v1 → own_general_information → fetch_email |
| [API-024](#api-024) | POST | `/V1/users/update_interests` | update_interests → own_detailed_v1 → own_general_information → fetch_email |
| [API-025](#api-025) | POST | `/V1/users/update_interests_v2` | update_interests_v2 → own_detailed_v1 → own_general_information → fetch_email |
| [API-026](#api-026) | POST | `/V1/users/update_traits` | update_traits → own_detailed_v1 → own_general_information → fetch_email |
| [API-027](#api-027) | POST | `/V1/users/mail_subscription` | mail_subscription → own_detailed_v1 → own_general_information → fetch_email |
| [API-028](#api-028) | POST | `/V1/users/sms_subscription` | sms_subscription → own_detailed_v1 → own_general_information → fetch_email |
| [API-036](#api-036) | POST | `/V1/users/update_settle_info` | update_settle_info → own_detailed_v1 → own_general_information → fetch_email |
| [API-037](#api-037) | POST | `/V1/users/update_relationship_goal_info` | update_relationship_goal_info → own_detailed_v1 → own_general_information → fetch_email |
| [API-038](#api-038) | POST | `/V1/users/update_philosophy_info` | update_philosophy_info → own_detailed_v1 → own_general_information → fetch_email |
| [API-040](#api-040) | POST | `/V1/users/update_audio_prompt` | update_audio_prompt → own_detailed_v1 → own_general_information → fetch_email |
| [API-057](#api-057) | POST | `/V1/user/submit_profile` | update_profile → submit_profile → update_application_information! → Account::Email.add_email/search_user_ids |
| [API-058](#api-058) | POST | `/V1/user/edit` | edit_profile → own_detailed_v1 → own_general_information → fetch_email |
| [API-059](#api-059) | POST | `/V1/user/delete` | delete_account → delete_all_account_info → fetch_email |
| [API-060](#api-060) | POST | `/V1/sessions/verify_number_login_v1` | verify_number_login_v1 → verify_login_with_number → login_from_phone_number → login_response_v1 → send_for_aws_moderation → check_for_scammer_before_moderation! → fetch_email_domain |
| [API-061](#api-061) | POST | `/V1/sessions/submit_profile_web` | update_profile_web → submit_profile_web → update_application_information_web! → Account::Email.add_email/search_user_ids |
| [API-062](#api-062) | POST | `/V1/sessions/fetch_login_response` | create_login_response_v1 → login_from_phone_number_v1 → login_response_v1 → send_for_aws_moderation → check_for_scammer_before_moderation! → fetch_email_domain |
| [API-073](#api-073) | POST | `/V1/payment/get_cashfree_request_params` | get_cashfree_request_params → fetch_order_token → new_cashfree_order_response → get_payment_session_id → fetch_payment_session_id → fetch_email |
| [API-074](#api-074) | POST | `/V1/payment/get_cashfree_web_request_params` | get_cashfree_web_request_params → fetch_web_order_token_v2 → new_cashfree_order_response → get_payment_session_id → fetch_payment_session_id → fetch_email |
| [API-076](#api-076) | POST | `/V1/payment/get_payu_request_params` | get_payu_request_params → fetch_payment_request_params → fetch_email |
| [API-077](#api-077) | POST | `/V1/payment/send_collect_request` | send_cashfree_collect_request → send_collect_request → collect_request → get_upi_order_token → fetch_upi_order_token → create_payment_link_body_for_web → fetch_email |
| [API-078](#api-078) | POST | `/V1/payment/get_payment_link` | send_payment_link → send_payment_link → fetch_payment_link → create_payment_link_body_for_web → fetch_email |
| [API-089](#api-089) | POST | `/V1/user/app_launch` | app_launch → record_app_launch_info → update_last_seen_window → send_for_aws_moderation → check_for_scammer_before_moderation! → fetch_email_domain |
| [API-090](#api-090) | POST | `/V1/images/upload_images_v2` | upload_images_v2 → aws_moderation_for_images_by_inappropriate_profile → send_for_aws_moderation → check_for_scammer_before_moderation! → fetch_email_domain |
| [API-091](#api-091) | POST | `/V1/images/edit_images` | edit_images → own_detailed_v1 → own_general_information → fetch_email |
| [API-100](#api-100) | POST | `/V1/introduction/edit_icebreaker_v1` | edit_icebreaker_v1 → own_detailed_v1 → own_general_information → fetch_email |
| [API-104](#api-104) | POST | `/V1/paint_bar_mixer/update_personal_details` | update_personal_details → update_personal_details → fetch_web_order_token_v2 → new_cashfree_order_response → get_payment_session_id → fetch_payment_session_id → fetch_email |
| [API-121](#api-121) | POST | `/web/users/about` | about → own_detailed_v1 → own_general_information → fetch_email |
| [API-129](#api-129) | POST | `/web/user/update` | update_profile → submit_profile → update_application_information! → Account::Email.add_email/search_user_ids |
| [API-130](#api-130) | POST | `/web/user/edit` | edit_profile → own_detailed_v1 → own_general_information → fetch_email |
| [API-131](#api-131) | POST | `/web/user/delete` | delete_account → delete_all_account_info → fetch_email |
| [API-136](#api-136) | GET | `/users/:ref` | Profile.get_specific_user_for_admin → detailed_for_admin serializer |
| [API-137](#api-137) | POST | `/users/send_misuse_email` | send_misuse_email → send_about_warning → fetch_email |
| [API-138](#api-138) | GET | `/admin/users/:ref` | Profile.get_specific_user_for_admin → detailed_for_admin serializer |
| [API-158](#api-158) | POST | `/admin/reviews/update_multiple` | update_multiple → update_individual → send_about_warning → fetch_email |
| [API-159](#api-159) | POST | `/admin/reviews/save` | save → update_individual → send_about_warning → fetch_email |
| [API-160](#api-160) | GET | `/admin/member/search` | search → fetch_email |
| [API-163](#api-163) | GET | `/admin/member/fetch_complete_info` | fetch_complete_info → fetch_complete_details → admin_complete_details → fetch_email |
| [API-164](#api-164) | GET | `/admin/member/fetch_bait_profile_info` | fetch_bait_profile_info → fetch_by_latest_interaction → fetch_complete_details → admin_complete_details → fetch_email |
| [API-177](#api-177) | POST | `/admin/members/correct_profile_location` | correct_profile_location → fetch_complete_details → admin_complete_details → fetch_email |
| [API-179](#api-179) | GET | `/admin/members/download_profile_details` | download_profile_details → fetch_profile_data_cms → create_profile_json_for_cyber_cell → fetch_email |
| [API-184](#api-184) | GET | `/admin/stories` | index → fetch_all → fetch_email |
| [API-189](#api-189) | POST | `/V1/payment/get_cashfree_request_params_web` | get_cashfree_request_params_web → get_cashfree_web_request_params → Cashfree customer fields |
| [API-192](#api-192) | GET | `/bangalore745/irl` | ActiveAdmin IRL content → get_first_name / fetch_email / fetch_mobile_number |
| [API-193](#api-193) | POST | `/V1/payment/generate_qr_code` | Cashfree get_upi_qr_code → generate_qr_code → get_upi_order_token → create_payment_link_body_for_web |
| [API-196](#api-196) | POST | `/V1/users/delete_older_account` | User.delete_older_account → delete_all_account_info → deletion email name and recipient |
| [API-197](#api-197) | POST | `/V1/users/delete_current_account` | User.delete_current_account → delete_all_account_info → deletion email name and recipient |
| [API-199](#api-199) | POST | `/V1/api/v1/pii-test` | PiiTestController → ProxyClient → EMAIL service contract |
| [API-200](#api-200) | POST | `/V1/api/v1/pii-test/read` | PiiTestController → ProxyClient → EMAIL service contract |
| [API-201](#api-201) | POST | `/V1/api/v1/pii-test/batch/read` | PiiTestController → ProxyClient → EMAIL service contract |
| [API-203](#api-203) | POST | `/V1/api/v1/pii-test/EMAIL/search` | PiiTestController → ProxyClient → EMAIL service contract |

### Phone number APIs

54 method/path entries.

| ID and cURL | Method | Endpoint | PII access path |
|---|---|---|---|
| [API-005](#api-005) | GET | `/V1/invites/all_requests` | list_all_requests → list_all_invitations → is_test_user? → fetch_only_number |
| [API-006](#api-006) | GET | `/V1/invites/list_comments_with_pagination` | list_comments_with_pagination → list_all_comments → fetch_all_comments → is_test_user? → fetch_only_number |
| [API-007](#api-007) | GET | `/V1/invites/list_comments_and_likes` | list_comments_and_likes → list_all_comments → fetch_all_comments → is_test_user? → fetch_only_number |
| [API-008](#api-008) | GET | `/V1/invites/list_request_and_likes` | list_request_and_likes → list_all_invitations → is_test_user? → fetch_only_number |
| [API-021](#api-021) | GET | `/V1/users/:ref` | show → get_specific_user → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-022](#api-022) | POST | `/V1/users/about` | about → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-024](#api-024) | POST | `/V1/users/update_interests` | update_interests → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-025](#api-025) | POST | `/V1/users/update_interests_v2` | update_interests_v2 → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-026](#api-026) | POST | `/V1/users/update_traits` | update_traits → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-027](#api-027) | POST | `/V1/users/mail_subscription` | mail_subscription → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-028](#api-028) | POST | `/V1/users/sms_subscription` | sms_subscription → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-036](#api-036) | POST | `/V1/users/update_settle_info` | update_settle_info → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-037](#api-037) | POST | `/V1/users/update_relationship_goal_info` | update_relationship_goal_info → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-038](#api-038) | POST | `/V1/users/update_philosophy_info` | update_philosophy_info → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-040](#api-040) | POST | `/V1/users/update_audio_prompt` | update_audio_prompt → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-058](#api-058) | POST | `/V1/user/edit` | edit_profile → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-060](#api-060) | POST | `/V1/sessions/verify_number_login_v1` | verify_number_login_v1 → verify_login_with_number → login_from_phone_number → write_pii_phone_number_for_user |
| [API-063](#api-063) | GET | `/V1/list_connected_profiles` | list_connected_profiles → all_active_conversations_v1 → is_test_user? → fetch_only_number |
| [API-068](#api-068) | GET | `/V1/combined_messages_hidden_list` | combined_messages_hidden_list → all_active_conversations → is_test_user? → fetch_only_number |
| [API-073](#api-073) | POST | `/V1/payment/get_cashfree_request_params` | get_cashfree_request_params → fetch_order_token → new_cashfree_order_response → get_payment_session_id → fetch_payment_session_id → fetch_mobile_number |
| [API-074](#api-074) | POST | `/V1/payment/get_cashfree_web_request_params` | get_cashfree_web_request_params → fetch_web_order_token_v2 → new_cashfree_order_response → get_payment_session_id → fetch_payment_session_id → fetch_mobile_number |
| [API-076](#api-076) | POST | `/V1/payment/get_payu_request_params` | get_payu_request_params → fetch_payment_request_params → fetch_mobile_number |
| [API-077](#api-077) | POST | `/V1/payment/send_collect_request` | send_cashfree_collect_request → send_collect_request → collect_request → get_upi_order_token → fetch_upi_order_token → create_payment_link_body_for_web → fetch_only_number |
| [API-078](#api-078) | POST | `/V1/payment/get_payment_link` | send_payment_link → send_payment_link → fetch_payment_link → create_payment_link_body_for_web → fetch_only_number |
| [API-079](#api-079) | POST | `/V1/payment/phone_pay/create_subscription` | create_phone_pay_subscription → create_subscription_handler → fetch_phone_number_for_user |
| [API-083](#api-083) | POST | `/V1/payment/phone_pay/one_time_payment` | phone_pay_one_time_payment → fetch_only_number |
| [API-084](#api-084) | POST | `/V1/payment/phone_pay/create_phone_pay_subscription_web` | create_phone_pay_subscription_web → create_subscription_handler → fetch_phone_number_for_user |
| [API-091](#api-091) | POST | `/V1/images/edit_images` | edit_images → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-100](#api-100) | POST | `/V1/introduction/edit_icebreaker_v1` | edit_icebreaker_v1 → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-103](#api-103) | POST | `/V1/speed_dating/give_feedback` | give_feedback → add_feedback → connect_users! → fetch_mobile_number |
| [API-104](#api-104) | POST | `/V1/paint_bar_mixer/update_personal_details` | update_personal_details → update_personal_details → fetch_web_order_token_v2 → new_cashfree_order_response → get_payment_session_id → fetch_payment_session_id → fetch_mobile_number |
| [API-116](#api-116) | GET | `/web/invites/all_requests` | list_all_requests → list_all_invitations → is_test_user? → fetch_only_number |
| [API-121](#api-121) | POST | `/web/users/about` | about → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-130](#api-130) | POST | `/web/user/edit` | edit_profile → own_detailed_v1 → own_general_information → fetch_only_number |
| [API-136](#api-136) | GET | `/users/:ref` | Profile.get_specific_user_for_admin → detailed_for_admin serializer |
| [API-138](#api-138) | GET | `/admin/users/:ref` | Profile.get_specific_user_for_admin → detailed_for_admin serializer |
| [API-157](#api-157) | GET | `/admin/reviews/fetch_individual` | fetch_individual → fetch_only_number |
| [API-160](#api-160) | GET | `/admin/member/search` | search → fetch_only_number |
| [API-163](#api-163) | GET | `/admin/member/fetch_complete_info` | fetch_complete_info → fetch_complete_details → admin_complete_details → fetch_only_number_with_phone_code_name → fetch_only_number |
| [API-164](#api-164) | GET | `/admin/member/fetch_bait_profile_info` | fetch_bait_profile_info → fetch_by_latest_interaction → fetch_complete_details → admin_complete_details → fetch_only_number_with_phone_code_name → fetch_only_number |
| [API-177](#api-177) | POST | `/admin/members/correct_profile_location` | correct_profile_location → fetch_complete_details → admin_complete_details → fetch_only_number_with_phone_code_name → fetch_only_number |
| [API-179](#api-179) | GET | `/admin/members/download_profile_details` | download_profile_details → fetch_profile_data_cms → create_profile_json_for_cyber_cell → fetch_mobile_number |
| [API-184](#api-184) | GET | `/admin/stories` | index → fetch_all → fetch_mobile_number |
| [API-189](#api-189) | POST | `/V1/payment/get_cashfree_request_params_web` | get_cashfree_request_params_web → get_cashfree_web_request_params → Cashfree customer fields |
| [API-192](#api-192) | GET | `/bangalore745/irl` | ActiveAdmin IRL content → get_first_name / fetch_email / fetch_mobile_number |
| [API-193](#api-193) | POST | `/V1/payment/generate_qr_code` | Cashfree get_upi_qr_code → generate_qr_code → get_upi_order_token → create_payment_link_body_for_web |
| [API-194](#api-194) | POST | `/V1/payment/send_web_purchase_link` | Payment.send_web_purchase_link → SmsNotifierWorker → fetch_full_phone_number_for_user |
| [API-199](#api-199) | POST | `/V1/api/v1/pii-test` | PiiTestController → ProxyClient → PHONE service contract |
| [API-200](#api-200) | POST | `/V1/api/v1/pii-test/read` | PiiTestController → ProxyClient → PHONE service contract |
| [API-201](#api-201) | POST | `/V1/api/v1/pii-test/batch/read` | PiiTestController → ProxyClient → PHONE service contract |
| [API-204](#api-204) | POST | `/V1/api/v1/pii-test/PHONE/search` | PiiTestController → ProxyClient → PHONE service contract |
| [API-205](#api-205) | POST | `/V1/api/v1/pii-test/transient/phones` | PiiTestController transient-phone proxy; separate from normal OTP/login |
| [API-206](#api-206) | POST | `/V1/api/v1/pii-test/transient/phones/resolve` | PiiTestController transient-phone proxy; separate from normal OTP/login |
| [API-207](#api-207) | POST | `/V1/api/v1/pii-test/transient/phones/promote` | PiiTestController transient-phone proxy; separate from normal OTP/login |

## Request setup and prerequisites

Use a test deployment and synthetic accounts. Set `BASE_URL` to the origin only, without `/V1`; the commands include the correct prefix. Tokens are different credentials and are not interchangeable. Replace all record IDs and provider artifacts with valid values in the target environment. Examples contain all fields for the selected branch of the request; conditional alternatives are described beside the command. GET requests have query parameters and no JSON body.

```bash
export BASE_URL="https://your-test-host.example"
export USER_TOKEN="<normal-Aisle-user-JWT>"
export WEB_TOKEN="<Aisle-web-JWT>"
export TEST_TOKEN="<configured-TEST_TOKEN>"
export ADMIN_TOKEN="<CMS-admin-JWT>"
export INFOEDGE_PROFILE_API_TOKEN="<configured-INFOEDGE_PROFILE_API_TOKEN>"
export ADMIN_SESSION_COOKIE="<session-cookie-name>=<authenticated-admin-session-value>"
export CSRF_TOKEN="<browser-session-CSRF-token-if-required>"
export DEVICE_TYPE="android"
export APP_VERSION="<supported-test-app-version>"
export DEVICE_ID="pii-regression-device-001"
export USER_ID="<synthetic-user-id>"
export OTHER_USER_ID="<other-synthetic-user-id>"
export REF="<synthetic-profile-ref>"
export OTHER_REF="<other-synthetic-profile-ref>"
```

Other `${...}` placeholders are endpoint-specific IDs, uploaded URLs, OTPs, purchase tokens or signed provider responses. Obtain selectable IDs from the field-list APIs, conversations/requests from the corresponding list APIs, and plans from the payment plan APIs. Uploaded photo IDs and URLs must refer to the same test account. Normal user operations require the controller's allowed account state; discovery requires eligible pending/disapproved/approved profiles, and image re-upload requires an image-inappropriate profile.

CMS examples use `webcms: true`: the admin must have completed OTP verification and have permission for the controller/action. Native CMS clients instead omit `webcms` and supply an authorized `deviceuuid` header. Legacy `/users/*` and `/bangalore745/irl` use the authenticated browser cookie, not the CMS JWT.

PII test/integration routes use `TEST_TOKEN`. Rails adds the PII caller ID and Ed25519 signature; do not add `X-PII-Caller-Id` or `X-PII-Signature` to these application requests. The three field proxy examples are listed separately below because their bodies differ.

### Field behavior that affects test results

| Field | Read gate | Write and fallback behavior |
|---|---|---|
| First name | `ALLOW_PII_FIRST_NAME_READ` | `get_first_name` reads PII when enabled, otherwise the local profile attribute. `assign_first_name` normalizes the name, attempts the remote write and assigns the local compatibility field. |
| Email | `ALLOW_PII_EMAIL_READ` | `fetch_email` requires a local `email_id`, then reads PII when enabled. Onboarding passes `user_id` to `Account::Email.add_email`; ordinary profile edit does not update email. |
| Phone | `ALLOW_PII_PHONE_NUMBER_READ` | New-user phone login writes the national number to PII. Full-number reads prepend the locally stored country code. Existing-user login and admin phone edits do not resynchronize the PII value. |

Each gate comes from `Configuration::Constant`; only boolean `true` or string `"true"` enables the PII read. These model read wrappers do not automatically fall back to local values when an enabled remote read is missing or fails. First-name cache hydration leaves its existing cached name unchanged when the fetched name is nil. Direct model writes catch `Pii::Error`, report it and continue local writes; a successful application response alone does not prove the remote write succeeded. Proxy writes bypass model/cache updates.

## cURL commands

Each command is an individual request. Fields shown beside an ID identify all categories that share that request. Provider callbacks require genuine sandbox artifacts and matching signatures; the examples preserve the complete application envelope rather than inventing a successful provider signature.

### First name requests

#### API-001

`GET /V1/pii_integration/first_name` — First name.

Source: [app/controllers/v1/pii_integration_controller.rb](../app/controllers/v1/pii_integration_controller.rb); [route](../config/routes.rb#L18).

```bash
curl -i --request GET "${BASE_URL}/V1/pii_integration/first_name" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "user_id=$USER_ID"
```

#### API-002

`POST /V1/pii_integration/first_name` — First name.

Source: [app/controllers/v1/pii_integration_controller.rb](../app/controllers/v1/pii_integration_controller.rb); [route](../config/routes.rb#L19).

```bash
curl -i --request POST "${BASE_URL}/V1/pii_integration/first_name" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "$USER_ID",
  "first_name": "Asha"
}
JSON
```

#### API-003

`POST /V1/pii_integration/profile_first_names` — First name.

Source: [app/controllers/v1/pii_integration_controller.rb](../app/controllers/v1/pii_integration_controller.rb); [route](../config/routes.rb#L21).

```bash
curl -i --request POST "${BASE_URL}/V1/pii_integration/profile_first_names" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "refs": [
    "$REF",
    "$OTHER_REF"
  ]
}
JSON
```

#### API-004

`POST /V1/invites/send_request_to_profile` — First name.

Source: [app/controllers/v1/invites_controller.rb](../app/controllers/v1/invites_controller.rb); [route](../config/routes.rb#L57).

```bash
curl -i --request POST "${BASE_URL}/V1/invites/send_request_to_profile" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "invitation_type": "story",
  "reply_message": "Hello from the synthetic PII test."
}
JSON
```

#### API-005

`GET /V1/invites/all_requests` — First name, Phone number.

Source: [app/controllers/v1/invites_controller.rb](../app/controllers/v1/invites_controller.rb); [route](../config/routes.rb#L58).

```bash
curl -i --request GET "${BASE_URL}/V1/invites/all_requests" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-006

`GET /V1/invites/list_comments_with_pagination` — First name, Phone number.

Source: [app/controllers/v1/invites_controller.rb](../app/controllers/v1/invites_controller.rb); [route](../config/routes.rb#L59).

```bash
curl -i --request GET "${BASE_URL}/V1/invites/list_comments_with_pagination" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-007

`GET /V1/invites/list_comments_and_likes` — First name, Phone number.

Source: [app/controllers/v1/invites_controller.rb](../app/controllers/v1/invites_controller.rb); [route](../config/routes.rb#L60).

```bash
curl -i --request GET "${BASE_URL}/V1/invites/list_comments_and_likes" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-008

`GET /V1/invites/list_request_and_likes` — First name, Phone number.

Source: [app/controllers/v1/invites_controller.rb](../app/controllers/v1/invites_controller.rb); [route](../config/routes.rb#L61).

```bash
curl -i --request GET "${BASE_URL}/V1/invites/list_request_and_likes" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-009

`POST /V1/invites/accept_request` — First name.

Source: [app/controllers/v1/invites_controller.rb](../app/controllers/v1/invites_controller.rb); [route](../config/routes.rb#L62).

```bash
curl -i --request POST "${BASE_URL}/V1/invites/accept_request" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "id": "$REQUEST_ID",
  "invitation_type": "story",
  "message": "Hello"
}
JSON
```

#### API-010

`POST /V1/invites/pass_request` — First name.

Source: [app/controllers/v1/invites_controller.rb](../app/controllers/v1/invites_controller.rb); [route](../config/routes.rb#L63).

```bash
curl -i --request POST "${BASE_URL}/V1/invites/pass_request" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "id": "$REQUEST_ID",
  "invitation_type": "story"
}
JSON
```

#### API-011

`GET /V1/users/profile_info` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L68).

```bash
curl -i --request GET "${BASE_URL}/V1/users/profile_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "ref=$OTHER_REF"
```

#### API-012

`GET /V1/users/profile_info_web` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L69).

The target profile must satisfy public-profile visibility rules; Authorization is optional for this action.

```bash
curl -i --request GET "${BASE_URL}/V1/users/profile_info_web" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "user_name=$PUBLIC_USER_NAME"
```

#### API-013

`GET /V1/users/fetch_own_info` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L70).

```bash
curl -i --request GET "${BASE_URL}/V1/users/fetch_own_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}"
```

#### API-014

`GET /V1/users/matches_list_v2` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L71).

```bash
curl -i --request GET "${BASE_URL}/V1/users/matches_list_v2" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-015

`POST /V1/users/matches_list_v3` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L72).

POST alias of the matches_list_v2 action.

```bash
curl -i --request POST "${BASE_URL}/V1/users/matches_list_v3" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "page": 1,
  "items_per_page": 10
}
JSON
```

#### API-016

`GET /V1/users/discover_profile_list_v2` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L73).

```bash
curl -i --request GET "${BASE_URL}/V1/users/discover_profile_list_v2" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-017

`GET /V1/users/meta_for_discover` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L75).

```bash
curl -i --request GET "${BASE_URL}/V1/users/meta_for_discover" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}"
```

#### API-018

`GET /V1/users/get_shareable_link` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L76).

```bash
curl -i --request GET "${BASE_URL}/V1/users/get_shareable_link" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "recommended_profile_ref=$OTHER_REF"
```

#### API-019

`GET /V1/users/fetch_concierge_list` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L77).

```bash
curl -i --request GET "${BASE_URL}/V1/users/fetch_concierge_list" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-020

`GET /V1/users/fetch_top_matched_profiles` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L78).

```bash
curl -i --request GET "${BASE_URL}/V1/users/fetch_top_matched_profiles" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-021

`GET /V1/users/:ref` — First name, Email, Phone number.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L83).

```bash
curl -i --request GET "${BASE_URL}/V1/users/${REF}" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}"
```

#### API-022

`POST /V1/users/about` — First name, Email, Phone number.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L84).

```bash
curl -i --request POST "${BASE_URL}/V1/users/about" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "about": "Synthetic profile story for PII regression testing."
}
JSON
```

#### API-023

`POST /V1/users/add_meetup` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L85).

```bash
curl -i --request POST "${BASE_URL}/V1/users/add_meetup" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "restaurant_id": "$RESTAURANT_ID",
  "restaurant_meal_type_id": "$MEAL_TYPE_ID",
  "day": "Saturday"
}
JSON
```

#### API-024

`POST /V1/users/update_interests` — First name, Email, Phone number.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L86).

```bash
curl -i --request POST "${BASE_URL}/V1/users/update_interests" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_interests": [
    {
      "interest_id": "$INTEREST_ID",
      "value": 1
    }
  ]
}
JSON
```

#### API-025

`POST /V1/users/update_interests_v2` — First name, Email, Phone number.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L87).

```bash
curl -i --request POST "${BASE_URL}/V1/users/update_interests_v2" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_interests_v2": [
    {
      "interest_id": "$INTEREST_V2_ID"
    }
  ]
}
JSON
```

#### API-026

`POST /V1/users/update_traits` — First name, Email, Phone number.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L88).

```bash
curl -i --request POST "${BASE_URL}/V1/users/update_traits" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_traits": [
    {
      "trait_id": "$TRAIT_ID"
    }
  ]
}
JSON
```

#### API-027

`POST /V1/users/mail_subscription` — First name, Email, Phone number.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L89).

```bash
curl -i --request POST "${BASE_URL}/V1/users/mail_subscription" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-028

`POST /V1/users/sms_subscription` — First name, Email, Phone number.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L90).

```bash
curl -i --request POST "${BASE_URL}/V1/users/sms_subscription" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-029

`POST /V1/users/deactivate_user` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L91).

```bash
curl -i --request POST "${BASE_URL}/V1/users/deactivate_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-030

`POST /V1/users/activate_user` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L92).

```bash
curl -i --request POST "${BASE_URL}/V1/users/activate_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-031

`POST /V1/users/verify_selfie_v1` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L93).

Use a valid uploaded selfie and the current gesture. For a liveness flow, also supply the genuine liveness_response returned by the provider.

```bash
curl -i --request POST "${BASE_URL}/V1/users/verify_selfie_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "selfie_url": "$SELFIE_URL"
}
JSON
```

#### API-032

`POST /V1/users/toggle_hide_name` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L94).

```bash
curl -i --request POST "${BASE_URL}/V1/users/toggle_hide_name" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-033

`POST /V1/users/toggle_profile_sharing` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L95).

```bash
curl -i --request POST "${BASE_URL}/V1/users/toggle_profile_sharing" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-034

`POST /V1/users/toggle_profile_incognito` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L96).

```bash
curl -i --request POST "${BASE_URL}/V1/users/toggle_profile_incognito" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-035

`POST /V1/users/toogle_concierge_badge_display` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L97).

```bash
curl -i --request POST "${BASE_URL}/V1/users/toogle_concierge_badge_display" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-036

`POST /V1/users/update_settle_info` — First name, Email, Phone number.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L101).

```bash
curl -i --request POST "${BASE_URL}/V1/users/update_settle_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "settle_id": "$SETTLE_ID"
}
JSON
```

#### API-037

`POST /V1/users/update_relationship_goal_info` — First name, Email, Phone number.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L102).

```bash
curl -i --request POST "${BASE_URL}/V1/users/update_relationship_goal_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "relationship_goal": {
    "id": "$RELATIONSHIP_GOAL_ID",
    "optional_relationship_goal_message": ""
  }
}
JSON
```

#### API-038

`POST /V1/users/update_philosophy_info` — First name, Email, Phone number.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L103).

```bash
curl -i --request POST "${BASE_URL}/V1/users/update_philosophy_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "preferences": [
    {
      "id": "$PREFERENCE_ID",
      "value": 0
    }
  ]
}
JSON
```

#### API-039

`POST /V1/users/update_mbti_info` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L104).

```bash
curl -i --request POST "${BASE_URL}/V1/users/update_mbti_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "mbti_id": "$MBTI_ID"
}
JSON
```

#### API-040

`POST /V1/users/update_audio_prompt` — First name, Email, Phone number.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L106).

```bash
curl -i --request POST "${BASE_URL}/V1/users/update_audio_prompt" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "question_id": "$AUDIO_QUESTION_ID",
  "audio_url": "$AUDIO_URL"
}
JSON
```

#### API-041

`POST /V1/users/save_auto_pop_up_info` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L108).

This example exercises the traits branch; interests, work and philosophy are alternative popup branches.

```bash
curl -i --request POST "${BASE_URL}/V1/users/save_auto_pop_up_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_traits": [
    {
      "trait_id": "$TRAIT_ID"
    }
  ]
}
JSON
```

#### API-042

`POST /V1/users/user_name` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L113).

```bash
curl -i --request POST "${BASE_URL}/V1/users/user_name" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_name": "$PUBLIC_USER_NAME"
}
JSON
```

#### API-043

`POST /V1/users/public_profile` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L114).

```bash
curl -i --request POST "${BASE_URL}/V1/users/public_profile" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-044

`POST /V1/setting/update_preferences` — First name.

Source: [app/controllers/v1/setting_controller.rb](../app/controllers/v1/setting_controller.rb); [route](../config/routes.rb#L128).

```bash
curl -i --request POST "${BASE_URL}/V1/setting/update_preferences" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "age_from": 25,
  "age_to": 35
}
JSON
```

#### API-045

`POST /V1/setting/reset_preferences` — First name.

Source: [app/controllers/v1/setting_controller.rb](../app/controllers/v1/setting_controller.rb); [route](../config/routes.rb#L129).

```bash
curl -i --request POST "${BASE_URL}/V1/setting/reset_preferences" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-046

`POST /V1/like` — First name.

Source: [app/controllers/v1/like_controller.rb](../app/controllers/v1/like_controller.rb); [route](../config/routes.rb#L132).

```bash
curl -i --request POST "${BASE_URL}/V1/like" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF"
}
JSON
```

#### API-047

`GET /V1/list_request_sent` — First name.

Source: [app/controllers/v1/like_controller.rb](../app/controllers/v1/like_controller.rb); [route](../config/routes.rb#L133).

```bash
curl -i --request GET "${BASE_URL}/V1/list_request_sent" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-048

`GET /V1/list_likes_received_v1` — First name.

Source: [app/controllers/v1/like_controller.rb](../app/controllers/v1/like_controller.rb); [route](../config/routes.rb#L134).

```bash
curl -i --request GET "${BASE_URL}/V1/list_likes_received_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-049

`GET /V1/list_all_passed` — First name.

Source: [app/controllers/v1/like_controller.rb](../app/controllers/v1/like_controller.rb); [route](../config/routes.rb#L135).

```bash
curl -i --request GET "${BASE_URL}/V1/list_all_passed" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-050

`POST /V1/pass_user` — First name.

Source: [app/controllers/v1/like_controller.rb](../app/controllers/v1/like_controller.rb); [route](../config/routes.rb#L136).

```bash
curl -i --request POST "${BASE_URL}/V1/pass_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

#### API-051

`POST /V1/like_back` — First name.

Source: [app/controllers/v1/like_controller.rb](../app/controllers/v1/like_controller.rb); [route](../config/routes.rb#L137).

```bash
curl -i --request POST "${BASE_URL}/V1/like_back" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

#### API-052

`POST /V1/like_without_deduction` — First name.

Source: [app/controllers/v1/like_controller.rb](../app/controllers/v1/like_controller.rb); [route](../config/routes.rb#L138).

```bash
curl -i --request POST "${BASE_URL}/V1/like_without_deduction" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

#### API-053

`POST /V1/like_sent` — First name.

Source: [app/controllers/v1/like_controller.rb](../app/controllers/v1/like_controller.rb); [route](../config/routes.rb#L140).

```bash
curl -i --request POST "${BASE_URL}/V1/like_sent" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

#### API-054

`POST /V1/like_received` — First name.

Source: [app/controllers/v1/like_controller.rb](../app/controllers/v1/like_controller.rb); [route](../config/routes.rb#L141).

```bash
curl -i --request POST "${BASE_URL}/V1/like_received" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "page": 1,
  "items_per_page": 10
}
JSON
```

#### API-055

`POST /V1/like_accept` — First name.

Source: [app/controllers/v1/like_controller.rb](../app/controllers/v1/like_controller.rb); [route](../config/routes.rb#L142).

```bash
curl -i --request POST "${BASE_URL}/V1/like_accept" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

#### API-056

`POST /V1/like_passed` — First name.

Source: [app/controllers/v1/like_controller.rb](../app/controllers/v1/like_controller.rb); [route](../config/routes.rb#L143).

```bash
curl -i --request POST "${BASE_URL}/V1/like_passed" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "likes"
}
JSON
```

#### API-057

`POST /V1/user/submit_profile` — First name, Email.

Source: [app/controllers/v1/sessions_controller.rb](../app/controllers/v1/sessions_controller.rb); [route](../config/routes.rb#L153).

Onboarding writes first name and email only when their existing values are missing. Use an onboarding user and valid field IDs and uploaded photos. The web controller also uses this shared submit flow.

```bash
curl -i --request POST "${BASE_URL}/V1/user/submit_profile" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "data": {
    "general_information": {
      "first_name": "Asha",
      "personal_email": "asha@example.com",
      "gender": "Female",
      "date_of_birth_v1": "1996-01-15",
      "faith": {
        "id": "$FAITH_ID"
      },
      "mother_tongue": {
        "id": "$LANGUAGE_ID"
      },
      "height": 65
    },
    "relationship_goal": {
      "id": "$RELATIONSHIP_GOAL_ID"
    },
    "photos": [
      {
        "photo": "$PHOTO_URL_1"
      },
      {
        "photo": "$PHOTO_URL_2"
      }
    ],
    "preferences": [],
    "latitude": 12.9716,
    "longitude": 77.5946
  }
}
JSON
```

#### API-058

`POST /V1/user/edit` — First name, Email, Phone number.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L154).

Use the current complete editable payload when testing an existing profile: omitted work, traits, interests or audio fields can be cleared by edit_profile_details. personal_email in this body does not update email; this edit path changes the name and returns the existing email and phone.

```bash
curl -i --request POST "${BASE_URL}/V1/user/edit" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "data": {
    "general_information": {
      "first_name": "Asha"
    },
    "photos": [
      {
        "photo": "$PHOTO_URL_1",
        "photo_id": "$PHOTO_ID_1",
        "status": "avatar"
      },
      {
        "photo": "$PHOTO_URL_2",
        "photo_id": "$PHOTO_ID_2"
      }
    ],
    "user_traits": [
      {
        "trait_id": "$TRAIT_ID"
      }
    ],
    "user_interests_v2": [
      {
        "interest_id": "$INTEREST_V2_ID"
      }
    ],
    "preferences": [],
    "partial_work": {
      "work_title": "Engineer",
      "industry": "Technology",
      "college": "Example College",
      "graduation_year": "2018"
    },
    "audio_prompt": {
      "question_id": "$AUDIO_QUESTION_ID",
      "audio_url": "$AUDIO_URL"
    }
  }
}
JSON
```

#### API-059

`POST /V1/user/delete` — First name, Email.

Source: [app/controllers/v1/sessions_controller.rb](../app/controllers/v1/sessions_controller.rb); [route](../config/routes.rb#L155).

Deletion uses PII names/emails in its downstream account cleanup payload. Run only for a disposable test account.

```bash
curl -i --request POST "${BASE_URL}/V1/user/delete" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "reason_id": "$DELETE_REASON_ID",
  "note": "Synthetic PII regression account"
}
JSON
```

#### API-060

`POST /V1/sessions/verify_number_login_v1` — First name, Email, Phone number.

Source: [app/controllers/v1/sessions_controller.rb](../app/controllers/v1/sessions_controller.rb); [route](../config/routes.rb#L160).

Obtain a fresh OTP through login_with_phone_number first. The phone PII write occurs only for a newly created User, not every returning login.

```bash
curl -i --request POST "${BASE_URL}/V1/sessions/verify_number_login_v1" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "phone_code_id": "$PHONE_CODE_ID",
  "mobile_number": "1012345678",
  "otp": "$OTP"
}
JSON
```

#### API-061

`POST /V1/sessions/submit_profile_web` — First name, Email.

Source: [app/controllers/v1/sessions_controller.rb](../app/controllers/v1/sessions_controller.rb); [route](../config/routes.rb#L161).

This is /V1/sessions/submit_profile_web. It only enters the new-profile branch if the user has no profile; receiver_profile must identify an eligible invitation target.

```bash
curl -i --request POST "${BASE_URL}/V1/sessions/submit_profile_web" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "data": {
    "general_information": {
      "first_name": "Asha",
      "personal_email": "asha@example.com",
      "gender": "Female",
      "date_of_birth_v1": "1996-01-15",
      "faith": {
        "id": "$FAITH_ID"
      },
      "mother_tongue": {
        "id": "$LANGUAGE_ID"
      },
      "height": 65
    },
    "relationship_goal": {
      "id": "$RELATIONSHIP_GOAL_ID"
    },
    "photos": [],
    "preferences": [],
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  "receiver_profile": "$OTHER_REF"
}
JSON
```

#### API-062

`POST /V1/sessions/fetch_login_response` — First name, Email.

Source: [app/controllers/v1/sessions_controller.rb](../app/controllers/v1/sessions_controller.rb); [route](../config/routes.rb#L164).

```bash
curl -i --request POST "${BASE_URL}/V1/sessions/fetch_login_response" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "$USER_ID",
  "is_new_user": false
}
JSON
```

#### API-063

`GET /V1/list_connected_profiles` — First name, Phone number.

Source: [app/controllers/v1/messages_controller.rb](../app/controllers/v1/messages_controller.rb); [route](../config/routes.rb#L173).

Phone impact is the is_test_user? branch; phone is not added to other members' response fields.

```bash
curl -i --request GET "${BASE_URL}/V1/list_connected_profiles" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-064

`POST /V1/connect_linked_users` — First name.

Source: [app/controllers/v1/messages_controller.rb](../app/controllers/v1/messages_controller.rb); [route](../config/routes.rb#L176).

```bash
curl -i --request POST "${BASE_URL}/V1/connect_linked_users" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "conversation_id": "$CONVERSATION_ID"
}
JSON
```

#### API-065

`POST /V1/messages/generate_agora_token` — First name.

Source: [app/controllers/v1/messages_controller.rb](../app/controllers/v1/messages_controller.rb); [route](../config/routes.rb#L177).

```bash
curl -i --request POST "${BASE_URL}/V1/messages/generate_agora_token" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF"
}
JSON
```

#### API-066

`POST /V1/messages/unlock_video_call` — First name.

Source: [app/controllers/v1/messages_controller.rb](../app/controllers/v1/messages_controller.rb); [route](../config/routes.rb#L181).

```bash
curl -i --request POST "${BASE_URL}/V1/messages/unlock_video_call" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "conversation_id": "$CONVERSATION_ID"
}
JSON
```

#### API-067

`GET /V1/messages/can_video_call` — First name.

Source: [app/controllers/v1/messages_controller.rb](../app/controllers/v1/messages_controller.rb); [route](../config/routes.rb#L183).

```bash
curl -i --request GET "${BASE_URL}/V1/messages/can_video_call" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "conversation_id=$CONVERSATION_ID"
```

#### API-068

`GET /V1/combined_messages_hidden_list` — First name, Phone number.

Source: [app/controllers/v1/messages_controller.rb](../app/controllers/v1/messages_controller.rb); [route](../config/routes.rb#L184).

Phone impact is the is_test_user? branch; phone is not added to other members' response fields.

```bash
curl -i --request GET "${BASE_URL}/V1/combined_messages_hidden_list" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-069

`POST /V1/chat/chat_messages` — First name.

Source: [app/controllers/v1/messages_controller.rb](../app/controllers/v1/messages_controller.rb); [route](../config/routes.rb#L188).

```bash
curl -i --request POST "${BASE_URL}/V1/chat/chat_messages" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "conversation_id": "$CONVERSATION_ID",
  "page": 1,
  "created_at": "2026-10-16T00:00:00Z"
}
JSON
```

#### API-070

`POST /V1/payment/verify_razorpay_payment_v1` — First name.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L199).

```bash
curl -i --request POST "${BASE_URL}/V1/payment/verify_razorpay_payment_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "payment_id": "$PAYMENT_ID"
}
JSON
```

#### API-071

`POST /V1/payment/verify_ios_payment_v1` — First name.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L208).

```bash
curl -i --request POST "${BASE_URL}/V1/payment/verify_ios_payment_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "productId": "$PRODUCT_ID",
  "receiptdata": "$APPLE_RECEIPT"
}
JSON
```

#### API-072

`POST /V1/payment/verify_paytm_payment_v1` — First name.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L210).

```bash
curl -i --request POST "${BASE_URL}/V1/payment/verify_paytm_payment_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "STATUS": "TXN_SUCCESS",
  "ORDERID": "$ORDER_ID",
  "TXNAMOUNT": "$PAYMENT_AMOUNT",
  "CHECKSUMHASH": "$PAYTM_CHECKSUM",
  "RESPMSG": "Txn Success"
}
JSON
```

#### API-073

`POST /V1/payment/get_cashfree_request_params` — First name, Email, Phone number.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L211).

Uses a Cashfree-compatible plan. First name, email and full phone are read from the profile for the provider customer payload; do not pass them as replacement request fields.

```bash
curl -i --request POST "${BASE_URL}/V1/payment/get_cashfree_request_params" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "conversation_id": "$CONVERSATION_ID",
  "external_transaction_token": "$TRANSACTION_TOKEN"
}
JSON
```

#### API-074

`POST /V1/payment/get_cashfree_web_request_params` — First name, Email, Phone number.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L213).

```bash
curl -i --request POST "${BASE_URL}/V1/payment/get_cashfree_web_request_params" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "return_url": "https://example.com/payment-return"
}
JSON
```

#### API-075

`POST /V1/payment/verify_cashfree_payment` — First name.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L215).

```bash
curl -i --request POST "${BASE_URL}/V1/payment/verify_cashfree_payment" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "order_id": "$ORDER_ID"
}
JSON
```

#### API-076

`POST /V1/payment/get_payu_request_params` — First name, Email, Phone number.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L220).

The key is id, not plan_id. PII-derived name/email also participate in PayU hash generation.

```bash
curl -i --request POST "${BASE_URL}/V1/payment/get_payu_request_params" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "id": "$PLAN_ID"
}
JSON
```

#### API-077

`POST /V1/payment/send_collect_request` — First name, Email, Phone number.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L226).

```bash
curl -i --request POST "${BASE_URL}/V1/payment/send_collect_request" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "vpa": "synthetic@upi"
}
JSON
```

#### API-078

`POST /V1/payment/get_payment_link` — First name, Email, Phone number.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L227).

```bash
curl -i --request POST "${BASE_URL}/V1/payment/get_payment_link" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "ruser": false
}
JSON
```

#### API-080

`POST /V1/payment/phone_pay/mandate_create_callback` — First name.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L236).

Use the original provider callback response and its matching X-VERIFY value. A successful mandate callback can activate a subscription and refresh the profile cache.

```bash
curl -i --request POST "${BASE_URL}/V1/payment/phone_pay/mandate_create_callback" \
  --header "X-VERIFY: ${PHONEPE_X_VERIFY}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "response": "$PHONEPE_RESPONSE_BASE64"
}
JSON
```

#### API-081

`POST /V1/payment/phone_pay/refund_callback` — First name.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L239).

Use the original refund callback and its matching X-VERIFY value. Duplicate-payment reconciliation may reactivate another subscription.

```bash
curl -i --request POST "${BASE_URL}/V1/payment/phone_pay/refund_callback" \
  --header "X-VERIFY: ${PHONEPE_X_VERIFY}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "response": "$PHONEPE_RESPONSE_BASE64"
}
JSON
```

#### API-082

`POST /V1/payment/phone_pay/one_time_payment_callback` — First name.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L240).

Use the original successful payment callback and its matching X-VERIFY value.

```bash
curl -i --request POST "${BASE_URL}/V1/payment/phone_pay/one_time_payment_callback" \
  --header "X-VERIFY: ${PHONEPE_X_VERIFY}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "response": "$PHONEPE_RESPONSE_BASE64"
}
JSON
```

#### API-085

`POST /V1/user/location` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L272).

```bash
curl -i --request POST "${BASE_URL}/V1/user/location" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "latitude": 12.9716,
  "longitude": 77.5946,
  "is_location_spoofed": false
}
JSON
```

#### API-086

`GET /V1/user/verify_user_v1` — First name.

Source: [app/controllers/v1/app_releases_controller.rb](../app/controllers/v1/app_releases_controller.rb); [route](../config/routes.rb#L275).

```bash
curl -i --request GET "${BASE_URL}/V1/user/verify_user_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}"
```

#### API-087

`POST /V1/user/verify_user_v1` — First name.

Source: [app/controllers/v1/app_releases_controller.rb](../app/controllers/v1/app_releases_controller.rb); [route](../config/routes.rb#L276).

```bash
curl -i --request POST "${BASE_URL}/V1/user/verify_user_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-088

`GET /V1/user/verify_user` — First name.

Source: [app/controllers/v1/app_releases_controller.rb](../app/controllers/v1/app_releases_controller.rb); [route](../config/routes.rb#L277).

```bash
curl -i --request GET "${BASE_URL}/V1/user/verify_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}"
```

#### API-089

`POST /V1/user/app_launch` — First name, Email.

Source: [app/controllers/v1/app_releases_controller.rb](../app/controllers/v1/app_releases_controller.rb); [route](../config/routes.rb#L278).

```bash
curl -i --request POST "${BASE_URL}/V1/user/app_launch" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-090

`POST /V1/images/upload_images_v2` — First name, Email.

Source: [app/controllers/v1/images_controller.rb](../app/controllers/v1/images_controller.rb); [route](../config/routes.rb#L282).

This route requires an image-inappropriate profile. Name/email impact can occur in the moderation path.

```bash
curl -i --request POST "${BASE_URL}/V1/images/upload_images_v2" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "images": [
    {
      "photo": "$PHOTO_URL_1",
      "photo_id": "$PHOTO_ID_1"
    },
    {
      "photo": "$PHOTO_URL_2",
      "photo_id": "$PHOTO_ID_2"
    }
  ]
}
JSON
```

#### API-091

`POST /V1/images/edit_images` — First name, Email, Phone number.

Source: [app/controllers/v1/images_controller.rb](../app/controllers/v1/images_controller.rb); [route](../config/routes.rb#L285).

```bash
curl -i --request POST "${BASE_URL}/V1/images/edit_images" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "photos": [
    {
      "photo": "$PHOTO_URL_1",
      "photo_id": "$PHOTO_ID_1",
      "status": "avatar"
    },
    {
      "photo": "$PHOTO_URL_2",
      "photo_id": "$PHOTO_ID_2"
    }
  ]
}
JSON
```

#### API-092

`POST /V1/subscription/verify_android_payments` — First name.

Source: [app/controllers/v1/subscription_controller.rb](../app/controllers/v1/subscription_controller.rb); [route](../config/routes.rb#L287).

```bash
curl -i --request POST "${BASE_URL}/V1/subscription/verify_android_payments" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "product_id": "$PRODUCT_ID",
  "purchase_token": "$PURCHASE_TOKEN"
}
JSON
```

#### API-093

`POST /V1/subscription/restore_android_subscription` — First name.

Source: [app/controllers/v1/subscription_controller.rb](../app/controllers/v1/subscription_controller.rb); [route](../config/routes.rb#L288).

```bash
curl -i --request POST "${BASE_URL}/V1/subscription/restore_android_subscription" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "product_id": "$PRODUCT_ID",
  "purchase_token": "$PURCHASE_TOKEN"
}
JSON
```

#### API-094

`POST /V1/payment/googleplay_webhook` — First name.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L289).

message.data is Base64 of the Google Real-time Developer Notification JSON for a genuine test purchase. Provider verification and matching purchase records are required to reach subscription activation.

```bash
curl -i --request POST "${BASE_URL}/V1/payment/googleplay_webhook" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "message": {
    "data": "$GOOGLE_RTDN_BASE64",
    "messageId": "$PUBSUB_MESSAGE_ID",
    "publishTime": "2026-10-16T00:00:00Z"
  },
  "subscription": "$PUBSUB_SUBSCRIPTION"
}
JSON
```

#### API-095

`POST /V1/payment/apple_webhook_v2` — First name.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L290).

signedPayload must be the genuine Apple server-notification JWS for a sandbox test transaction. An arbitrary JWT cannot exercise this flow.

```bash
curl -i --request POST "${BASE_URL}/V1/payment/apple_webhook_v2" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "signedPayload": "$APPLE_SIGNED_PAYLOAD"
}
JSON
```

#### API-096

`POST /V1/subscription/restore_ios_subscription_v1` — First name.

Source: [app/controllers/v1/subscription_controller.rb](../app/controllers/v1/subscription_controller.rb); [route](../config/routes.rb#L291).

```bash
curl -i --request POST "${BASE_URL}/V1/subscription/restore_ios_subscription_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "productId": "$PRODUCT_ID",
  "receiptdata": "$APPLE_RECEIPT"
}
JSON
```

#### API-097

`POST /V1/subscription/boost_profile` — First name.

Source: [app/controllers/v1/subscription_controller.rb](../app/controllers/v1/subscription_controller.rb); [route](../config/routes.rb#L292).

```bash
curl -i --request POST "${BASE_URL}/V1/subscription/boost_profile" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-098

`POST /V1/report` — First name.

Source: [app/controllers/v1/report_controller.rb](../app/controllers/v1/report_controller.rb); [route](../config/routes.rb#L296).

```bash
curl -i --request POST "${BASE_URL}/V1/report" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "report_option_id": "$REPORT_OPTION_ID",
  "message": "Synthetic moderation report",
  "tab_name": "discover"
}
JSON
```

#### API-099

`POST /V1/introduction/edit_icebreaker` — First name.

Source: [app/controllers/v1/introduction_controller.rb](../app/controllers/v1/introduction_controller.rb); [route](../config/routes.rb#L299).

```bash
curl -i --request POST "${BASE_URL}/V1/introduction/edit_icebreaker" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "icebreakers": [
    {
      "question_id": "$QUESTION_ID",
      "answer": "Synthetic answer"
    }
  ]
}
JSON
```

#### API-100

`POST /V1/introduction/edit_icebreaker_v1` — First name, Email, Phone number.

Source: [app/controllers/v1/introduction_controller.rb](../app/controllers/v1/introduction_controller.rb); [route](../config/routes.rb#L300).

```bash
curl -i --request POST "${BASE_URL}/V1/introduction/edit_icebreaker_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "question_id": "$QUESTION_ID",
  "answer": "Synthetic answer"
}
JSON
```

#### API-101

`GET /V1/speed_dating/event_info` — First name.

Source: [app/controllers/v1/speed_dating_controller.rb](../app/controllers/v1/speed_dating_controller.rb); [route](../config/routes.rb#L302).

```bash
curl -i --request GET "${BASE_URL}/V1/speed_dating/event_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "event_id=$EVENT_ID"
```

#### API-102

`POST /V1/speed_dating/book_event` — First name.

Source: [app/controllers/v1/speed_dating_controller.rb](../app/controllers/v1/speed_dating_controller.rb); [route](../config/routes.rb#L303).

Razorpay branch shown. If configured for Paytm, send ORDERID, STATUS, TXNAMOUNT, CHECKSUMHASH and RESPMSG from its verified callback instead.

```bash
curl -i --request POST "${BASE_URL}/V1/speed_dating/book_event" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "event_id": "$EVENT_ID",
  "payment_id": "$PAYMENT_ID"
}
JSON
```

#### API-103

`POST /V1/speed_dating/give_feedback` — First name, Phone number.

Source: [app/controllers/v1/speed_dating_controller.rb](../app/controllers/v1/speed_dating_controller.rb); [route](../config/routes.rb#L304).

Requires a completed event and booked participants. Mutual likes create a connection and messages containing the PII-derived full phone numbers.

```bash
curl -i --request POST "${BASE_URL}/V1/speed_dating/give_feedback" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "event_id": "$EVENT_ID",
  "feedback_list": [
    {
      "ref": "$OTHER_REF",
      "option": "like"
    }
  ]
}
JSON
```

#### API-104

`POST /V1/paint_bar_mixer/update_personal_details` — First name, Email, Phone number.

Source: [app/controllers/v1/speed_dating_controller.rb](../app/controllers/v1/speed_dating_controller.rb); [route](../config/routes.rb#L307).

For the paint_bar_mixer route, this creates a Cashfree order using the profile's PII fields; personal_details is stored separately. Requires a web token and a valid gender-specific mixer plan.

```bash
curl -i --request POST "${BASE_URL}/V1/paint_bar_mixer/update_personal_details" \
  --header "Authorization: Bearer ${WEB_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF",
  "personal_details": {
    "name": "Asha",
    "email": "asha@example.com",
    "phone_number": "+911012345678"
  }
}
JSON
```

#### API-105

`POST /V1/advertisement/vote` — First name.

Source: [app/controllers/v1/advertisement_controller.rb](../app/controllers/v1/advertisement_controller.rb); [route](../config/routes.rb#L309).

```bash
curl -i --request POST "${BASE_URL}/V1/advertisement/vote" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "option_id": "$POLL_OPTION_ID"
}
JSON
```

#### API-106

`GET /V1/advertisement/profiles_voted` — First name.

Source: [app/controllers/v1/advertisement_controller.rb](../app/controllers/v1/advertisement_controller.rb); [route](../config/routes.rb#L310).

```bash
curl -i --request GET "${BASE_URL}/V1/advertisement/profiles_voted" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-107

`GET /V1/live_audio` — First name.

Source: [app/controllers/v1/live_audio_controller.rb](../app/controllers/v1/live_audio_controller.rb); [route](../config/routes.rb#L312).

```bash
curl -i --request GET "${BASE_URL}/V1/live_audio" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "app_launch=false"
```

#### API-108

`POST /V1/live_audio/go_live` — First name.

Source: [app/controllers/v1/live_audio_controller.rb](../app/controllers/v1/live_audio_controller.rb); [route](../config/routes.rb#L313).

```bash
curl -i --request POST "${BASE_URL}/V1/live_audio/go_live" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "always_online_enable": false
}
JSON
```

#### API-109

`POST /V1/live_audio/join_room` — First name.

Source: [app/controllers/v1/live_audio_controller.rb](../app/controllers/v1/live_audio_controller.rb); [route](../config/routes.rb#L314).

```bash
curl -i --request POST "${BASE_URL}/V1/live_audio/join_room" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "room_id": "$ROOM_ID"
}
JSON
```

#### API-110

`POST /V1/live_audio/send_request_to_talk` — First name.

Source: [app/controllers/v1/live_audio_controller.rb](../app/controllers/v1/live_audio_controller.rb); [route](../config/routes.rb#L315).

```bash
curl -i --request POST "${BASE_URL}/V1/live_audio/send_request_to_talk" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "room_id": "$ROOM_ID"
}
JSON
```

#### API-111

`POST /V1/live_audio/switch_speaker` — First name.

Source: [app/controllers/v1/live_audio_controller.rb](../app/controllers/v1/live_audio_controller.rb); [route](../config/routes.rb#L316).

```bash
curl -i --request POST "${BASE_URL}/V1/live_audio/switch_speaker" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "room_id": "$ROOM_ID"
}
JSON
```

#### API-112

`POST /V1/live_audio/leave_room` — First name.

Source: [app/controllers/v1/live_audio_controller.rb](../app/controllers/v1/live_audio_controller.rb); [route](../config/routes.rb#L317).

```bash
curl -i --request POST "${BASE_URL}/V1/live_audio/leave_room" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "room_id": "$ROOM_ID"
}
JSON
```

#### API-113

`POST /V1/pusher_presence_webhook` — First name.

Source: [app/controllers/v1/live_audio_controller.rb](../app/controllers/v1/live_audio_controller.rb); [route](../config/routes.rb#L320).

Use the presence-event branch without Authorization; adding an app token selects Pusher channel authentication instead. A matching live room is required for the cache-update branch.

```bash
curl -i --request POST "${BASE_URL}/V1/pusher_presence_webhook" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "events": [
    {
      "channel": "presence-channel",
      "name": "member_removed",
      "user_id": "$USER_ID"
    }
  ]
}
JSON
```

#### API-114

`GET /V1/pusher_presence_webhook` — First name.

Source: [app/controllers/v1/live_audio_controller.rb](../app/controllers/v1/live_audio_controller.rb); [route](../config/routes.rb#L321).

Use the presence-event branch without Authorization; adding an app token selects Pusher channel authentication instead. A matching live room is required for the cache-update branch.

```bash
curl -i --request GET "${BASE_URL}/V1/pusher_presence_webhook" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "events[0][channel]=presence-channel" \
  --data-urlencode "events[0][name]=member_removed" \
  --data-urlencode "events[0][user_id]=$USER_ID"
```

#### API-115

`POST /V1/freebies/claim` — First name.

Source: [app/controllers/v1/freebie_controller.rb](../app/controllers/v1/freebie_controller.rb); [route](../config/routes.rb#L329).

```bash
curl -i --request POST "${BASE_URL}/V1/freebies/claim" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "freebie_type": "free_premium_female"
}
JSON
```

#### API-116

`GET /web/invites/all_requests` — First name, Phone number.

Source: [app/controllers/web/invites_controller.rb](../app/controllers/web/invites_controller.rb); [route](../config/routes.rb#L343).

```bash
curl -i --request GET "${BASE_URL}/web/invites/all_requests" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-117

`POST /web/invites/accept_request_v1` — First name.

Source: [app/controllers/web/invites_controller.rb](../app/controllers/web/invites_controller.rb); [route](../config/routes.rb#L344).

```bash
curl -i --request POST "${BASE_URL}/web/invites/accept_request_v1" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "id": "$REQUEST_ID",
  "invitation_type": "story",
  "message": "Hello"
}
JSON
```

#### API-118

`POST /web/invites/pass_request` — First name.

Source: [app/controllers/web/invites_controller.rb](../app/controllers/web/invites_controller.rb); [route](../config/routes.rb#L345).

```bash
curl -i --request POST "${BASE_URL}/web/invites/pass_request" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "id": "$REQUEST_ID",
  "invitation_type": "story"
}
JSON
```

#### API-119

`GET /web/users/profile_info` — First name.

Source: [app/controllers/web/users_controller.rb](../app/controllers/web/users_controller.rb); [route](../config/routes.rb#L350).

```bash
curl -i --request GET "${BASE_URL}/web/users/profile_info" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "ref=$OTHER_REF"
```

#### API-120

`GET /web/users/:ref` — First name.

Source: [app/controllers/web/users_controller.rb](../app/controllers/web/users_controller.rb); [route](../config/routes.rb#L351).

```bash
curl -i --request GET "${BASE_URL}/web/users/${REF}" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json"
```

#### API-121

`POST /web/users/about` — First name, Email, Phone number.

Source: [app/controllers/web/users_controller.rb](../app/controllers/web/users_controller.rb); [route](../config/routes.rb#L352).

```bash
curl -i --request POST "${BASE_URL}/web/users/about" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "about": "Synthetic profile story for PII regression testing."
}
JSON
```

#### API-122

`POST /web/users/update_settings` — First name.

Source: [app/controllers/web/users_controller.rb](../app/controllers/web/users_controller.rb); [route](../config/routes.rb#L353).

```bash
curl -i --request POST "${BASE_URL}/web/users/update_settings" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "age_from": 25,
  "age_to": 35
}
JSON
```

#### API-123

`POST /web/users/deactivate_user` — First name.

Source: [app/controllers/web/users_controller.rb](../app/controllers/web/users_controller.rb); [route](../config/routes.rb#L354).

```bash
curl -i --request POST "${BASE_URL}/web/users/deactivate_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-124

`POST /web/users/activate_user` — First name.

Source: [app/controllers/web/users_controller.rb](../app/controllers/web/users_controller.rb); [route](../config/routes.rb#L355).

```bash
curl -i --request POST "${BASE_URL}/web/users/activate_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{}
JSON
```

#### API-125

`POST /web/like` — First name.

Source: [app/controllers/web/like_controller.rb](../app/controllers/web/like_controller.rb); [route](../config/routes.rb#L358).

```bash
curl -i --request POST "${BASE_URL}/web/like" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF"
}
JSON
```

#### API-126

`GET /web/list_likes_received` — First name.

Source: [app/controllers/web/like_controller.rb](../app/controllers/web/like_controller.rb); [route](../config/routes.rb#L359).

```bash
curl -i --request GET "${BASE_URL}/web/list_likes_received" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "items_per_page=10"
```

#### API-127

`POST /web/pass_user` — First name.

Source: [app/controllers/web/like_controller.rb](../app/controllers/web/like_controller.rb); [route](../config/routes.rb#L360).

```bash
curl -i --request POST "${BASE_URL}/web/pass_user" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

#### API-128

`POST /web/like_back` — First name.

Source: [app/controllers/web/like_controller.rb](../app/controllers/web/like_controller.rb); [route](../config/routes.rb#L361).

```bash
curl -i --request POST "${BASE_URL}/web/like_back" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "tab_name": "discover"
}
JSON
```

#### API-129

`POST /web/user/update` — First name, Email.

Source: [app/controllers/web/sessions_controller.rb](../app/controllers/web/sessions_controller.rb); [route](../config/routes.rb#L365).

Onboarding writes first name and email only when their existing values are missing. Use an onboarding user and valid field IDs and uploaded photos. The web controller also uses this shared submit flow.

```bash
curl -i --request POST "${BASE_URL}/web/user/update" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "data": {
    "general_information": {
      "first_name": "Asha",
      "personal_email": "asha@example.com",
      "gender": "Female",
      "date_of_birth_v1": "1996-01-15",
      "faith": {
        "id": "$FAITH_ID"
      },
      "mother_tongue": {
        "id": "$LANGUAGE_ID"
      },
      "height": 65
    },
    "relationship_goal": {
      "id": "$RELATIONSHIP_GOAL_ID"
    },
    "photos": [
      {
        "photo": "$PHOTO_URL_1"
      },
      {
        "photo": "$PHOTO_URL_2"
      }
    ],
    "preferences": [],
    "latitude": 12.9716,
    "longitude": 77.5946
  }
}
JSON
```

#### API-130

`POST /web/user/edit` — First name, Email, Phone number.

Source: [app/controllers/web/users_controller.rb](../app/controllers/web/users_controller.rb); [route](../config/routes.rb#L366).

Use the current complete editable payload when testing an existing profile: omitted work, traits, interests or audio fields can be cleared by edit_profile_details. personal_email in this body does not update email; this edit path changes the name and returns the existing email and phone.

```bash
curl -i --request POST "${BASE_URL}/web/user/edit" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "data": {
    "general_information": {
      "first_name": "Asha"
    },
    "photos": [
      {
        "photo": "$PHOTO_URL_1",
        "photo_id": "$PHOTO_ID_1",
        "status": "avatar"
      },
      {
        "photo": "$PHOTO_URL_2",
        "photo_id": "$PHOTO_ID_2"
      }
    ],
    "user_traits": [
      {
        "trait_id": "$TRAIT_ID"
      }
    ],
    "user_interests_v2": [
      {
        "interest_id": "$INTEREST_V2_ID"
      }
    ],
    "preferences": [],
    "partial_work": {
      "work_title": "Engineer",
      "industry": "Technology",
      "college": "Example College",
      "graduation_year": "2018"
    },
    "audio_prompt": {
      "question_id": "$AUDIO_QUESTION_ID",
      "audio_url": "$AUDIO_URL"
    }
  }
}
JSON
```

#### API-131

`POST /web/user/delete` — First name, Email.

Source: [app/controllers/web/sessions_controller.rb](../app/controllers/web/sessions_controller.rb); [route](../config/routes.rb#L367).

Deletion uses PII names/emails in its downstream account cleanup payload. Run only for a disposable test account.

```bash
curl -i --request POST "${BASE_URL}/web/user/delete" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "reason_id": "$DELETE_REASON_ID",
  "note": "Synthetic PII regression account"
}
JSON
```

#### API-132

`POST /web/connect_linked_users` — First name.

Source: [app/controllers/web/messages_controller.rb](../app/controllers/web/messages_controller.rb); [route](../config/routes.rb#L377).

```bash
curl -i --request POST "${BASE_URL}/web/connect_linked_users" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "conversation_id": "$CONVERSATION_ID"
}
JSON
```

#### API-133

`POST /web/payment/verify_razorpay_payment` — First name.

Source: [app/controllers/web/payment_controller.rb](../app/controllers/web/payment_controller.rb); [route](../config/routes.rb#L384).

```bash
curl -i --request POST "${BASE_URL}/web/payment/verify_razorpay_payment" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "payment_id": "$PAYMENT_ID"
}
JSON
```

#### API-134

`POST /web/user/location` — First name.

Source: [app/controllers/web/users_controller.rb](../app/controllers/web/users_controller.rb); [route](../config/routes.rb#L388).

```bash
curl -i --request POST "${BASE_URL}/web/user/location" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "latitude": 12.9716,
  "longitude": 77.5946,
  "is_location_spoofed": false
}
JSON
```

#### API-135

`POST /web/report` — First name.

Source: [app/controllers/web/report_controller.rb](../app/controllers/web/report_controller.rb); [route](../config/routes.rb#L397).

```bash
curl -i --request POST "${BASE_URL}/web/report" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "report_option_id": "$REPORT_OPTION_ID",
  "message": "Synthetic moderation report",
  "tab_name": "discover"
}
JSON
```

#### API-136

`GET /users/:ref` — First name, Email, Phone number.

Source: [app/controllers/users_controller.rb](../app/controllers/users_controller.rb); [route](../config/routes.rb#L418).

```bash
curl -i --request GET "${BASE_URL}/users/${REF}" \
  --cookie "${ADMIN_SESSION_COOKIE}" \
  --header "Accept: application/json"
```

#### API-137

`POST /users/send_misuse_email` — First name, Email.

Source: [app/controllers/users_controller.rb](../app/controllers/users_controller.rb); [route](../config/routes.rb#L420).

Requires a logged-in admin browser session and a pending review with warning allowance.

```bash
curl -i --request POST "${BASE_URL}/users/send_misuse_email" \
  --cookie "${ADMIN_SESSION_COOKIE}" \
  --header "X-CSRF-Token: ${CSRF_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

#### API-138

`GET /admin/users/:ref` — First name, Email, Phone number.

Source: [app/controllers/admin/pending_controller.rb](../app/controllers/admin/pending_controller.rb); [route](../config/routes.rb#L569).

```bash
curl -i --request GET "${BASE_URL}/admin/users/${REF}" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json"
```

#### API-139

`POST /admin/approve_and_edit` — First name.

Source: [app/controllers/admin/pending_controller.rb](../app/controllers/admin/pending_controller.rb); [route](../config/routes.rb#L570).

Non-associate admin access is required for first-name edits. The separate local phone update does not write PHONE PII; see migration gaps.

```bash
curl -i --request POST "${BASE_URL}/admin/approve_and_edit" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF",
  "first_name": "Asha",
  "gender": "Female",
  "photos": [
    {
      "photo": "$PHOTO_URL_1",
      "photo_id": "$PHOTO_ID_1",
      "can_save": true
    },
    {
      "photo": "$PHOTO_URL_2",
      "photo_id": "$PHOTO_ID_2",
      "can_save": true
    }
  ],
  "date_of_birth": "1996-01-15",
  "phone_code_id": "$PHONE_CODE_ID",
  "fetch_only_number": "1012345678",
  "about": "Synthetic profile story"
}
JSON
```

#### API-140

`POST /admin/update_profile` — First name.

Source: [app/controllers/admin/updated_controller.rb](../app/controllers/admin/updated_controller.rb); [route](../config/routes.rb#L571).

Non-associate admin access is required for first-name edits. The separate local phone update does not write PHONE PII; see migration gaps.

```bash
curl -i --request POST "${BASE_URL}/admin/update_profile" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF",
  "first_name": "Asha",
  "gender": "Female",
  "photos": [
    {
      "photo": "$PHOTO_URL_1",
      "photo_id": "$PHOTO_ID_1",
      "can_save": true
    },
    {
      "photo": "$PHOTO_URL_2",
      "photo_id": "$PHOTO_ID_2",
      "can_save": true
    }
  ],
  "date_of_birth": "1996-01-15",
  "phone_code_id": "$PHONE_CODE_ID",
  "fetch_only_number": "1012345678",
  "about": "Synthetic profile story"
}
JSON
```

#### API-141

`POST /admin/disapprove` — First name.

Source: [app/controllers/admin/pending_controller.rb](../app/controllers/admin/pending_controller.rb); [route](../config/routes.rb#L572).

```bash
curl -i --request POST "${BASE_URL}/admin/disapprove" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF",
  "isSuspicious": false
}
JSON
```

#### API-142

`GET /admin/pending/curation_tab` — First name.

Source: [app/controllers/admin/pending_controller.rb](../app/controllers/admin/pending_controller.rb); [route](../config/routes.rb#L573).

```bash
curl -i --request GET "${BASE_URL}/admin/pending/curation_tab" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

#### API-143

`GET /admin/pending/vip_tab` — First name.

Source: [app/controllers/admin/pending_controller.rb](../app/controllers/admin/pending_controller.rb); [route](../config/routes.rb#L574).

```bash
curl -i --request GET "${BASE_URL}/admin/pending/vip_tab" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

#### API-144

`GET /admin/pending/people_hni_tab` — First name.

Source: [app/controllers/admin/pending_controller.rb](../app/controllers/admin/pending_controller.rb); [route](../config/routes.rb#L575).

```bash
curl -i --request GET "${BASE_URL}/admin/pending/people_hni_tab" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

#### API-145

`POST /admin/pending/people_hni_tab` — First name.

Source: [app/controllers/admin/pending_controller.rb](../app/controllers/admin/pending_controller.rb); [route](../config/routes.rb#L576).

Curation/VIP batch writes are processed asynchronously by Admin::Curation. HNI updates are immediate. Select a profile in the corresponding queue.

```bash
curl -i --request POST "${BASE_URL}/admin/pending/people_hni_tab" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "photos": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "disapprove": [],
  "inappropriate": [],
  "banned": [],
  "page": 1
}
JSON
```

#### API-146

`POST /admin/pending/curation_tab_update_profiles_state` — First name.

Source: [app/controllers/admin/pending_controller.rb](../app/controllers/admin/pending_controller.rb); [route](../config/routes.rb#L577).

Curation/VIP batch writes are processed asynchronously by Admin::Curation. HNI updates are immediate. Select a profile in the corresponding queue.

```bash
curl -i --request POST "${BASE_URL}/admin/pending/curation_tab_update_profiles_state" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "photos": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "disapprove": [],
  "inappropriate": [],
  "banned": [],
  "page": 1
}
JSON
```

#### API-147

`POST /admin/pending/vip_tab_update_profiles_state` — First name.

Source: [app/controllers/admin/pending_controller.rb](../app/controllers/admin/pending_controller.rb); [route](../config/routes.rb#L580).

Curation/VIP batch writes are processed asynchronously by Admin::Curation. HNI updates are immediate. Select a profile in the corresponding queue.

```bash
curl -i --request POST "${BASE_URL}/admin/pending/vip_tab_update_profiles_state" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "photos": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "disapprove": [],
  "inappropriate": [],
  "banned": [],
  "page": 1
}
JSON
```

#### API-148

`GET /admin/images/list_multiple_profiles_v1` — First name.

Source: [app/controllers/admin/images_controller.rb](../app/controllers/admin/images_controller.rb); [route](../config/routes.rb#L585).

```bash
curl -i --request GET "${BASE_URL}/admin/images/list_multiple_profiles_v1" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

#### API-149

`POST /admin/images/images_updates_tab` — First name.

Source: [app/controllers/admin/images_controller.rb](../app/controllers/admin/images_controller.rb); [route](../config/routes.rb#L586).

First-name changes in approve/reject items require gender to be supplied as well. auto_updates_images_update forces tab=auto_updates_images.

```bash
curl -i --request POST "${BASE_URL}/admin/images/images_updates_tab" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "tab": "updates",
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "updated_images": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "reject": [],
  "banned": [],
  "inappropriate": [],
  "page": 1
}
JSON
```

#### API-150

`GET /admin/images/list_auto_updates_images` — First name.

Source: [app/controllers/admin/images_controller.rb](../app/controllers/admin/images_controller.rb); [route](../config/routes.rb#L587).

```bash
curl -i --request GET "${BASE_URL}/admin/images/list_auto_updates_images" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

#### API-151

`POST /admin/images/auto_updates_images_update` — First name.

Source: [app/controllers/admin/images_controller.rb](../app/controllers/admin/images_controller.rb); [route](../config/routes.rb#L588).

First-name changes in approve/reject items require gender to be supplied as well. auto_updates_images_update forces tab=auto_updates_images.

```bash
curl -i --request POST "${BASE_URL}/admin/images/auto_updates_images_update" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "tab": "updates",
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "updated_images": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "reject": [],
  "banned": [],
  "inappropriate": [],
  "page": 1
}
JSON
```

#### API-152

`GET /admin/images/list_multiple_profiles_disapproved_v1` — First name.

Source: [app/controllers/admin/images_controller.rb](../app/controllers/admin/images_controller.rb); [route](../config/routes.rb#L590).

```bash
curl -i --request GET "${BASE_URL}/admin/images/list_multiple_profiles_disapproved_v1" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

#### API-153

`POST /admin/images/approve_reject_multiple_photos_v1` — First name.

Source: [app/controllers/admin/images_controller.rb](../app/controllers/admin/images_controller.rb); [route](../config/routes.rb#L591).

First-name changes in approve/reject items require gender to be supplied as well. auto_updates_images_update forces tab=auto_updates_images.

```bash
curl -i --request POST "${BASE_URL}/admin/images/approve_reject_multiple_photos_v1" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "tab": "updates",
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "updated_images": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "reject": [],
  "banned": [],
  "inappropriate": [],
  "page": 1
}
JSON
```

#### API-154

`POST /admin/images/approve_reject_multiple_photos_disapproved` — First name.

Source: [app/controllers/admin/images_controller.rb](../app/controllers/admin/images_controller.rb); [route](../config/routes.rb#L592).

First-name changes in approve/reject items require gender to be supplied as well. auto_updates_images_update forces tab=auto_updates_images.

```bash
curl -i --request POST "${BASE_URL}/admin/images/approve_reject_multiple_photos_disapproved" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "tab": "updates",
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "updated_images": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "reject": [],
  "banned": [],
  "inappropriate": [],
  "page": 1
}
JSON
```

#### API-155

`POST /admin/images/mark_selfie_verified` — First name.

Source: [app/controllers/admin/images_controller.rb](../app/controllers/admin/images_controller.rb); [route](../config/routes.rb#L593).

```bash
curl -i --request POST "${BASE_URL}/admin/images/mark_selfie_verified" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

#### API-156

`GET /admin/reviews/list_multiple` — First name.

Source: [app/controllers/admin/reviews_controller.rb](../app/controllers/admin/reviews_controller.rb); [route](../config/routes.rb#L600).

```bash
curl -i --request GET "${BASE_URL}/admin/reviews/list_multiple" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "message_type=story"
```

#### API-157

`GET /admin/reviews/fetch_individual` — First name, Phone number.

Source: [app/controllers/admin/reviews_controller.rb](../app/controllers/admin/reviews_controller.rb); [route](../config/routes.rb#L601).

```bash
curl -i --request GET "${BASE_URL}/admin/reviews/fetch_individual" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "message_type=story"
```

#### API-158

`POST /admin/reviews/update_multiple` — First name, Email.

Source: [app/controllers/admin/reviews_controller.rb](../app/controllers/admin/reviews_controller.rb); [route](../config/routes.rb#L602).

```bash
curl -i --request POST "${BASE_URL}/admin/reviews/update_multiple" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "profile_data_update_list": [
    {
      "review_id": "$REVIEW_ID",
      "text": "Synthetic corrected story",
      "send_email": true
    }
  ],
  "dismissed": []
}
JSON
```

#### API-159

`POST /admin/reviews/save` — First name, Email.

Source: [app/controllers/admin/reviews_controller.rb](../app/controllers/admin/reviews_controller.rb); [route](../config/routes.rb#L605).

```bash
curl -i --request POST "${BASE_URL}/admin/reviews/save" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "review_id": "$REVIEW_ID",
  "text": "Synthetic corrected story",
  "send_email": true
}
JSON
```

#### API-160

`GET /admin/member/search` — First name, Email, Phone number.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L607).

Filters combine. First-name and email search use PII service search; phone search still uses local SQL. Run each filter separately as well as combined.

```bash
curl -i --request GET "${BASE_URL}/admin/member/search" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "first_name=Asha" \
  --data-urlencode "email=asha@example.com" \
  --data-urlencode "phone_number=1012345678" \
  --data-urlencode "page=1"
```

#### API-161

`GET /admin/member/aws_moderated_list` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L608).

```bash
curl -i --request GET "${BASE_URL}/admin/member/aws_moderated_list" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

#### API-162

`GET /admin/member/feed` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L609).

```bash
curl -i --request GET "${BASE_URL}/admin/member/feed" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "type=auto_curate"
```

#### API-163

`GET /admin/member/fetch_complete_info` — First name, Email, Phone number.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L610).

```bash
curl -i --request GET "${BASE_URL}/admin/member/fetch_complete_info" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "ref=$REF" \
  --data-urlencode "page=1"
```

#### API-164

`GET /admin/member/fetch_bait_profile_info` — First name, Email, Phone number.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L615).

Returns the latest interaction feed; ref is not a filter for this action.

```bash
curl -i --request GET "${BASE_URL}/admin/member/fetch_bait_profile_info" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "state=pending" \
  --data-urlencode "page=1"
```

#### API-165

`GET /admin/member/fetch_connected_profiles` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L616).

```bash
curl -i --request GET "${BASE_URL}/admin/member/fetch_connected_profiles" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "ref=$REF" \
  --data-urlencode "page=1"
```

#### API-166

`GET /admin/member/user_activity_v1` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L617).

Repeat for likes_received, likes_passed, likes_linked, likes_connection, replies_sent, invites_sent, replies_received, invites_received, replies_linked, replies_connection, blocked_by, blocked_self, reports, invites_sent_accepted, invites_received_accepted, invites_sent_passed, invites_received_passed, user_passed.

```bash
curl -i --request GET "${BASE_URL}/admin/member/user_activity_v1" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "ref=$REF" \
  --data-urlencode "filter=likes_sent" \
  --data-urlencode "page=1"
```

#### API-167

`POST /admin/members/ban_profile` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L619).

```bash
curl -i --request POST "${BASE_URL}/admin/members/ban_profile" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF",
  "reason": "Synthetic moderation test"
}
JSON
```

#### API-168

`POST /admin/members/inappropriate_profile` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L620).

```bash
curl -i --request POST "${BASE_URL}/admin/members/inappropriate_profile" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

#### API-169

`POST /admin/members/review_update` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L621).

The changed name access is in conditional profile-save/image-cache side effects.

```bash
curl -i --request POST "${BASE_URL}/admin/members/review_update" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "review_failed_refs": [],
  "review_passed_refs": [
    "$REF"
  ],
  "image_updates": []
}
JSON
```

#### API-170

`GET /admin/members/autofeed` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L622).

```bash
curl -i --request GET "${BASE_URL}/admin/members/autofeed" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "profile_state=approved"
```

#### API-171

`GET /admin/members/retry_curation_bucket_list` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L624).

```bash
curl -i --request GET "${BASE_URL}/admin/members/retry_curation_bucket_list" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

#### API-172

`GET /admin/members/fetch_verified_profile` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L625).

```bash
curl -i --request GET "${BASE_URL}/admin/members/fetch_verified_profile" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

#### API-173

`POST /admin/members/update_verified_profile` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L626).

```bash
curl -i --request POST "${BASE_URL}/admin/members/update_verified_profile" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "approve": [
    "$REF"
  ],
  "disapprove": [],
  "ban": [],
  "page": 1
}
JSON
```

#### API-174

`POST /admin/members/refund_payment` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L628).

```bash
curl -i --request POST "${BASE_URL}/admin/members/refund_payment" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "otp": "$ADMIN_OTP",
  "order_id": "$ORDER_ID",
  "payment_gateway": "$PAYMENT_GATEWAY_ENUM",
  "is_partial_refund": false,
  "refund_reason": "Synthetic test refund"
}
JSON
```

#### API-175

`POST /admin/members/toggle_subscription` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L631).

end_date is required when enabling an inactive subscription. Toggling an active subscription removes it.

```bash
curl -i --request POST "${BASE_URL}/admin/members/toggle_subscription" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "id": "$SUBSCRIPTION_ID",
  "end_date": "31/12/2026"
}
JSON
```

#### API-176

`POST /admin/members/capture_payment` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L633).

```bash
curl -i --request POST "${BASE_URL}/admin/members/capture_payment" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

#### API-177

`POST /admin/members/correct_profile_location` — First name, Email, Phone number.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L634).

The server recalculates the location; this action does not consume caller-supplied latitude/longitude.

```bash
curl -i --request POST "${BASE_URL}/admin/members/correct_profile_location" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

#### API-178

`GET /admin/members/search_profiles` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L636).

```bash
curl -i --request GET "${BASE_URL}/admin/members/search_profiles" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "first_name=Asha" \
  --data-urlencode "page=1"
```

#### API-179

`GET /admin/members/download_profile_details` — First name, Email, Phone number.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L637).

```bash
curl -i --request GET "${BASE_URL}/admin/members/download_profile_details" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "ref=$REF" \
  --data-urlencode "page=1"
```

#### API-180

`POST /admin/members/approve_disapprove_banned_profiles` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L639).

Use type=auto_curate to exercise the changed first-name assignment in the auto-curated batch path. Test approve, disapprove, inappropriate and editedImages with separate profiles.

```bash
curl -i --request POST "${BASE_URL}/admin/members/approve_disapprove_banned_profiles" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "type": "auto_curate",
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "photos": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "disapprove": [],
  "inappropriate": [],
  "editedImages": [],
  "banned": [],
  "visible_refs": [],
  "moveToFeed": false
}
JSON
```

#### API-181

`GET /admin/connections/fetch_messages` — First name.

Source: [app/controllers/admin/connections_controller.rb](../app/controllers/admin/connections_controller.rb); [route](../config/routes.rb#L645).

```bash
curl -i --request GET "${BASE_URL}/admin/connections/fetch_messages" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "current_user_ref=$REF" \
  --data-urlencode "other_user_ref=$OTHER_REF" \
  --data-urlencode "page=1"
```

#### API-182

`POST /admin/payments/subscription_transfer` — First name.

Source: [app/controllers/admin/payments_controller.rb](../app/controllers/admin/payments_controller.rb); [route](../config/routes.rb#L650).

```bash
curl -i --request POST "${BASE_URL}/admin/payments/subscription_transfer" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "old_user_ref": "$REF",
  "new_user_ref": "$OTHER_REF"
}
JSON
```

#### API-183

`POST /admin/payments/capture_android_payment` — First name.

Source: [app/controllers/admin/payments_controller.rb](../app/controllers/admin/payments_controller.rb); [route](../config/routes.rb#L651).

```bash
curl -i --request POST "${BASE_URL}/admin/payments/capture_android_payment" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF",
  "product_id": "$PRODUCT_ID",
  "purchase_token": "$PURCHASE_TOKEN"
}
JSON
```

#### API-184

`GET /admin/stories` — First name, Email, Phone number.

Source: [app/controllers/admin/stories_controller.rb](../app/controllers/admin/stories_controller.rb); [route](../config/routes.rb#L661).

Deleted-account stories include name, email and full phone via profile helpers.

```bash
curl -i --request GET "${BASE_URL}/admin/stories" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

#### API-185

`GET /admin/reports` — First name.

Source: [app/controllers/admin/reports_controller.rb](../app/controllers/admin/reports_controller.rb); [route](../config/routes.rb#L662).

Reporter and reported-profile names use get_first_name.

```bash
curl -i --request GET "${BASE_URL}/admin/reports" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --get \
  --data-urlencode "page=1"
```

#### API-186

`GET /api/profile_data/:user_id` — First name.

Source: [app/controllers/api/external_controller.rb](../app/controllers/api/external_controller.rb); [route](../config/routes.rb#L672).

The response omits first name, but profile_details still hydrates it internally. Uses INFOEDGE_PROFILE_API_TOKEN.

```bash
curl -i --request GET "${BASE_URL}/api/profile_data/${USER_ID}" \
  --header "Authorization: Bearer ${INFOEDGE_PROFILE_API_TOKEN}" \
  --header "Accept: application/json"
```

#### API-187

`POST /V1/messages/send` — First name.

Source: [app/controllers/v1/messages_controller.rb](../app/controllers/v1/messages_controller.rb); [route](../config/routes.rb#L171).

Requires an existing active conversation. Message persistence runs on ChatMessageWorker; the sender name is used in downstream message/push payloads.

```bash
curl -i --request POST "${BASE_URL}/V1/messages/send" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "text": "Synthetic PII test message",
  "previous_message": "",
  "message_time_token": "$MESSAGE_TIME_TOKEN",
  "action_time_token": "$ACTION_TIME_TOKEN"
}
JSON
```

#### API-188

`POST /web/messages/send` — First name.

Source: [app/controllers/web/messages_controller.rb](../app/controllers/web/messages_controller.rb); [route](../config/routes.rb#L372).

Requires an existing active conversation.

```bash
curl -i --request POST "${BASE_URL}/web/messages/send" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$OTHER_REF",
  "text": "Synthetic PII test message"
}
JSON
```

#### API-189

`POST /V1/payment/get_cashfree_request_params_web` — First name, Email, Phone number.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L214).

Alias of get_cashfree_web_request_params with authenticate_web_token instead of the normal app-token path.

```bash
curl -i --request POST "${BASE_URL}/V1/payment/get_cashfree_request_params_web" \
  --header "Authorization: Bearer ${WEB_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "return_url": "https://example.com/payment-return"
}
JSON
```

#### API-190

`POST /V1/pii_integration/first_names/batch` — First name.

Source: [app/controllers/v1/pii_integration_controller.rb](../app/controllers/v1/pii_integration_controller.rb); [route](../config/routes.rb#L20).

```bash
curl -i --request POST "${BASE_URL}/V1/pii_integration/first_names/batch" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_ids": [
    "$USER_ID",
    "$OTHER_USER_ID"
  ]
}
JSON
```

#### API-191

`GET /V1/users/test_profile_list` — First name.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L16).

```bash
curl -i --request GET "${BASE_URL}/V1/users/test_profile_list" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json"
```

#### API-192

`GET /bangalore745/irl` — First name, Email, Phone number.

Source: [app/admin/irl.rb](../app/admin/irl.rb).

HTML ActiveAdmin page, not a JSON API. Requires a browser session with admin-level access.

```bash
curl -i --request GET "${BASE_URL}/bangalore745/irl" \
  --cookie "${ADMIN_SESSION_COOKIE}" \
  --header "Accept: text/html"
```

#### API-193

`POST /V1/payment/generate_qr_code` — First name, Email, Phone number.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L225).

```bash
curl -i --request POST "${BASE_URL}/V1/payment/generate_qr_code" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID"
}
JSON
```

#### API-195

`POST /V1/payment/verify_cashfree_payments_web` — First name.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L217).

```bash
curl -i --request POST "${BASE_URL}/V1/payment/verify_cashfree_payments_web" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "order_id": "$ORDER_ID"
}
JSON
```

#### API-196

`POST /V1/users/delete_older_account` — First name, Email.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L98).

```bash
curl -i --request POST "${BASE_URL}/V1/users/delete_older_account" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

#### API-197

`POST /V1/users/delete_current_account` — First name, Email.

Source: [app/controllers/v1/users_controller.rb](../app/controllers/v1/users_controller.rb); [route](../config/routes.rb#L99).

```bash
curl -i --request POST "${BASE_URL}/V1/users/delete_current_account" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "ref": "$REF"
}
JSON
```

#### API-198

`POST /V1/user/reset_profile` — First name.

Source: [app/controllers/v1/sessions_controller.rb](../app/controllers/v1/sessions_controller.rb); [route](../config/routes.rb#L156).

Copies compatibility fields to a new user/profile. It does not explicitly seed the new user's NAME, EMAIL or PHONE service rows; see migration gaps.

```bash
curl -i --request POST "${BASE_URL}/V1/user/reset_profile" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "reason_id": "$DELETE_REASON_ID",
  "note": "Synthetic account reset"
}
JSON
```

#### API-199

`POST /V1/api/v1/pii-test` — First name, Email, Phone number.

Source: [app/controllers/v1/pii_test_controller.rb](../app/controllers/v1/pii_test_controller.rb); [route](../config/routes.rb#L25).

Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "$USER_ID",
  "field": "NAME",
  "value": "Asha"
}
JSON
```

#### API-200

`POST /V1/api/v1/pii-test/read` — First name, Email, Phone number.

Source: [app/controllers/v1/pii_test_controller.rb](../app/controllers/v1/pii_test_controller.rb); [route](../config/routes.rb#L26).

Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test/read" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "$USER_ID",
  "field_names": [
    "NAME"
  ]
}
JSON
```

#### API-201

`POST /V1/api/v1/pii-test/batch/read` — First name, Email, Phone number.

Source: [app/controllers/v1/pii_test_controller.rb](../app/controllers/v1/pii_test_controller.rb); [route](../config/routes.rb#L27).

Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test/batch/read" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_ids": [
    "$USER_ID",
    "$OTHER_USER_ID"
  ],
  "fields": [
    "NAME"
  ]
}
JSON
```

#### API-202

`POST /V1/api/v1/pii-test/NAME/search` — First name.

Source: [config/routes.rb](../config/routes.rb).

Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test/NAME/search" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "value": "Asha",
  "limit": 10,
  "include_values": false
}
JSON
```

#### API-208

`POST /V1/pii_integration/profile_first_name_source` — First name.

Source: [app/controllers/v1/pii_integration_controller.rb](../app/controllers/v1/pii_integration_controller.rb); [route](../config/routes.rb#L22).

**Broken declaration:** `profile_first_name_source` is present in routes but absent from `V1::PiiIntegrationController`. A valid test token cannot make this route work. Do not use it as a successful PII smoke test. The diagnostic command below demonstrates the declared route only.

```bash
curl -i --request POST "${BASE_URL}/V1/pii_integration/profile_first_name_source" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Content-Type: application/json" \
  --data-binary '{}'
```

#### API-209

`POST /admin/members/autofeed_update` — First name.

Source: [app/controllers/admin/members_controller.rb](../app/controllers/admin/members_controller.rb); [route](../config/routes.rb#L623).

The controller normalizes approve/reject/inappropriate and forces type=auto_curate, moveToFeed=true. Repeat with reject and inappropriate decisions on separate profiles.

```bash
curl -i --request POST "${BASE_URL}/admin/members/autofeed_update" \
  --header "Authorization: Bearer ${ADMIN_TOKEN}" \
  --header "webcms: true" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "approve": [
    {
      "ref": "$REF",
      "first_name": "Asha",
      "gender": "Female",
      "photos": [
        {
          "photo": "$PHOTO_URL_1",
          "photo_id": "$PHOTO_ID_1",
          "can_save": true
        },
        {
          "photo": "$PHOTO_URL_2",
          "photo_id": "$PHOTO_ID_2",
          "can_save": true
        }
      ]
    }
  ],
  "reject": [],
  "inappropriate": [],
  "page": 1
}
JSON
```

### Email requests

#### API-203

`POST /V1/api/v1/pii-test/EMAIL/search` — Email.

Source: [config/routes.rb](../config/routes.rb).

Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test/EMAIL/search" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "value": "asha@example.com",
  "limit": 10,
  "include_values": false
}
JSON
```

#### API-199 with email

`POST /V1/api/v1/pii-test` using the email service field.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "$USER_ID",
  "field": "EMAIL",
  "value": "asha@example.com"
}
JSON
```

#### API-200 with email

`POST /V1/api/v1/pii-test/read` using the email service field.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test/read" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "$USER_ID",
  "field_names": [
    "EMAIL"
  ]
}
JSON
```

#### API-201 with email

`POST /V1/api/v1/pii-test/batch/read` using the email service field.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test/batch/read" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_ids": [
    "$USER_ID",
    "$OTHER_USER_ID"
  ],
  "fields": [
    "EMAIL"
  ]
}
JSON
```

Shared requests whose complete cURL appears in the first-name section:

[API-021](#api-021), [API-022](#api-022), [API-024](#api-024), [API-025](#api-025), [API-026](#api-026), [API-027](#api-027), [API-028](#api-028), [API-036](#api-036), [API-037](#api-037), [API-038](#api-038), [API-040](#api-040), [API-057](#api-057), [API-058](#api-058), [API-059](#api-059), [API-060](#api-060), [API-061](#api-061), [API-062](#api-062), [API-073](#api-073), [API-074](#api-074), [API-076](#api-076), [API-077](#api-077), [API-078](#api-078), [API-089](#api-089), [API-090](#api-090), [API-091](#api-091), [API-100](#api-100), [API-104](#api-104), [API-121](#api-121), [API-129](#api-129), [API-130](#api-130), [API-131](#api-131), [API-136](#api-136), [API-137](#api-137), [API-138](#api-138), [API-158](#api-158), [API-159](#api-159), [API-160](#api-160), [API-163](#api-163), [API-164](#api-164), [API-177](#api-177), [API-179](#api-179), [API-184](#api-184), [API-189](#api-189), [API-192](#api-192), [API-193](#api-193), [API-196](#api-196), [API-197](#api-197).

### Phone number requests

#### API-079

`POST /V1/payment/phone_pay/create_subscription` — Phone number.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L235).

```bash
curl -i --request POST "${BASE_URL}/V1/payment/phone_pay/create_subscription" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "phone_pe_flow": "collect",
  "vpa": "synthetic@upi",
  "bought_from": "discover",
  "is_upgrade": false,
  "discount_percentage": 0,
  "device_os": "ANDROID",
  "external_transaction_token": "$TRANSACTION_TOKEN"
}
JSON
```

#### API-083

`POST /V1/payment/phone_pay/one_time_payment` — Phone number.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L241).

```bash
curl -i --request POST "${BASE_URL}/V1/payment/phone_pay/one_time_payment" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "product_id": "$PRODUCT_ID",
  "bought_from": "discover",
  "vpa": "synthetic@upi",
  "discount_percentage": 0,
  "conversation_id": "$CONVERSATION_ID"
}
JSON
```

#### API-084

`POST /V1/payment/phone_pay/create_phone_pay_subscription_web` — Phone number.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L247).

```bash
curl -i --request POST "${BASE_URL}/V1/payment/phone_pay/create_phone_pay_subscription_web" \
  --header "Authorization: Bearer ${WEB_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "plan_id": "$PLAN_ID",
  "phone_pe_flow": "collect",
  "vpa": "synthetic@upi",
  "bought_from": "discover",
  "is_upgrade": false,
  "discount_percentage": 0,
  "device_os": "ANDROID",
  "external_transaction_token": "$TRANSACTION_TOKEN"
}
JSON
```

#### API-194

`POST /V1/payment/send_web_purchase_link` — Phone number.

Source: [app/controllers/v1/payment_controller.rb](../app/controllers/v1/payment_controller.rb); [route](../config/routes.rb#L228).

Use device_type=ios in the headers too. Requires an eligible male India iOS profile, no active subscription, and remaining SMS cooldown/daily allowance.

```bash
curl -i --request POST "${BASE_URL}/V1/payment/send_web_purchase_link" \
  --header "Authorization: Bearer ${USER_TOKEN}" \
  --header "Accept: application/json" \
  --header "device_type: ios" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "app_store": "India",
  "device_type": "ios",
  "trigger_type": "purchase"
}
JSON
```

#### API-204

`POST /V1/api/v1/pii-test/PHONE/search` — Phone number.

Source: [config/routes.rb](../config/routes.rb).

Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test/PHONE/search" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "value": "1012345678",
  "limit": 10,
  "include_values": false
}
JSON
```

#### API-205

`POST /V1/api/v1/pii-test/transient/phones` — Phone number.

Source: [app/controllers/v1/pii_test_controller.rb](../app/controllers/v1/pii_test_controller.rb); [route](../config/routes.rb#L29).

Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test/transient/phones" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "phone": "+911012345678",
  "ttl_seconds": 300
}
JSON
```

#### API-206

`POST /V1/api/v1/pii-test/transient/phones/resolve` — Phone number.

Source: [app/controllers/v1/pii_test_controller.rb](../app/controllers/v1/pii_test_controller.rb); [route](../config/routes.rb#L30).

Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test/transient/phones/resolve" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "transient_id": "$TRANSIENT_ID"
}
JSON
```

#### API-207

`POST /V1/api/v1/pii-test/transient/phones/promote` — Phone number.

Source: [app/controllers/v1/pii_test_controller.rb](../app/controllers/v1/pii_test_controller.rb); [route](../config/routes.rb#L31).

Proxy requests inject tenant_id on the server and bypass Rails model updates and FieldStore cache invalidation.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test/transient/phones/promote" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "transient_id": "$TRANSIENT_ID",
  "user_id": "$USER_ID"
}
JSON
```

#### API-199 with phone number

`POST /V1/api/v1/pii-test` using the phone number service field.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "$USER_ID",
  "field": "PHONE",
  "value": "1012345678"
}
JSON
```

#### API-200 with phone number

`POST /V1/api/v1/pii-test/read` using the phone number service field.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test/read" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_id": "$USER_ID",
  "field_names": [
    "PHONE"
  ]
}
JSON
```

#### API-201 with phone number

`POST /V1/api/v1/pii-test/batch/read` using the phone number service field.

```bash
curl -i --request POST "${BASE_URL}/V1/api/v1/pii-test/batch/read" \
  --header "Authorization: Bearer ${TEST_TOKEN}" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data-binary @- <<JSON
{
  "user_ids": [
    "$USER_ID",
    "$OTHER_USER_ID"
  ],
  "fields": [
    "PHONE"
  ]
}
JSON
```

Shared requests whose complete cURL appears in the first-name section:

[API-005](#api-005), [API-006](#api-006), [API-007](#api-007), [API-008](#api-008), [API-021](#api-021), [API-022](#api-022), [API-024](#api-024), [API-025](#api-025), [API-026](#api-026), [API-027](#api-027), [API-028](#api-028), [API-036](#api-036), [API-037](#api-037), [API-038](#api-038), [API-040](#api-040), [API-058](#api-058), [API-060](#api-060), [API-063](#api-063), [API-068](#api-068), [API-073](#api-073), [API-074](#api-074), [API-076](#api-076), [API-077](#api-077), [API-078](#api-078), [API-091](#api-091), [API-100](#api-100), [API-103](#api-103), [API-104](#api-104), [API-116](#api-116), [API-121](#api-121), [API-130](#api-130), [API-136](#api-136), [API-138](#api-138), [API-157](#api-157), [API-160](#api-160), [API-163](#api-163), [API-164](#api-164), [API-177](#api-177), [API-179](#api-179), [API-184](#api-184), [API-189](#api-189), [API-192](#api-192), [API-193](#api-193).

## Migration gaps and related routes

- `POST /V1/sessions/login_with_phone_number` requests an OTP using local number records. The new permanent `PHONE` write is in `POST /V1/sessions/verify_number_login_v1` when it creates a new user. Transient-phone proxy calls are independent of this normal login flow.
- `POST /admin/approve_and_edit` and `POST /admin/update_profile` accept `phone_code_id` and `fetch_only_number` for the existing local phone update. That path does not call the new PII phone writer. With remote phone reads enabled, the old remote value may continue to be displayed.
- `POST /V1/user/reset_profile` copies local profile attributes to a new user. It does not explicitly seed the new user's direct-field PII records. Test this separately before enabling remote reads for reset accounts.
- `/admin/member/search` first-name and email filters use service search even when model read gates are disabled. `/admin/members/search_profiles` still filters first name locally but uses the migrated name serializer for returned rows. Admin phone-number search still uses the local similar-number query. A `PHONE/search` proxy route does not mean normal member search has migrated.
- The older image list routes `/admin/images/list_multiple_profiles` and `/admin/images/list_multiple_profiles_disapproved` use image serializers without the changed direct first-name accessor. Their free-text image URL behavior is outside this three-field inventory. The `_v1` list routes above do use the changed name serializers.
- `/V1/event/update_personal_info` forwards caller-supplied event contact details to the companion service. `/V1/event/update_personal_details` uses event-order personal details. These should not be confused with `/V1/paint_bar_mixer/update_personal_details`, whose profile-based Cashfree creation reads the migrated fields.
- Readiness (`GET /V1/api/v1/pii-test/health/ready`) and the free-text key proxy routes do not operate on first name/email/phone. The [PII facade collection](pii-test-api-curl-collection.md) documents them separately. Chat content, story text and image URL encryption belong to the free-text migration, not an additional direct-field category.

### OTP prerequisite

This unchanged request obtains the OTP used by the affected verification endpoint. Do not substitute a country-code ID from another environment.

```bash
curl -i --request POST "${BASE_URL}/V1/sessions/login_with_phone_number" \
  --header "Content-Type: application/json" \
  --header "Accept: application/json" \
  --header "device_type: ${DEVICE_TYPE}" \
  --header "app_version: ${APP_VERSION}" \
  --header "unique_identifier: ${DEVICE_ID}" \
  --data-binary @- <<JSON
{
  "mobile_number": "1012345678",
  "phone_code_id": "${PHONE_CODE_ID}",
  "signature_v1": "${LOGIN_SIGNATURE_V1}"
}
JSON
```

For the documented non-production `+91` test-number shortcut, OTP `1234` works only under the conditions in [Service overview](architecture/service-overview.md#non-production-otp-verification). Otherwise use the delivered OTP.

## Background and operational changes

These changed consumers are not independent public APIs and therefore do not have invented cURL routes:

| Consumer | Migrated direct fields | Entry point or effect |
|---|---|---|
| `Mailchimp::Mailer`, `Notifier::EmailNotification` | Name, email | Account-deleted and moderation-warning email; scheduled web-purchase email |
| `SmsNotifierWorker` | Phone | `payment/send_web_purchase_link`; gated SMS delivery |
| `SmsNotification::PhoneNumber.send_sms_amazon_giftcard` | Phone | Gift-card SMS helper; no direct route declared for this helper |
| `SmsNotification::Track` | Phone | AWS delivery-report lookup |
| `Track::MarketingSignal::Base` | Name, email, phone | Export/report tasks |
| `Track::MetaEvent` | Name, email | Meta event hashing; its raw phone hashing line is still local |
| `Hive::Curator`, `Vertex::Curator` | Name, email | Scammer-name and email checks during moderation |
| `DeloitteExportInvoiceRetry` | Email | Invoice generation/retry email resolution |
| `PaintBarMixer` | Name, phone | Event confirmation SMS |
| `OfflineEvent::Order` | Email, phone | Profile-derived order-personal-details helper; not a new route |

## Verification checklist

1. Populate the PII service records for the synthetic accounts before enabling the three read gates. Repeat key reads with gates off and on.
2. Verify cold and warm caches for single-profile and bulk discovery/admin responses; include hidden-name profiles and multiple users.
3. Check service data and local compatibility data after onboarding, name edits and admin approval/rejection. Force a PII write failure to confirm the application's best-effort behavior.
4. Use the selected request branch and correct account state. For mutations, verify persisted changes; for callbacks/jobs, wait for the relevant worker and inspect its downstream result.
5. Exercise every admin user-activity filter listed beside its cURL, every admin batch action separately, and both app-token/web-token payment aliases.
6. Recheck admin phone edits and reset accounts against the migration gaps above.

The inventory and request envelopes were checked statically against the branch diff, route declarations, controller filters, model call sites, response concerns, callbacks and `postman_collection.json`. cURL shell syntax and JSON envelopes were validated locally. Live endpoint calls, provider signatures, deployment credentials and deployment-specific record IDs are not validated by this source audit.