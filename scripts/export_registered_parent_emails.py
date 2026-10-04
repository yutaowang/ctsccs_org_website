#!/usr/bin/env python3
"""Export unique parent emails for families with at least one registered course.

The script reads the Supabase PostgreSQL connection string from .env.local:
SUPABASE_DB_URL or SUPABASE_DB_POOLER_URL. By default, it creates a timestamped
CSV under scripts/output and prints every exported email.

Usage:
  python scripts/export_registered_parent_emails.py
  python scripts/export_registered_parent_emails.py --quiet
  python scripts/export_registered_parent_emails.py --output-dir C:\\Exports
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit, urlunsplit

import psycopg


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "output"


def load_env_file(path: Path) -> None:
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


def connect() -> psycopg.Connection:
    load_env_file(ROOT / ".env.local")
    dsns = [
        os.environ.get("SUPABASE_DB_URL"),
        os.environ.get("SUPABASE_DB_POOLER_URL"),
    ]
    last_error: Exception | None = None
    for dsn in [value for value in dsns if value]:
        try:
            return psycopg.connect(require_ssl(dsn), connect_timeout=20)
        except psycopg.OperationalError as exc:
            last_error = exc

    if last_error:
        raise RuntimeError(f"Could not connect to Supabase database: {last_error}")
    raise RuntimeError(
        "Missing SUPABASE_DB_URL or SUPABASE_DB_POOLER_URL in .env.local."
    )


def fetch_registered_parent_emails(conn: psycopg.Connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select distinct lower(
              coalesce(nullif(trim(au.email), ''), nullif(trim(f.email), ''))
            ) as email
            from sccs.families f
            left join auth.users au on au.id = f.user_id
            where coalesce(nullif(trim(au.email), ''), nullif(trim(f.email), '')) is not null
              and exists (
                select 1
                from sccs.students s
                join sccs.class_registrations r on r.student_id = s.id
                where s.family_id = f.id
                  and (
                    r.session_1 is not null
                    or r.session_2 is not null
                    or r.session_3 is not null
                  )
              )
            order by email
            """
        )
        return [row[0] for row in cur.fetchall()]


def write_csv(emails: list[str], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().astimezone().strftime("%Y%m%d_%H%M%S")
    output_path = output_dir / f"registered_parent_emails_{timestamp}.csv"
    with output_path.open("w", newline="", encoding="utf-8-sig") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["email"])
        writer.writerows([email] for email in emails)
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export unique parent emails for families with registered courses."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"CSV destination directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Do not print individual email addresses; still print count and CSV path.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        with connect() as conn:
            emails = fetch_registered_parent_emails(conn)
        output_path = write_csv(emails, args.output_dir.expanduser().resolve())
    except (OSError, psycopg.Error, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if not args.quiet:
        for email in emails:
            print(email)
    print(f"Exported {len(emails)} unique parent emails.")
    print(f"CSV: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
