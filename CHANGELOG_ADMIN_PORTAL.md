# SCCS Website Change Log

## 2026-06-21

- Added Stripe online payment support on the Family Summary page.
- Added payment transaction records for cash, check, and online payments, including online card metadata when available.
- Updated Family Summary to show course donation amounts, Safety Patrol Deposit, total due, payment notes, and office-use payment fields.
- Updated Family Summary print formatting for registration and tuition summaries.
- Updated the Pay Online button to show a green Paid state after payment is recorded.
- Updated Admin Portal Payment History to retain the legacy summary columns, group payment transactions under each Family ID, add method details, and support CSV export.
- Added payment search fields for selecting families and filtering Payment History.
- Updated family search/payment family lookup to support FamID, email, and name matching with due amounts in the search results.
- Added Stripe Checkout customization for SCCS branding and card-only checkout configuration.
- Fixed email validation redirect URLs to use `SITE_URL` instead of `localhost:3000`.
- Updated family account creation to collect required parent/contact profile fields before sending validation email.
- Marked required family account signup fields with `*` and added Retype Password validation.
- Added Auth-only family accounts to Admin Portal Family Search so pending/validated accounts without family profiles can be found.
- Added a Family Search Status column for account and registration/payment states, including Registered account only, Validated account only, Added Students, Registered Classes, Waiting for Payment, and Paid.
- Added Family Search delete actions for unpaid family accounts.
- Blocked Family Search deletion for families with new or legacy payment records.
- Fixed Family Search deletion so it deletes the family profile before deleting the Auth account, avoiding `permission denied for table families` during cascades.
- Added Admin Portal Family Search protection so staff/admin accounts cannot be deleted from Family Search.

## 2026-06-19

- Updated `/admin` to use unified email-based staff login.
- Added `sccs_superadmin_role` for superadmin access and limited the `ADMINS` page to superadmins.
- Removed the legacy `admin` username login flow and aligned the bootstrap script with the superadmin role model.
- Added admin team account creation emails with login links and temporary passwords.
- Fixed admin team role provisioning to upsert `sccs_admin_team_role` reliably when creating or updating admin users.
- Added teacher temporary-password login setup and teacher account emails with login links.
- Added family account email validation for new accounts created from the public login page.
- Ensured system-generated emails use `MAIL_FROM_ADDRESS` from environment configuration.
- Sorted portal dropdown lists alphabetically.
- Added collapsible editor panels for Classes, Teachers, and Admins.
- Added sortable admin tables and default Classes sorting by open status and time.
- Added roster printing and roster email-to-teacher support with improved PDF table formatting.
- Filtered registration and roster class lists to open classes only.
- Added selected-class details to the ROSTERS page above roster records.
- Updated Classes teacher selection to fill the read-only teacher short-name field automatically.
- Added Family Portal student CRUD and renamed `Add Student` to `Student`.
- Restricted student birth year input to `YYYY`.
- Hid records with missing Family ID from relevant admin/family views.
- Fixed row action menus so Edit/Delete remain visible for short tables and close after use.
- Updated Family Summary and Courses views to show teacher full names instead of short names.
- Added course description PDF links and course descriptions on the Courses page.
- Updated Courses category display/order to Chinese, Math, Art&PE, then SAT.
- Added Admin Portal `Print Registration` search flow for printing a selected family's Family Summary.
- Fixed Family Summary print layout so registration tables use the printable page width.
- Added Attendance page date selection, attendance saving, and expandable attendance history by date.
- Added Grades page exam entry, score saving, and expandable grade history by exam.
- Renamed teacher email page back to `Email Students`.
- Added teacher-to-student email sending with single-student and email-all workflows, CC'ing the teacher.
- Added the `ctsccs.org` teacher email requirement note to Email Students.
- Updated the homepage hero text with English translations for the Chinese slogan.
- Changed admin navigation label from `Staff` to `ADMINS`.
- Updated portal labels to use `Online Registration` before login and `My SCCS Portal` after login.
- Fixed teacher deletion behavior, including role cleanup when teacher accounts are removed.
- Improved the delete-teacher error when classes are still assigned to the teacher.

## 2026-06-15 22:33:35 -0400

- Added full CRUD management for `Classes` in the admin portal.
- Changed the admin `Classes` tab from a read-only table to a management page.
- Added create, search, edit, and delete support for class records.
- Added teacher selection from the existing teacher list when editing or creating a class.
- Saved teacher/class relationships through `teacher_classes`.
- Added Supabase RLS/grant migration for admin class management.

## 2026-06-15 21:35:48 -0400

- Fixed password reset links by replacing direct Supabase one-time action links with first-party `/reset-password` links.
- Added a `/reset-password` page that verifies recovery tokens and lets users set a new password.
- Updated reset-password documentation.
- Split teacher and staff management responsibilities.
- Changed `Teacher Contact` to `Teacher` / `Teachers` for teacher record management.
- Added CRUD management for teachers.
- Kept teacher email unrestricted; it does not need to end with `@ctsccs.org`.
- Limited `Staff` management to admin team members only.
- Enforced `@ctsccs.org` email for staff login accounts.
- Fixed staff role handling to use `sccs_admin_team_role`.
- Added Supabase RLS/grant migration for admin teacher management.

## 2026-06-15 19:28:15 -0400

- Renamed admin portal `Users` area to `Staff`.
- Added staff account management for admin team users.
- Added email validation for staff users requiring `@ctsccs.org`.
- Added search support for staff accounts.
- Added clearer role descriptions for staff management.

## 2026-06-15 18:38:28 -0400

- Updated admin portal layout to remove the public left navigation menu.
- Expanded the admin portal content area so admin tables and forms have more horizontal room.

## 2026-06-15 17:04:56 -0400

- Adjusted the header logo size and proportions.
- Reduced the inner SCCS emblem artwork to better fit the circular logo.

## 2026-06-15 17:01:09 -0400

- Scaled down the header emblem artwork.
- Improved the visual balance of the circular SCCS logo.

## 2026-06-15 16:52:18 -0400

- Added the restricted staff/admin portal at `/admin`.
- Added separate admin login handling.
- Restricted staff portal login to authorized admin, admin team, teacher, and TA roles.
- Added admin user bootstrap support.
- Added initial admin/team/teacher role infrastructure.

## 2026-06-15 16:08:50 -0400

- Refined header logo proportions.
- Updated logo placement and sizing in the site header.

## 2026-06-15 15:04:42 -0400

- Added the first admin portal module.
- Started role-based admin, management team, and teacher portal pages.
- Added admin-facing views for classes, teachers, rosters, registration summary, payment history, family search, and print registration.

## 2026-06-15 13:32:11 -0400

- Updated website logo assets.
- Added the SCCS favicon.
- Replaced previous branding images with the new SCCS logo files.

## 2026-06-15 13:19:05 -0400

- Integrated Supabase Auth into the website.
- Added legacy MS SQL data migration support for Supabase/PostgreSQL.
- Added migration/import scripts for schema and seed data.
- Added family login and password reset foundation.
- Added server-side password reset email support through Google Workspace SMTP.
