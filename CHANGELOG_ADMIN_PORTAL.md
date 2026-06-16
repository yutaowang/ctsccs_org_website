# SCCS Website Change Log

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
