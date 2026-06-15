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

### Password reset email

Forgot-password requests are handled by the Vercel Function at
`/api/forgot-password`. Supabase Auth creates the signed recovery link, and the
function sends it through Google Workspace SMTP. The service-role key and SMTP
password stay on the server and must never use a `VITE_*` prefix.

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

Local `.env.local` values are not automatically uploaded to Vercel. Also add
`${SITE_URL}/account` to **Supabase Auth > URL Configuration > Redirect URLs**.
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
