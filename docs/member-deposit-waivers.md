# Member household deposit waivers and PTA directory

Apply `20260913231422_member_deposit_waivers_pta.sql` after `20260913230655_waterford_annual_seats.sql`, before deploying the updated application. These local migrations have not been applied to the hosted database.

The $40 Safety Patrol Deposit is waived when the household email matches an Admin Team member (`admin_team_members.email`), teacher (`teachers.email_1` or `email_2`), or active PTA Leader (`pta_leaders.email`). Matching ignores case and surrounding whitespace. Existing qualifying Pfizer/SCCS employee waivers remain. Other households, including Waterford residents without an independent waiver, owe $40 when registered.

For linked family accounts, the database uses the Auth login email so editing the profile's email cannot impersonate a staff member. Administrators can evaluate unlinked legacy families using their stored family email. The billing snapshot provides the authoritative per-family amount; browser printouts and Stripe consume that amount and do not infer staff membership themselves. Missing eligibility data prevents checkout.

Admin Team and superadministrators can use **PTA Leaders** in the portal to add, edit, deactivate, hide or delete members. No staff login is created for a PTA record. `is_active` controls exemption eligibility; `is_public` independently controls public display. An active hidden member remains eligible. Removing/deactivating the member affects future billing snapshots, not already-recorded payments.

The Administration page reads public, active PTA names from the database. Contact emails are not included in public column grants, including for ordinary signed-in families. Guarded admin RPCs provide full records and mutations after checking the administrator role stored in the database.

The migration seeds the existing page's four names and TBD placeholder. Confirmed family-account emails are included for 罗雪梅 (`xuemei.luo@pfizer.com`), 吴霞 (`wuxiayu@gmail.com`) and 曾百灵 (`bevanzeng8@gmail.com`). 伍緎榛 has no supplied email, so her record remains public and active but cannot trigger an email-based waiver until an administrator adds one. Annual database reset should include PTA records, then the current year's roster must be maintained again.

Validation: `python tests/waterford_database_test.py`, `node --test tests/tuition.test.js`, and `npm run build`. Database tests use an isolated local database and never read deployment credentials.
