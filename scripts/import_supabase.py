#!/usr/bin/env python3
"""Import the SCCS schema and converted legacy data into Supabase PostgreSQL."""

from __future__ import annotations

import argparse
import getpass
import os
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit, urlunsplit

try:
    import psycopg
except ImportError:
    psycopg = None


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
DEFAULT_DATA = ROOT / "supabase" / "seed" / "legacy_data_20260615.sql"

EXPECTED_COUNTS = {
    "class_times": ("sccs.class_times", "legacy_class_time_id is not null", 10),
    "teachers": ("sccs.teachers", "legacy_teacher_id is not null", 121),
    "classes": ("sccs.classes", "legacy_class_id is not null", 72),
    "families": ("sccs.families", "legacy_family_id is not null", 1444),
    "students": ("sccs.students", "legacy_student_id is not null", 1184),
    "class_registrations": (
        "sccs.class_registrations",
        "legacy_class_registration_id is not null",
        163,
    ),
    "family_registrations": (
        "sccs.family_registrations",
        "legacy_family_registration_id is not null",
        123,
    ),
    "legacy_family_registration_test": (
        "sccs.legacy_family_registration_test",
        "true",
        164,
    ),
}


def load_env_file(path: Path) -> None:
    """Load simple KEY=VALUE entries without overriding process environment."""
    if not path.is_file():
        return

    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


def require_ssl(dsn: str) -> str:
    """Add sslmode=require when a PostgreSQL URL does not specify SSL behavior."""
    if not dsn.startswith(("postgres://", "postgresql://")):
        return dsn

    match = re.match(r"^(postgres(?:ql)?://)(.*)@([^/]+)(/.*)?$", dsn, re.DOTALL)
    if match:
        scheme, credentials, host, suffix = match.groups()
        if ":" in credentials:
            user, password = credentials.split(":", 1)
            credentials = (
                f"{quote(unquote(user), safe='')}:{quote(unquote(password), safe='')}"
            )
        else:
            credentials = quote(unquote(credentials), safe="")
        dsn = f"{scheme}{credentials}@{host}{suffix or ''}"

    parts = urlsplit(dsn)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.setdefault("sslmode", "require")
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def safe_error(exc: Exception) -> str:
    """Prevent database credentials from appearing in command output."""
    message = str(exc)
    return re.sub(
        r"(postgres(?:ql)?://[^:\s]+:)[^@\s]+(@)",
        r"\1***\2",
        message,
        flags=re.IGNORECASE,
    )


def connection_candidates(dsn: str) -> list[tuple[str, str]]:
    """Return direct and optional IPv4 pooler connection candidates."""
    candidates = [("configured connection", dsn)]
    explicit_pooler = os.environ.get("SUPABASE_DB_POOLER_URL")
    if explicit_pooler:
        candidates.append(("configured session pooler", require_ssl(explicit_pooler)))
        return candidates

    parts = urlsplit(dsn)
    host_match = re.fullmatch(r"db\.([a-z0-9]+)\.supabase\.co", parts.hostname or "")
    region = os.environ.get("SUPABASE_DB_REGION")
    if not host_match or not region:
        return candidates

    project_ref = host_match.group(1)
    username = unquote(parts.username or "postgres")
    if username == "postgres":
        username = f"postgres.{project_ref}"

    password = unquote(parts.password or "")
    pooler_host = f"aws-0-{region}.pooler.supabase.com"
    netloc = f"{quote(username, safe='')}:{quote(password, safe='')}@{pooler_host}:5432"
    pooler_dsn = urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
    candidates.append((f"{region} session pooler", pooler_dsn))
    return candidates


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Import SCCS migrations and legacy data directly into Supabase "
            "PostgreSQL, bypassing the SQL Editor size limit."
        )
    )
    parser.add_argument(
        "--database-url",
        help="PostgreSQL connection string. Prefer SUPABASE_DB_URL to avoid shell history.",
    )
    parser.add_argument("--host", help="Database or Supavisor host.")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--database", default="postgres")
    parser.add_argument("--user", help="Database user, such as postgres.PROJECT_REF.")
    parser.add_argument(
        "--data-file",
        type=Path,
        default=DEFAULT_DATA,
        help=f"Converted data SQL (default: {DEFAULT_DATA})",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--schema-only", action="store_true", help="Run migrations only.")
    mode.add_argument("--data-only", action="store_true", help="Import and verify data only.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate files and show the planned work without connecting.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip the confirmation prompt.",
    )
    return parser.parse_args()


def connection_string(args: argparse.Namespace) -> str:
    dsn = args.database_url or os.environ.get("SUPABASE_DB_URL")
    if dsn:
        return require_ssl(dsn)

    if not args.host or not args.user:
        raise ValueError(
            "Set SUPABASE_DB_URL, pass --database-url, or provide both --host and --user."
        )

    password = os.environ.get("SUPABASE_DB_PASSWORD")
    if password is None:
        password = getpass.getpass("Supabase database password: ")

    return (
        f"postgresql://{quote(args.user, safe='')}:{quote(password, safe='')}"
        f"@{args.host}:{args.port}/{args.database}?sslmode=require"
    )


def read_sql(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(f"SQL file not found: {path}")
    return path.read_text(encoding="utf-8")


def seed_body(sql: str) -> str:
    """Remove the generated seed's own transaction wrapper."""
    sql = re.sub(r"^\s*begin\s*;\s*", "", sql, count=1, flags=re.IGNORECASE)
    sql = re.sub(r"\s*commit\s*;\s*$", "", sql, count=1, flags=re.IGNORECASE)
    return sql


def planned_files(args: argparse.Namespace) -> list[Path]:
    files: list[Path] = []
    if not args.data_only:
        files.extend(sorted(MIGRATIONS_DIR.glob("*.sql")))
    if not args.schema_only:
        files.append(args.data_file.resolve())
    return files


def verify(cur: "psycopg.Cursor") -> bool:
    print("\nImport verification")
    print("-" * 68)
    all_match = True
    for label, (table, condition, expected) in EXPECTED_COUNTS.items():
        cur.execute(f"select count(*) from {table} where {condition}")
        actual = cur.fetchone()[0]
        matches = actual == expected
        all_match = all_match and matches
        status = "OK" if matches else "MISMATCH"
        print(f"{label:34} {actual:6} / {expected:6}  {status}")

    cur.execute(
        """
        select
          (select count(*) from sccs.students
           where family_id is null and legacy_family_id is not null),
          (select count(*) from sccs.class_registrations
           where student_id is null and legacy_student_id is not null),
          (select count(*) from sccs.families where user_id is not null),
          (select count(*) from sccs.families where user_id is null)
        """
    )
    orphan_students, orphan_registrations, linked, unlinked = cur.fetchone()
    print("-" * 68)
    print(f"Preserved students with missing legacy family: {orphan_students}")
    print(f"Preserved registrations with missing student: {orphan_registrations}")
    print(f"Families linked to Supabase Auth: {linked}")
    print(f"Families waiting for account registration: {unlinked}")
    return all_match


def main() -> int:
    load_env_file(ROOT / ".env.local")
    args = parse_args()
    files = planned_files(args)

    try:
        sql_files = [(path, read_sql(path)) for path in files]
    except (OSError, UnicodeError) as exc:
        print(f"File error: {exc}", file=sys.stderr)
        return 2

    print("Planned SQL files:")
    for path, sql in sql_files:
        print(f"  {path.relative_to(ROOT)} ({len(sql.encode('utf-8')):,} bytes)")

    if args.dry_run:
        print("Dry run complete. No database connection was made.")
        return 0

    if psycopg is None:
        print(
            "Missing dependency. Install it with:\n"
            "  python -m pip install -r requirements-import.txt",
            file=sys.stderr,
        )
        return 2

    try:
        dsn = connection_string(args)
    except ValueError as exc:
        print(f"Connection configuration error: {exc}", file=sys.stderr)
        return 2

    if not args.yes:
        answer = input(
            "\nThis will write SCCS schema/data to the configured Supabase database. "
            "Continue? [y/N] "
        )
        if answer.strip().lower() not in {"y", "yes"}:
            print("Cancelled.")
            return 0

    last_connection_error = None
    conn = None
    for label, candidate in connection_candidates(dsn):
        try:
            print(f"\nConnecting with {label} ...")
            conn = psycopg.connect(candidate, connect_timeout=20)
            break
        except psycopg.OperationalError as exc:
            last_connection_error = exc
            print(f"  unavailable: {safe_error(exc)}")

    if conn is None:
        print(
            f"\nImport failed before a transaction was started:\n"
            f"{safe_error(last_connection_error)}\n"
            "If the direct Supabase host is IPv6-only, copy the Session pooler "
            "URI from Supabase > Connect into SUPABASE_DB_POOLER_URL in .env.local.",
            file=sys.stderr,
        )
        return 1

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("select current_database(), current_user")
                database, user = cur.fetchone()
                print(f"\nConnected to database {database!r} as {user!r}.")

                for path, sql in sql_files:
                    print(f"Running {path.relative_to(ROOT)} ...", flush=True)
                    cur.execute(seed_body(sql) if path == args.data_file.resolve() else sql)
                    print("  done")

                if not args.schema_only:
                    all_match = verify(cur)
                    if not all_match:
                        raise RuntimeError(
                            "Imported row counts do not match the backup; rolling back."
                        )

            conn.commit()
        print("\nImport committed successfully.")
        return 0
    except (psycopg.Error, RuntimeError) as exc:
        print(f"\nImport failed and was rolled back:\n{safe_error(exc)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
