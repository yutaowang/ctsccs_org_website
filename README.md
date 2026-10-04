# SCCS Website

Modern React rebuild of the Southeastern Connecticut Chinese School website:

- 东南康州中文学校
- Southeastern Connecticut Chinese School
- Original website: <https://ctsccs.org/>

The project reproduces the original site's public content with a responsive
layout, local client-side navigation, mobile menus, and updated presentation.

## Tech Stack

- React 18
- Vite 5
- Plain CSS
- Browser History API for client-side routing
- Supabase Auth and PostgreSQL

## Getting Started

Requirements:

- Node.js 18 or newer
- npm

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

To use a specific port:

```bash
npm run dev -- --host 0.0.0.0 --port 5174
```

Then open <http://localhost:5174/>.

Copy `.env.example` to `.env.local` and set the Supabase project URL and
publishable key. Never put a secret key or service-role key in a `VITE_*`
variable because Vite exposes those values to browsers.

Run the SQL files in `supabase/migrations` in filename order. The
`20260618_expose_sccs_data_api.sql` migration adds `sccs` to the PostgREST
schema list so the browser client can access it through the Supabase Data API.

For the June 15, 2026 SQL Server backup, next run
`supabase/migrations/20260616_legacy_import_support.sql`, then generate and run
the private data import:

```bash
node scripts/convert-mssql-backup.mjs "C:\path\to\Scripts_bkup_20260615.sql"
```

The generated `supabase/seed/legacy_data_20260615.sql` contains private data and
is ignored by Git. Legacy plaintext passwords are deliberately excluded.

### Back up and restore Supabase

Both backup scripts load `SUPABASE_DB_URL` or `SUPABASE_DB_POOLER_URL` from
`.env.local` and create a UTC-timestamped SQL file under `backups/`. The backup
directory is ignored by Git because it contains private school data.

The pure-Python backup requires the repository's Python dependencies and does
not require PostgreSQL command-line tools:

```powershell
python -m pip install -r requirements-import.txt
python scripts/backup_supabase.py
```

The PostgreSQL-native backup uses `pg_dump`. Install the PostgreSQL client tools
first and make sure `pg_dump` is on `PATH`; on Windows the script also searches
under `C:\Program Files\PostgreSQL\*\bin`:

```powershell
python scripts/backup_supabase_pg_dump.py
```

For disaster recovery, prefer the `supabase_sccs_pg_dump_*.sql` output. The two
recovery scripts require PostgreSQL `psql`; use a version compatible with the
backup's `pg_dump` version. They only accept the dedicated
`SUPABASE_RECOVERY_DB_URL` variable unless `--database-url` is explicitly
provided, so they do not silently fall back to the normal application database.

Set the recovery target URL:

```powershell
$env:SUPABASE_RECOVERY_DB_URL = "postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require"
```

Preview recovery of a backup created by `backup_supabase.py`. Without
`--confirm`, the script validates the backup and prints the target and plan but
does not write to the database:

```powershell
python scripts/recover_supabase.py `
  --backup-file "backups\supabase_sccs_full_YYYYMMDD_HHMMSS.sql"
```

Execute that recovery into a new database or an empty `sccs` schema:

```powershell
python scripts/recover_supabase.py `
  --backup-file "backups\supabase_sccs_full_YYYYMMDD_HHMMSS.sql" `
  --confirm
```

Preview and then execute recovery of a `pg_dump` backup:

```powershell
python scripts/recover_supabase_pg_dump.py `
  --backup-file "backups\supabase_sccs_pg_dump_YYYYMMDD_HHMMSS.sql"

python scripts/recover_supabase_pg_dump.py `
  --backup-file "backups\supabase_sccs_pg_dump_YYYYMMDD_HHMMSS.sql" `
  --confirm
```

Both scripts automatically select the newest corresponding backup under
`backups/` when `--backup-file` is omitted. To replace an existing `sccs`
schema, add both `--replace-schema` and `--confirm`:

```powershell
python scripts/recover_supabase_pg_dump.py --replace-schema --confirm
```

`--replace-schema` drops the target `sccs` schema inside the same recovery
transaction before loading the backup. Take a fresh backup and test recovery in
a staging project before replacing production data. For the pure-Python format,
generate a new backup with the current `backup_supabase.py` before recovery so
its dependency ordering, identity inserts, and sequence resets are included.

These scripts back up and restore only the `sccs` schema. Supabase Auth users,
password data, Storage objects, and other Supabase-managed schemas are outside
their scope and must be backed up or recreated separately; referenced Auth
users must exist before restoring `sccs` rows that point to them.

`scripts/import_supabase.py` below is specifically for the June 2026 legacy SQL
Server migration. It is not the restore command for current Supabase backups.

### Back up and recover Supabase Auth and Storage

Database-only backups do not contain the actual files stored by Supabase
Storage. Use `backup_supabase_auth_storage.py` to export Auth table data,
including password hashes, and download every Storage object. Passwords remain
hashed and are never printed or stored as plaintext.

Requirements:

- PostgreSQL `pg_dump` for the Auth data backup
- PostgreSQL `psql` for Auth recovery
- `SUPABASE_DB_URL` or `SUPABASE_DB_POOLER_URL` in `.env.local`
- `SUPABASE_URL` or `VITE_SUPABASE_URL` for the source project
- `SUPABASE_SERVICE_ROLE_KEY` for source Storage access

Create the combined backup:

```powershell
python scripts/backup_supabase_auth_storage.py
```

The command creates a timestamped directory such as
`backups/supabase_auth_storage_YYYYMMDD_HHMMSS/` containing:

- `auth_data.sql` with Auth users, identities, and hashed passwords
- `storage_manifest.json` with bucket settings and object metadata
- `storage_blobs/` with content-addressed Storage files named by SHA-256

Use `--skip-auth` or `--skip-storage` when only one component is needed.

Recovery requires separate target credentials. Use a newly created Supabase
project without existing Auth users to avoid identity and email conflicts:

```powershell
$env:SUPABASE_RECOVERY_DB_URL = "postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require"
$env:SUPABASE_RECOVERY_URL = "https://TARGET_PROJECT_REF.supabase.co"
$env:SUPABASE_RECOVERY_SERVICE_ROLE_KEY = "TARGET_SERVICE_ROLE_KEY"
```

Validate checksums and print the recovery plan without changing the target:

```powershell
python scripts/recover_supabase_auth_storage.py `
  --backup-dir "backups\supabase_auth_storage_YYYYMMDD_HHMMSS"
```

Execute Auth and Storage recovery only after reviewing that plan:

```powershell
python scripts/recover_supabase_auth_storage.py `
  --backup-dir "backups\supabase_auth_storage_YYYYMMDD_HHMMSS" `
  --confirm
```

The recovery script restores Auth inside one PostgreSQL transaction and uploads
Storage objects through the Storage API with upsert enabled. Storage recovery
can therefore be rerun after an interrupted upload. `--skip-auth` and
`--skip-storage` are also supported during recovery.

Auth and Storage are Supabase-managed systems. Test recovery against a staging
project before disaster recovery in production. A different project JWT secret
invalidates existing sessions, so users must sign in again; the restored
password hashes still allow their existing passwords. Custom Auth triggers,
Storage RLS policies, and other schema customizations must remain in the
repository migrations and be applied separately. Protect the backup directory
as credential-sensitive data even though passwords are hashed.

### Import directly with Python

The Supabase SQL Editor rejects the legacy data file because it is too large.
Use the direct PostgreSQL importer instead:

```powershell
python -m pip install -r requirements-import.txt
python scripts/import_supabase.py
```

Put `SUPABASE_DB_URL` in `.env.local`; the importer loads it automatically and
adds `sslmode=require` when needed. Copy the connection string from
**Supabase > Connect**. The Session Pooler connection works when the direct
database host is unavailable; save that URI as `SUPABASE_DB_POOLER_URL`.
The importer runs both migrations and the private data file in one transaction,
verifies all eight row counts, and rolls everything back on failure.

Useful options:

```powershell
python scripts/import_supabase.py --dry-run
python scripts/import_supabase.py --schema-only
python scripts/import_supabase.py --data-only
```

### Migrate legacy passwords

Do not store a password hash in `sccs.families` or verify passwords in browser
code. Supabase Auth owns password hashing and verification. Put a newly rotated
service-role key in `.env.local`, then preview the account migration:

```powershell
python scripts/migrate_legacy_auth.py --dry-run
```

The default migration preserves usable legacy passwords:

```powershell
python scripts/migrate_legacy_auth.py --yes
```

To force every migrated account to use **Forgot password** instead:

```powershell
python scripts/migrate_legacy_auth.py --force-reset --yes
```

The script never prints or writes passwords. Invalid emails, duplicate emails,
and passwords that do not satisfy Supabase's minimum are reported for manual
handling.

Assign portal roles from a trusted local environment:

```powershell
python scripts/set_portal_role.py --email admin@example.org --role admin --yes
python scripts/set_portal_role.py --email teacher@example.org `
  --role sccs_teacher_ta_role --teacher-id 123 --yes
```

The separate staff portal is available at `/admin`. Administrator, management
team, and teacher/TA accounts must use `@ctsccs.org` email addresses. Initialize
the first administrator by setting `ADMIN_INITIAL_PASSWORD` only in the current
shell and running:

```powershell
python scripts/bootstrap_admin.py
```

The password is stored and verified only by Supabase Auth. The `sccs.admins`
table contains profile information and the first-login password-change flag,
never a plaintext password or application-managed password hash.

### Export email lists

The email export scripts use the PostgreSQL connection in `.env.local`. Set
`SUPABASE_DB_URL` or `SUPABASE_DB_POOLER_URL` and install the Python dependency
before running them:

```powershell
python -m pip install -r requirements-import.txt
```

Export the unique email addresses of parents whose students have at least one
registered course:

```powershell
python scripts/export_registered_parent_emails.py
```

Export active PTA Leader emails and Admin Team Member emails into two separate
CSV files:

```powershell
python scripts/export_pta_admin_emails.py
```

Both scripts print the exported addresses and write timestamped CSV files to
`scripts/output/`. Use `--quiet` to print only the row counts and file paths, or
use `--output-dir` to select another destination:

```powershell
python scripts/export_registered_parent_emails.py --quiet
python scripts/export_pta_admin_emails.py --quiet --output-dir C:\Exports
```

The default `scripts/output/` directory is ignored by Git because these files
contain private contact information.

### Password reset email

Forgot-password requests are handled by the Vercel Function at
`/api/forgot-password`. The function asks Supabase Auth for a recovery token,
wraps it in a first-party `${SITE_URL}/reset-password` link, and sends that link
through Google Workspace SMTP. The service-role key and SMTP password stay on
the server and must never use a `VITE_*` prefix.

The staff portal uses `/api/admin-forgot-password`. It generates a temporary
password only when the `@ctsccs.org` address exists in Supabase Auth and also
matches `teachers.email_1`, an administrator profile email, an admin-team profile
email, or the superadministrator role. It emails the credentials directly to the
same login address from `ywang@ctsccs.org`. Portal authorization remains enforced
after sign-in. The public response does not reveal whether an account exists.

Add these values to **Vercel > Project Settings > Environment Variables** for
Production, Preview, and Development as appropriate:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_SMTP_HOST
GOOGLE_SMTP_PORT
GOOGLE_SMTP_USER
GOOGLE_SMTP_APP_PASSWORD
MAIL_FROM_NAME
MAIL_FROM_ADDRESS
SITE_URL
```

Local `.env.local` values are not automatically uploaded to Vercel. Set
`SITE_URL` to the deployed origin, for example `https://sccs.tianfu.app`.
Use Node.js 20 or newer locally and in Vercel.

## Production Build

Create an optimized build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

The generated files are written to `dist/`.

## Pages

The application includes local pages for:

- `/about`
- `/administration`
- `/regulation`
- `/newsletters`
- `/catalog`
- `/registration`
- `/calendar`
- `/courses`
- `/contact`
- `/location`
- `/community-services`
- `/sponsors`
- `/resources`
- `/links`
- `/feedback`
- `/login`
- `/account`

Internal navigation remains inside the React application instead of opening the
original `.aspx` pages.

## Project Structure

```text
src/
  main.jsx       Application shell, navigation, home page, and routing
  pages.jsx      Content for all internal pages
  styles.css     Global and responsive styles
index.html       Vite HTML entry point
```

## External Resources

Some public assets are still loaded from `https://ctsccs.org/`, including:

- Homepage slideshow images
- Sponsor and community-service images
- PDF handbooks, catalogs, calendars, newsletters, and course descriptions
- The existing My SCCS login and registration system

An internet connection and availability of the original website are therefore
required for those resources. To make the site fully standalone, download the
assets into `public/` and update the URLs in `src/main.jsx` and `src/pages.jsx`.

## Deployment

This is a single-page application. The hosting service should rewrite unknown
paths such as `/about` and `/courses` to `/index.html`.

For a basic static host, deploy the contents of `dist/` after running
`npm run build`.

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).
