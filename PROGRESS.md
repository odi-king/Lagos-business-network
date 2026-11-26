# LBN OFFICIAL DEVELOPMENT CHECKLIST (combined)

One file. It combines your master roadmap, the Security Dashboard, the ten Admin Dashboards and your latest requirements document (Parts B to H). Duplicates are merged into one item each. This file replaces `DEVELOPMENT-CHECKLIST.md`.

## How we work
- **One task at a time.** I build it, you deploy and test it, you tell me the result, then we move on.
- **Three statuses only.**
  - `[x]` **Completed**: built AND tested successfully by you.
  - `[~]` **Partially Completed**: built, but testing, setup or part of the work remains.
  - `[ ]` **Outstanding**: not built or not verified yet.
- A feature is never marked Completed just because it exists in the code. Statuses below are my honest view. Tell me where I am wrong.

## Mandatory rules (apply to every task)
1. Preserve every existing feature and agreed decision. Do not remove or weaken anything without your permission.
2. No duplicate features or dashboards. New work goes into its proper existing section.
3. Keep Supabase permissions, RLS, authentication, role-based access and audit logging correct.
4. **GitHub must contain zero secrets. Debug mode off.** Only public keys (the Supabase anon key and the Paystack public key) may be in the website files.
5. **No cryptocurrency, crypto payments or crypto features anywhere.** (The old crypto wallet and exchange items are removed from the roadmap.)
6. Keep ambassador categories and programmes separate (School Ambassadors, Celebrity and Global Brand Ambassadors, International Representatives, the Monitoring Department).
7. Every feature gets functionality, mobile, permission, admin-permission, database/RLS, MFA, payment (where relevant), storage and security testing before it is marked Completed.

---------------------------------------------------------------------

## SECTION A. Core platform already built
- [x] Accounts, roles (student, lecturer, business), sign up and login, approvals by the owner
- [x] Installable web app (add to home screen), dark mobile-first design
- [x] Admin account and admin approvals; marketplace feed with posts; trade chat and offers
- [x] Paystack payment recording for trades (payment worked after the secret key was set)
- [~] Trade completion: delivery, both confirm, seller payout, reviews. **Retest still pending** (`PAYMENT-TEST-GUIDE.md`, section C)
- [~] Lifestyle page, Market page with My trades inside, bottom menu Lifestyle | Market | Reels | Classes | Me, Reels for lifestyle and marketplace. Needs `supabase-access.sql` then `supabase-sections.sql`, then testing
- [~] Student access rule: students keep Lifestyle, Reels and messages; marketplace opens at graduation; enforced in the database too
- [~] Messages, comments, replies, reposts, tags, profile tabs, post viewer on profile
- [~] Disputes with evidence, LBN fee (2%, 0.5% large deals), admin team with permissions, 2FA, reviews, analytics, privacy centre, account deletion, free trial, direct video lessons, languages (6 + Spanish and Chinese), legal pages (draft), email system, go-live readiness
- [x] Market menu style (your own `marketnav.js` and `style.css` are the source of truth)

---------------------------------------------------------------------

## PHASE 1. Usernames, profiles and social features (COMPLETE)
- [x] Task 1: username database foundation (`supabase-usernames.sql`)
- [x] Task 2: choose a username when registering
- [x] Task 3: change the username in settings
- [x] Task 4: username suggestions while typing @
- [x] Task 5: clickable @mentions
- [x] Task 6: `/@username` profile links
- [x] Task 7: show @handles on posts, comments, Reels and lists
- [x] Task 8: usernames in search results
- [x] Task 9: improve profile pages

## PHASE 2. Website feedback system   COMPLETE (tested)
- [x] Floating Feedback button on every page, above the bottom menu, mobile friendly
- [x] Form: "What do you like?", "What is confusing or not working?", optional email or phone, Send, Close
- [x] No empty submissions; thank-you message; error message if it fails
- [x] Saved in Supabase with the page and the date and time
- [x] Admin screen to read feedback (inside the Content or Operational dashboard, not a new dashboard)

## PHASE 3. Referral and invite programme (one shared referral engine, also used by ambassadors)   COMPLETE (tested)
- [x] Unique referral link and code for every user; one-tap "Share with a Friend"
- [x] Sign up through a link; referred users get a one-month free trial
- [x] Reward: N500 only when the referred person pays a yearly subscription; none for free trials
- [x] My Earnings balance; successful referrals recorded; no duplicate rewards
- [x] Referral dashboard: signed up on free trial, bonus pending, subscribed, bonus earned, on hold (about two weeks), paid; history; first name or user number only
- [x] Withdrawals: minimum N5,000, monthly payment, bank transfer, payment records; automatic Paystack payouts later

STANDING RULE: cancel subscription. A member can cancel their subscription at any time, keeps access until the paid period ends, and can resume before then. Built now in `supabase-cancel.sql` + `subscription.html` (waiting for your test). Phases 11 and 12 (recurring billing, plans, international payments) must always respect it and add cancellation to payment records.

## PHASE 4. Ambassador ecosystem (all managed inside the ONE Ambassador Management Dashboard)   <- WE ARE HERE: 4A, 4B, 4C tested; all of Phase 4 tested (4A to 4E)
4A. School Ambassador Programme (existing rules preserved)
- [x] 15 per participating school: 6 Business Owner, 5 Student, 4 Lecturer; Super Admin approval needed to exceed
- [x] Application form (all fields from your checklist) with name and email pre-filled; banner on the logged-in homepage and profile pages; Apply Now
- [x] Public recruitment page with live vacancies per category (no private data shown)
- [x] Review, approve or reject; two-week trial before confirmation; 12-month appointments; returning applicants
- [x] 4A-2 tested: Ambassador badges (Business, Student, Lecturer), official certificate with public verification, resign / suspend / reinstate / terminate, full appointment history
- [x] 4A-3 tested: monthly stipend records (pending, approved, paid, withheld) with bank details; N500 commissions tagged through the referral engine (no double payment); monthly payment report with CSV; quarterly reviews; performance warnings; renew or decline renewal (new 12-month appointment + new certificate); automatic expiry, places reopen, 30-day reminder
- [x] Badges (Business, Student, Lecturer); official certificate for CV; resign, suspend, terminate; full history kept
- [x] Pay: N70,000 monthly stipend plus N500 per paid subscription; separate stipend and commission records; pending, approved, paid; monthly reports
- [~] Super Admin controls and audit trail for approvals, payments, renewals, terminations (all actions are written to the admin audit log; the full Audit Log dashboard comes in Phase 14)

4B. Career progression (added to the same dashboard)
- [x] Ranks: School Ambassador N70,000, Senior Ambassador N210,000, Regional Ambassador Manager (subject to approval), National Ambassador Director (subject to approval)
- [x] Show rank and position, assigned schools, salary, performance, promotion history
- [x] Super Admin controls promotions, salary approvals, transfers, rank changes
- [x] Three separate database fields: Ambassador Type, Ambassador Rank, Appointment Status
- [x] All changes recorded in the central Audit Log

4C. Celebrity Brand Ambassadors and Global Brand Ambassadors
- [x] Two separate appointment categories (not ranks, not part of School Ambassadors or International Representatives): Celebrity Brand Ambassadors and Global Brand Ambassadors, Super Admin appoints, public page only with signed agreement, badge for members, full history

4D. Independent Ambassador Monitoring and Verification Department (independent of the ambassadors, accountable to management)
- [x] Performance and verification dashboard (tested): performance, verified registrations, active members, subscription conversions, rankings
- [x] Field verification (tested): school visits, checks of promotions, random contact with members, inspection reports and results
- [x] Referral analytics and anti-fraud (4D-4 tested): unique link, QR code and ID per ambassador (tested); registrations, verified, active, paid (tested); detect duplicate accounts and suspicious referrals
- [x] Monthly performance reports (4D-4 tested) (achievements, targets, scores, areas to improve)
- [~] Officer management: assign officers to schools and regions, monitor, review reports, record activities; all logged in the Audit Log (4D-1 built: team, assignments, activity record, audit log; report review built in 4D-3)
- [x] Super Admin sees all reports, records, fraud cases and analytics (4D-2 to 4D-4)

4E. Monitoring Department staffing (separate from ambassador appointments)
- [~] Head of Ambassador Monitoring, Performance Monitoring Officers, Field Verification Officers, Data and Fraud Analysts, Member Verification Officers
- [~] Recruitment: qualified graduates, NYSC members, experienced professionals, trained field personnel

## PHASE 5. Marketplace improvements   COMPLETE (5A, 5B, 5C all tested). Marketplace flicker fixed 24 Nov (cause: posts.js on GitHub had been overwritten with post.js; restored)
- [x] Product categories; location and area filters; price filters; saved items (tested)
- [x] Multiple photos per listing (tested); better search (tested); listing pages: owner Photos and details page (tested), more from this seller and similar items (tested)
- [x] Trade chat: listing card, quick replies, search and pictures in My trades (tested); marketplace navigation: Saved chip, filters, related listings (the bottom navigation and style.css stay as you made them)

## PHASE 6. Buyer protection and financial system   <- 6A, 6B, 6C done; 6D (automatic payouts and refunds) WAITING for Paystack Transfers approval
- [x] Product returns inside trade chat: evidence, dispatch with tracking, seller confirms receipt, admin refund, money held, deadlines, notifications (6A tested)
- [ ] Paystack account approved; Transfers enabled; automatic payouts and refunds (6D: WAITING on Paystack approving Transfers for your account; manual "Mark as paid out" with the ID check works until then. Build and test it as soon as Transfers is on; do not close Phase 6 before then)
- [x] Seller ID verification before the first payout (6C deployed and tested by you on 24 Nov; the payout-block and bank-change re-check rules are in the database and get exercised again during 6D: manual review by the LBN finance team with ID photo + selfie + bank name match; needs `supabase-seller-id.sql`, `seller-id.js`, `seller-id-admin.js`, `dashboard.html`, `admin.html`, `admin.js`). Not yet applied to lecturer handout payouts; an outside provider can replace the manual step later
- [x] Auto-complete a trade if the buyer stays silent past the deadline, with a warning first (6B tested: 7 days, reminder 2 days before, never less than 24 hours after the reminder, paused by returns and disputes)
- [~] Smallest LBN fee decided (24 Nov): the site already has a minimum fee setting (`min_fee`, now 0). Set it to a small naira amount so small trades do not lose money (see the one-line SQL given in chat), then check it on a small test trade

## PHASE 7. Graduation programme (COMPLETE 24 Nov; participation measure moves to Phase 8)
- [x] Attendance, part 1 (7A): lecturer opens a code during a live class (5 to 120 minutes), student types it, 5 wrong tries lock 10 minutes (deployed and confirmed by you on 24 Nov)
- [x] Attendance, part 2 (7B) deployed and confirmed by you on 24 Nov: uploaded video lessons are completed only by really watching (90% played, end reached, no faster than 2x); YouTube/Vimeo link lessons cannot be proven so keep the manual button; needs `supabase-watch.sql`, `watch.js`, `class.js`, `class.html`
- [x] Eligibility (7C) deployed and confirmed by you on 24 Nov: 50 lectures (live class with code OR video watched to the end), a day counts only with 2+ different lecturers, assessments, required books/handouts chosen by admin; automatic calculation; the numbers are editable in Admin; participation moved to Phase 8; needs `supabase-eligibility.sql`, `dashboard.js`, `admin.js`, `admin.html`
- [x] Student graduation dashboard with progress and a Request Graduation button (built together with 7C: bars for lectures, assessments, required materials; recent days; Ask to graduate button appears only when eligible)
- [x] Application (7E) deployed and confirmed by you on 24 Nov: form with certificate name, phone, address, city, state, country, shirt size; admin sees it and approves or declines (a decline needs a reason; the student is notified; decisions are in the audit log); needs `supabase-graduation-application.sql`, `dashboard.js`, `admin.js`
- [x] Certificates (7F) deployed and confirmed by you on 24 Nov: random unique number (LBN-GRAD-2026-XXXXXX) issued on approval, earlier graduates backfilled; printable page `graduation-certificate.html`; public check `?no=NUMBER`; admin can search and withdraw (reason, audit log); needs `supabase-certificates.sql`, `graduation-certificate.html`, `graduation-certificate.js`, `dashboard.js`, `admin.html`, `admin.js`
- [x] Gift packages (7G) deployed and confirmed by you on 24 Nov: created automatically when a graduation is approved (earlier approved graduates backfilled); preparing, shipped (courier and tracking required), delivered; the graduate is notified and sees the status on the dashboard; admin downloads the list as CSV; needs `supabase-gifts.sql`, `gift-admin.js`, `admin.html`, `dashboard.js`
- [x] Celebration prompt and graduate badge (7H) deployed and confirmed by you on 24 Nov: a one-time congratulations screen (certificate button, share button) on the dashboard and Lifestyle; a graduation-cap Graduate badge on profile pages. The badge shows on profile pages only for now; showing it in feeds, comments and chats needs each of those database functions to send the graduate flag (to do with the Phase 13 clean-up); needs `supabase-celebrate.sql`, `celebrate.js`, `badges.js`, `dashboard.html`, `lifestyle.html`

## PHASE 8. Live classes inside LBN (COMPLETE 25 Nov, except automatic recording, which waits: lecturers upload recordings meanwhile)
- [x] Live-video provider chosen: LiveKit Cloud (account and project created 25 Nov; API key and secret kept only in Supabase secrets)
- [x] Live audio and video (8A) COMPLETE (25 Nov): function name is `livekit-token-ts`; lecturer hosts inside LBN, students watch; save-data button turns video off; room opens 15 min before the start; needs the `livekit-token` function + 3 secrets, `supabase-live-room.sql`, `live-room.html`, `live-room.js`, `class.js`, `class.html`, `live.js`, `live.html`
- [x] Class chat, questions, hand-raise (8B) COMPLETE (25 Nov): everyone chats; students can send a question or raise a hand; lecturer deletes, mutes, marks answered; participation count for graduation (admin sets it, 0 = off). Needs `live-chat.js`, `live-room.html`, `live-room.js`, `admin.html`, `admin.js`, `dashboard.js`, then `supabase-live-chat.sql`
- [x] Invite a student on stage (8C) COMPLETE (25 Nov): student raises hand or requests to speak, lecturer taps Invite, student accepts and speaks (voice, optional camera); lecturer can send back or mute; needs new function `livekit-stage`, updated `livekit-token-ts` code, `live-stage.js`, `live-chat.js`, `live-room.html`, `live-room.js`, then `supabase-stage.sql`
- [x] Attendance inside LBN rooms (8D) COMPLETE (25 Nov): time in the room is counted (minimum minutes set by admin, 20 default) AND the student types the lecturer's code, both inside the room; lecturer opens the code and sees who is present; counts for graduation; outside-link classes unchanged. Needs `live-attendance.js`, `live-room.html`, `live-room.js`, `admin.html`, `admin.js`, `dashboard.js`, then `supabase-presence.sql`
- [ ] Recordings and replays: for now lecturers upload the recording as a normal video lesson (already counts when watched to the end); automatic recording decided later
- [x] Students rate and comment on classes (8E) COMPLETE (25 Nov): 1 to 5 stars plus an optional comment on the class page for each past live class, only for students who joined (attendance saved or 5+ minutes in the room); comments anonymous, read only by the lecturer and admins; others see the average once there are 3 ratings. Needs `ratings.js`, `class.html`, then `supabase-ratings.sql` (run AFTER `supabase-presence.sql`). Admin view of comments comes with the Phase 14 admin dashboard

## PHASE 9. Logistics and Dispatch (ONE section, no extra dashboards) (9A to 9G COMPLETE 25 Nov; waiting on courier accounts, GPS decisions)
- [x] Delivery inside Lagos, step 9A COMPLETE (25 Nov): admin lists areas and sets prices between areas (and the LBN share of each fee); buyer ticks "Deliver by LBN rider" on a purchase, seller gives the pickup place, buyer pays item + delivery fee in the same Paystack payment; two PINs made (seller's pickup PIN, buyer's delivery PIN); delivery fee refunds are flagged when a trade is refunded or cancelled before pickup. Needs `delivery.js`, `delivery-admin.js`, `trade.html`, `trade.js`, `admin.html`, then `supabase-delivery.sql` (run AFTER `supabase-payment-fixes.sql`)
- [x] 9B: Rider registration and approval COMPLETE (25 Nov): new Rider page (apply with ID, selfie, vehicle photo, areas, guarantor, rules), admin checks and approves, rejects, suspends or brings back; approved riders go online and choose areas. Needs `rider.html`, `rider.js`, `rider-admin.js`, `admin.html`, `dashboard.html`, then `supabase-riders.sql` (run AFTER `supabase-delivery.sql`)
- [x] 9C: Rider jobs: riders see open jobs in their area and accept one; pickup PIN, delivery PIN, proof of delivery; rider earnings and withdrawals (payout manual until Paystack Transfers is approved)
- [x] 9D: Shipping to other cities and states (built 25 Nov, waiting for your test): buyer asks for courier shipping and gives the address, seller gives the pickup place, admin types the price and delivery time, buyer accepts and pays item + shipping in one payment, admin books any courier and types the courier name and tracking number, then marks shipped and delivered; shipping fee refund is flagged if the trade is refunded before shipping. Needs `courier.js`, `courier-admin.js`, `trade.html`, `trade.js`, `admin.html`, then `supabase-courier.sql` (run AFTER `supabase-rider-jobs.sql`). International and courier APIs come later (need courier accounts)
- [ ] Country rollout: Nigeria, USA, UK, Canada, Ghana, then others; DHL, FedEx and similar partners; customs, duties, taxes, tracking
- [ ] Courier APIs: find providers per route, compare prices and times, customer chooses, delivery requests, notifications, pickup and delivery PINs, proof of delivery, LBN branding
- [x] 9E: Rider ratings, performance and emergency button (built 25 Nov, waiting for your test): buyer rates the rider 1 to 5 stars after delivery (private comment); rider sees own average after 3 ratings; admin sees each rider's deliveries, average and low ratings, can read comments; rider emergency button alerts all admins. Needs `delivery.js`, `rider.html`, `rider.js`, `rider-stats-admin.js`, `admin.html`, then `supabase-rider-quality.sql` (run AFTER `supabase-courier.sql`)
- [ ] Rider Management Dashboard (inside this section): registration, ID and vehicle verification, admin approval, profiles, availability, assignments, records, performance, earnings, tips, ratings, withdrawals, emergency button, suspension
- [ ] Live GPS tracking of assigned riders during active deliveries, shown only to authorised users, with privacy and retention limits; route deviation and delay alerts
- [ ] Automatic rider assignment (availability, location, requirements) with management able to step in
- [x] 9F: Delivery problems and returns (built 25 Nov, waiting for your test): buyer or seller reports not arrived, damaged, wrong item, return request, rider or courier problem; riders report cannot reach seller or buyer; admin reads, decides and closes, everyone on the trade is told; buyer is told not to confirm receipt until sorted. Needs `issue.js`, `issues-admin.js`, `trade.html`, `rider.html`, `rider.js`, `admin.html`, then `supabase-delivery-issues.sql` (run AFTER `supabase-courier.sql`). Return deliveries by rider and delivery insurance wait for an insurer
- [x] 9G: Admin delivery overview and report (built 25 Nov, waiting for your test): one panel shows what needs attention (jobs with no rider, not collected, refunds due, shipments to price or book, open problems, emergencies, riders to approve, money owed to riders), live counts, money for 7/30/90/365 days, and a CSV download by date range. Needs `logistics-admin.js`, `admin.html`, then `supabase-logistics-admin.sql` (run AFTER `supabase-delivery-issues.sql`). Courier partner list comes with the courier-API step

## PHASE 10. Social live streaming and gifts (no cryptocurrency) (10A to 10E COMPLETE 25 Nov; waiting on the lawyer for coin sales)
- [x] 10A: Go live (built 25 Nov, waiting for your test): any member with an active membership can stream (one at a time), anyone logged in watches free, live chat, reactions, follower notifications, streamer can delete messages and mute, viewers can report, admin (Support) can end a stream or ban a member from streaming; a stream whose streamer disappears ends after 3 minutes. Needs `streams.html`, `streams.js`, `stream.html`, `stream.js`, `stream-admin.js`, `classes.html`, `admin.html`, the UPDATED `livekit-token-ts` function code (`livekit-token.ts`), then `supabase-streams.sql`
- [x] 10B: Guests on a stream (built 25 Nov, waiting for your test): viewer raises a hand, streamer taps Invite up, viewer accepts and goes live with microphone and camera, everyone watching sees the guests; up to 3 guests (admin sets 1 to 8 in the Live streams panel); streamer can send a guest back, a guest can leave. Needs `stream.html`, `stream.js`, `stream-admin.js`, `admin.html`, the UPDATED `livekit-stage` function code (`livekit-stage.ts`), then `supabase-stream-guests.sql` (run AFTER `supabase-streams.sql`)
- [ ] Legal review of virtual coins and creator payouts first
- [x] 10C: Gift screens and animations with FREE TEST COINS (built 25 Nov, waiting for your test, no real money): members claim 100 free test coins a day (no value, cannot be cashed out), viewers send animated gifts (float up, burst, big screen) during a live stream, everyone sees them, streamer sees the total and top gifters; admin edits the gift list; gifts exist only in social streams so they are off in classes. Needs `stream.html`, `stream.js`, `stream-admin.js`, `admin.html`, then `supabase-live-gifts.sql` (run AFTER `supabase-stream-guests.sql`)
- [x] 10D: Coins bought with Paystack (done 25 Nov, tested): 1 coin = N10, 4 packs, all admin-editable; coin sales switch is OFF until the lawyer agrees; paid coins are used before test coins; gifts paid with bought coins record the streamer's share (LBN 50%, held 7 days). Needs `stream.html`, `stream.js`, `stream-admin.js`, `admin.html`, `paystack-verify.ts`, `paystack-webhook.ts`, then `supabase-coins.sql`
- [x] Gifts disabled inside educational classes (gifts exist only in social streams, never in classes)
- [x] 10E: Streamer earnings and withdrawals (built 25 Nov, waiting for your test): `earnings.html` page (ready, waiting, paid, bank account, Withdraw button, smallest withdrawal N2,000 admin-editable), admin pays by hand and taps Mark paid or Reject (streamer is told), admin can freeze a streamer or cancel earnings (audit logged). Needs `earnings.html`, `earnings.js`, `streams.html`, `stream-admin.js`, `admin.html`, then `supabase-creator-payouts.sql` (run AFTER `supabase-coins.sql`). Automatic Paystack Transfers wait for Paystack approval
- [~] Protection against payment manipulation: already in place (amounts checked against the pack price, each Paystack reference counts once, gifts only through the server, 700 ms gift limit, freeze and cancel controls); final review in Phase 13

## (Phase 10 done. WE ARE HERE: Phase 11)
## PHASE 11. International expansion, payments and registration
- [x] 11A: Location at sign up (built 25 Nov, waiting for your test): searchable country list, state or region (Nigerian states as a list, optional for countries with none), city, school or business name; existing members add details in Settings > My location (`my-location.html`); country stored as a 2-letter code for payment routing; admin can see counts per country and correct a member (functions ready, admin panel comes with Phase 14). Needs `countries.js`, `auth.html`, `auth.js`, `my-location.html`, `my-location.js`, `settings.js`, then `supabase-locations.sql` (independent; sign up never breaks if it is missing)
- [ ] International provider chosen and confirmed (real USD charging and settlement, recurring monthly and yearly) <- WAITING for Paystack support reply (email sent); Flutterwave is the fallback
- [x] 11B: Automatic routing (built 26 Nov, waiting for your test): the server picks the plans from the saved country (Nigeria to Paystack in naira, others to the international provider in dollars, OFF until the admin opens it); one shared membership record; country locked after the first payment (only LBN can change it); mismatched payments are flagged to admin. Needs `pay.html`, `pay.js`, `my-location.js`, `billing-admin.js`, `admin.html`, the UPDATED `paystack-verify.ts` and `paystack-webhook.ts`, then `supabase-plans.sql` (run AFTER `supabase-locations.sql` and `supabase-cancel.sql`)
- [x] 11C: Payment records (built 26 Nov, with 11B): every plan payment is saved with country, plan, provider, currency, amount, reference, dates and status; cancellations already recorded; admin list and totals in Admin > Membership plans and payments
- [x] 11D: International Representatives Programme (built 26 Nov, waiting for your test; separate from Ambassadors): members apply (`representative.html`, also in Settings), admin page `representatives-admin.html` (button in Admin) for applications, verification (cannot approve until verified), approve or reject with reasons, country assignments, suspend or end, monthly reports with ratings, performance (reports, average rating, LBN members in the country) and a full record of every decision. Needs `representative.html`, `representative.js`, `representatives-admin.html`, `representatives-admin.js`, `admin.html`, `settings.js`, then `supabase-representatives.sql` (run AFTER `supabase-locations.sql`)
- [x] 11E: Representatives Conference Room (built 26 Nov, waiting for your test): private video meetings (`conferences.html` list, `conference.html` room) for the founder, management and invited Representatives; 720p clear video like the streams, grid of everyone, screen sharing; management creates meetings in Representatives > Conference room, chooses who may enter, starts and ends, locks the room, lets everyone speak or only allowed people, removes a person (cannot return); everything recorded. Needs `conference.html`, `conference.js`, `conferences.html`, `conferences.js`, `representatives-admin.html`, `representatives-admin.js`, `representative.js`, `admin.html`, the UPDATED `livekit-token-ts` function (`livekit-token.ts`), a NEW function `livekit-conference` (`livekit-conference.ts`), then `supabase-conference.sql` (run AFTER `supabase-representatives.sql`)
- [x] 11F: International Business Representation (built 26 Nov, waiting for your test): management sets each country's stage (research, planned, pilot, live, paused), target and plan; Representatives log and follow business leads in their assigned countries (`representative.html`); management sees all leads, a country performance table from real data (members, paying members, Representatives, leads, onboarded, report ratings, recruits in 90 days), reviews each country (on track, needs attention, at risk) and every change is recorded. Needs `representative.html`, `representative.js`, `representatives-admin.html`, `representatives-admin.js`, then `supabase-intl-business.sql` (run AFTER `supabase-conference.sql` because it uses its helper)

## PHASE 12. Subscription pricing and payments
- [~] Nigeria (Paystack, NGN): weekly N500, monthly N2,000, yearly N20,000 (built with 11B, admin-editable)
- [~] International (USD): monthly $2, yearly $20, no weekly plan (built with 11B; payments stay OFF until the provider is connected)
- [~] Right plans shown by country; prices consistent everywhere (the server decides; pay page shows them)
- [ ] Recurring billing, renewals, confirmations, failed payment notices, cancellation (access until paid period ends), expiry handling, renewal
- [ ] Admin view of subscribers and revenue (NGN and USD kept separate, per provider)

## PHASE 13. (13A done; 13A and 13B complete 26 Nov) Security Dashboard, website security and data protection (merged)
- [ ] ID photos and selfies (private `seller-ids` bucket): decide how long to keep them, delete them on account deletion, and mention them in the privacy policy
Security Dashboard (Super Admin and administrators with a new Security permission; real data only; protected audit logs; alerts for critical incidents)
- [x] 13.1 Security permission and protected security log (built 26 Nov: `security.html`, `security.js`, `admins.js`, `admins.html`, `admin.html`, then `supabase-security.sql`; "Full admin" does not include Security; the log cannot be edited or deleted)
- [x] 13.2 Overall security status from the real checks below (built with 13.1: OK / Needs attention / Critical from real database checks)
- [x] 13.3 Login and authentication monitoring (successful logins, failed attempts on LBN's login page, suspicious logins, unauthorised attempts)
- [x] 13.4 Database security: RLS status of every table, permissions, unauthorised access (built with 13.1: tables list, exposed tables, logged-out functions, functions without fixed search path)
- [x] 13.5 Threat detection and alerts: suspicious activity, unusual account behaviour, possible attacks
- [x] 13.6 Admin activity logs (sensitive admin actions are copied into the security log with alerts; the full Audit Log comes in Phase 14)
- [x] 13.7 Payment security (Payments tab: unmatched payments, 30-day counts, alerts; duplicates are impossible by design; webhook delivery problems are seen in Paystack and Supabase logs)
- [x] 13.8 File and upload security: bucket privacy, file types and sizes, risky uploads, unauthorised access
- [x] 13.9 API and secret protection: scan live website files for leaked keys, check server secrets are set
- [x] 13.10 User account protection: suspend a compromised account, end its sessions, investigate
- [x] 13.11 Security audit reports: detected, resolved and outstanding issues
Website security (Part G)
- [x] IP banning (built 26 Nov in 13C: automatic detection, admin review, 24 hours / 7 days / permanent; works on LBN pages; network-level blocking needs Cloudflare with your own domain)
- [x] Rate limiting (built 26 Nov in 13E, `supabase-ratelimits.sql`: messages 20 a minute, offers, comments 15 a minute, posts 15 an hour, admins exempt; login already limited in 13B/13C; support form already limited. Registration and password reset are limited in the Supabase dashboard: Authentication > Rate Limits, steps given in chat)
- [x] Account locking after repeated failed logins (built 26 Nov in 13C: 30 minute lock after 10 wrong passwords, never shown to the attacker, Super Admin never locked). Secure recovery still to review
- [x] Device and session monitoring (built 26 Nov in 13C: My devices page for members; admins use the Accounts tab. New-device emails not built)
- [x] CAPTCHA on sensitive forms (built 26 Nov in 13G: Cloudflare Turnstile on login, sign-up, forgot password and change password; site key added 26 Nov; still OFF until the secret key is added in Supabase > Authentication > Attack Protection)
- [x] Admin IP monitoring (built 26 Nov in 13F: Admin lock tab, "Where admins log in from", new places flagged, every view logged; file `supabase-security-5.sql`)
- [x] **Admin Route Lock** (built 26 Nov in 13D: every admin page asks the server first, unauthorised visits logged, route audit and two-step coverage on the Security Dashboard "Admin lock" tab; the Super Admin still needs to switch on the "require two-step" setting once all admins have it): deny by default; server-side checks and RLS on every admin operation (not just the page); MFA with AAL2; log unauthorised attempts; never rely on hidden URLs or noindex. (Today: admin database functions already check permissions on the server and 2FA can be required, so this is `[~]` until it is fully reviewed and tested)
- [~] **API keys and secret protection.** First scan done on 23 Nov 2026: no secrets in the website files, no service-role key, no debug code. Remaining: scan your real GitHub repository and its history, keep SQL, server code and notes out of the public repository (`.gitignore` provided), rotate any key that was ever exposed
- [ ] Deleted-account data retention: keep only what is legally needed (security logs, payment records, evidence), document periods and legal basis, restrict access (account deletion already anonymises; retention rules still to document)
- [ ] Evidence preservation and legal holds: restricted, tamper-proof, access and exports logged
- [ ] Law enforcement requests: verify authority and legal basis, disclose only what the law requires, record what, when, to whom and who authorised
- [~] Password protection: passwords are only handled by Supabase Auth (hashed, never visible to anyone). Needs a final review that none appear in logs, URLs or code
- [~] Cookie consent, cookie preferences and a Cookie Policy page (built 26 Nov in 13H: notice on first visit, `cookies.html`, footer link on every page, consent switch for future optional tools; today only essential storage is used; the policy text still needs lawyer review)
- [ ] Regular security reviews (RLS, permissions, MFA, buckets, payments, functions, secrets, GitHub, logs; SQL injection, XSS, broken access control, insecure uploads, unauthorised API access, session weaknesses, insecure payment handling), repeated after every significant update
- [~] **Database Backup and Disaster Recovery**: guide written (`BACKUP-AND-DOMAIN.md`). Remaining: upgrade to Supabase Pro, turn on backups, do a real restore test, write the recovery plan
- [ ] Compliance with the Nigeria Data Protection Act 2023 and related laws; lawyer review of Terms, Privacy and Refunds (currently drafts)

## PHASE 14. Admin dashboards (ONE central dashboard, no duplicates)
Roles today: Super Admin, Finance, Support, Content, Marketplace, Education, Members (plus Security from Phase 13). MFA and AAL2 required for admin access. Sensitive actions restricted; admin access can be suspended or revoked.
- [~] 14.1 **Central Admin Dashboard (Super Admin)**: tile for every dashboard, full control of appointments, roles, permissions and access restrictions. (The admin team page and permissions exist; the tile home screen does not)
- [ ] 14.2 **Admin Activity Audit Log Dashboard**: ONE central log. Administrator and role, action, time, affected user or record, before and after values, IP and device where available, success or failure, access to sensitive information, evidence disclosures, ambassador promotions and transfers, salary and rank changes, monitoring officer activity, security configuration changes. Super Admin filters by administrator, action and date, investigates, reviews sensitive access, restricts or revokes access. (A smaller audit log exists today)
- [ ] 14.3 User Management Dashboard
- [ ] 14.4 Financial Management Dashboard
- [ ] 14.5 Marketplace Management Dashboard
- [ ] 14.6 Education Management Dashboard
- [ ] 14.7 Content Management Dashboard
- [ ] 14.8 Technical Dashboard
- [ ] 14.9 Operational Dashboard
- [ ] 14.10 Ambassador Management Dashboard (the one from Phase 4, never a second copy)
Existing admin screens (people, payments, disputes, graduation requests, support, settings, free trial watch, reviews, readiness, recover a payment) are moved into the right dashboard, not rebuilt.

## PHASE 15. Testing and quality assurance (before anything is Completed)
- [ ] Functionality, mobile, user permissions, admin permissions, database access, Supabase RLS, authentication and MFA, payments, storage permissions, security controls
- [ ] Fix vulnerabilities found; confirm existing features still work

## PHASE 16. Final deployment and launch
- [ ] Production configuration, permanent domain, HTTPS, PWA install, accessibility
- [ ] Put Cloudflare in front of the custom domain (GitHub Pages rate-limits heavy traffic from one network); keep the offline cache light (sw.js caches only about 9 core files)
- [ ] Pre-publish check before every push: `git status` run inside the INNER folder, and a quick look that shared files (posts.js, appnav.js, style.css) are still the right ones (a wrong paste into posts.js broke Marketplace, Lifestyle and Reels on 24 Nov)
- [ ] Payment integrations, email delivery (proper sender domain), database security, administrator access
- [ ] Legal and privacy pages finished, final security review, final user acceptance testing, public launch

---------------------------------------------------------------------

## Reference: where things run
Database run order (skip what you already ran): setup, roles, payments, classes, marketplace-access, admin, badges, trades, support, escrow, trade-types, feed, verification, profiles, graduation, handouts, live, notifications, business, lock-to-members, edits-fix, messages, comments, replies, profile-tabs, market, chat-upgrades, admin-team, disputes, fees, trial, lesson-videos, language, analytics, privacy, email, readiness, mfa, reviews, **usernames, payment-fixes, grants-fix, access, sections**, language-more.
Edge Functions: `paystack--webhook` (two dashes), `paystack-verify`, `delete-account`, `send-emails`.
Server secrets (Supabase, never GitHub): `PAYSTACK_SECRET_KEY`, `CRON_SECRET`, and the email provider key.
