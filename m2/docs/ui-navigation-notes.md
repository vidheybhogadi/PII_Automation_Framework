# Aisle app UI navigation notes (UI automation agent, 2026-10-26)

Source: reply from the Aisle UI automation agent to QA's 18 navigation / data questions. Observations are from
the testa2 Android debug build (12.67, build 720); "(prod)" marks a read-only look at production Android 12.70
(2026-09-24). Confidence: ✓ seen on a device · ~ docs only · ✗ no evidence. Android only — no iOS or web coverage.
Used to write the manual cases in `docs/Test cases.xlsx` → sheet "PII M2 Cases".

## App navigation

1. **Edit first name / phone after onboarding:** Profile tab (bottom nav, 5th icon) → pencil → Edit Profile →
   About row → About editor (first name, gender, phone number, DOB, hometown, location, Languages, Habits,
   Lifestyle, Save) ✓. Saving a change never tried (OTP / review unknown) ✗. **No email field and no in-app email
   edit found** ✗. DOB: "This cannot be changed later." ✓
2. **Own name / email / phone:** Profile tab header (first name, completion %, verification badge) ✓ — once showed
   "Test" for an account submitted as "Thejaswini". About editor (first name, phone) ✓. OTP screen ("+91 …" with
   Edit) ✓. Onboarding 100% step is the only place email was seen ✓. Help Center footer: REF ID + app version
   only ✓. Invoices / account screen with email ✗.
3. **Other users' first name:** Discover card (name under photo + sticky name header) ✓; For You card + detail ✓;
   Concierge grid ✓; Likes You tiles (names for entitled users, blurred for free/unverified) ✓; Comments stacked
   card (name, age) ✓; Comment Review list ✓ (prod); Your Likes / Recent Passes (name, distance) ✓; Matches list
   row (name + last-message preview) ✓; Chat header ✓; Love Stories ✓ (prod). Live audio, Speed dating, Polls, Top
   matches, shared-link page ✗.
4. **Hide First Name:** Edit Profile → bottom → Hide First Name toggle (below Profile Sharing) ✓. Unverified
   subtext "Must be selfie verified" ✓. Tapping it unverified ✗.
5. **Free text:** no "bio" field; **My Story** (Edit Profile, 500-char limit, Save) ✓ (prod) and **Icebreaker
   answers**, both shown on another person's profile in Discover ✓. Comment composer quotes profile content ✓.
   Chat bubbles ✓; chat started from a comment opens with the photo + comment (prod). Reply / quoted message in
   chat ✗. Matches preview shows last message ("Send a message", "This account is deleted", "Invite received
   from …"), tags YOUR TURN / MESSAGE FIRST / DELETED ✓.
6. **Web app:** URL / login ✗. Only in-app web pages (Terms, Privacy, "What's Your Story" form).

## Login, onboarding, account

7. **Onboarding order** ✓: Welcome → Get Started → phone (+91) → OTP → 10% quick intro (first name, DOB, hometown,
   location, gender; "All fields are mandatory.") → age dialog → 20% Height → 30% Status → 40% Religion → 50%
   Languages → 60% Habits → 70% Lifestyle → 80% Relationship goals → 90% Photos (4) → 100% "Please share your email
   ID" → "Date with intention" consent → Premium sheet → Discover.
8. **Help Center rows:** Support Lounge, What's Your Story, Manage Subscription, Email & SMS, Terms of Use, Privacy
   Policy, Hide Contacts, Deactivate, Delete, Logout ✓. **Delete** ✓: 7 reasons ("Met someone special on Aisle",
   "Taking a break, will be back later", "Looking for something more casual", "Members in here are not my type",
   "Found my match elsewhere", "My connections didn't work out", "Other") → optional feedback → Delete
   Permanently → "Your account will be permanently deleted…" Delete Now / Cancel → Welcome, logged out. No OTP,
   no 30-day screen. **Deactivate** flow ✗; afterwards profile_state=disabled, "Reactivate your account to use
   this tab." + Reactivate Now; on testa2 activate_user returned 403 (number unusable). **Reset profile**: no
   in-app option (only Reset Preferences). Delete older account ✗. Paused profile screen ✓. Photo-moderation block
   menu: Logout + Delete Account only ✓.
9. **Profile sharing** ✓: Discover card → share icon → "Recommend to a friend" → Recommend now → Android share sheet;
   text "I think you two will be a great fit - check out their profile and send a Li…" + deep link. No share icon
   on For You detail / Your Likes detail. Profile Sharing toggle in Edit Profile (untested). Opened link ✗.

## Payments, invoices, messages

10. Payment Options ✓: Paywall → Continue → "Choose how to pay" (End-to-End Encrypted, e.g. ₹999): Card, Net
    Banking, Wallet — a payment gateway, not Google Play billing; gateway name not shown; never tapped. Test mode
    on staging ✗. Also Boost and Buy Comments purchase screens.
11. Invoices / receipts ✗: Manage Subscription shows only Restore Purchase.
12. Emails / SMS / push ✗: Help Center → Email & SMS has Unsubscribe from Emails / SMS. App references
    notification.aisle.co / testnotification.aisle.co.

## CMS

13–15. ✗ No CMS URL, screens, search fields or associate-admin behaviour known.

## Test data and environment

16. Basic onboarded accounts land pending_not_verified (~29%), often disapproved by moderation after ~31 s.
    Approved + Concierge + inbound likes/comments/matches: one long-lived UI-team account — **QA must not use,
    delete or resubmit it** (and it is in the reserved 106 series). Matched accounts: only that account. Verified
    selfie ✗. Paid: backend-granted only.
17. UI team has no Aisle / PII / Mongo DB access.
18. Known issues: photo-moderation block "Oops! We could not detect your face… Attempts Left: 3"; empty Discover
    ~50% on new accounts; verify_user 500 → blank splash; onboarding email once not saved; App Check overlay on
    emulator; keyboard hides Get OTP; matches_list_v3 returns 0 while Matches shows rows; likes_received_count=0
    while likes visible; "My Type" ON by default; pricing varies by day; Plus/Premium identical perks; profile
    header once showed the wrong name ("Test"). No record of accented characters being blocked.
