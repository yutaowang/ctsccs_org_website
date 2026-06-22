#!/usr/bin/env python3
"""Remove a family account and related SCCS records by email.

Usage:
  python scripts/remove_family_account.py parent@example.com
  python scripts/remove_family_account.py parent@example.com --confirm

The default mode is a dry run. Add --confirm to delete records.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit, urlunsplit

import psycopg
from psycopg.rows import dict_row


ROOT = Path(__file__).resolve().parents[1]


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
            return psycopg.connect(require_ssl(dsn), row_factory=dict_row)
        except psycopg.OperationalError as exc:
            last_error = exc
    raise RuntimeError(f"Could not connect to Supabase database: {last_error}")


def fetch_targets(conn: psycopg.Connection, email: str) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, email, email_confirmed_at, created_at
            from auth.users
            where lower(email) = %s
            order by created_at desc
            """,
            (email,),
        )
        auth_users = cur.fetchall()
        auth_user_ids = [row["id"] for row in auth_users]

        cur.execute(
            """
            select id, legacy_family_id, user_id, email, parent_first_name, parent_last_name
            from sccs.families
            where lower(email) = %s
               or user_id = any(%s::uuid[])
            order by id
            """,
            (email, auth_user_ids),
        )
        families = cur.fetchall()
        family_ids = [row["id"] for row in families]

        cur.execute(
            """
            select id, family_id, first_name, last_name
            from sccs.students
            where family_id = any(%s::bigint[])
            order by id
            """,
            (family_ids,),
        )
        students = cur.fetchall()
        student_ids = [row["id"] for row in students]

        cur.execute(
            """
            select id, student_id, session_1, session_2, session_3
            from sccs.class_registrations
            where student_id = any(%s::bigint[])
            order by id
            """,
            (student_ids,),
        )
        class_registrations = cur.fetchall()

        cur.execute(
            """
            select id, family_id, method, amount_cents, status, stripe_checkout_session_id
            from sccs.payments
            where family_id = any(%s::bigint[])
            order by id
            """,
            (family_ids,),
        )
        payments = cur.fetchall()

        cur.execute(
            """
            select user_id, role, teacher_id
            from sccs.user_roles
            where user_id = any(%s::uuid[])
            order by created_at
            """,
            (auth_user_ids,),
        )
        user_roles = cur.fetchall()

    return {
        "auth_users": auth_users,
        "families": families,
        "students": students,
        "class_registrations": class_registrations,
        "payments": payments,
        "user_roles": user_roles,
    }


def print_summary(targets: dict) -> None:
    for label, rows in targets.items():
        print(f"\n{label}: {len(rows)}")
        for row in rows:
            print(f"  {dict(row)}")


def delete_targets(conn: psycopg.Connection, targets: dict) -> None:
    family_ids = [row["id"] for row in targets["families"]]
    student_ids = [row["id"] for row in targets["students"]]
    auth_user_ids = [row["id"] for row in targets["auth_users"]]

    with conn.cursor() as cur:
        if student_ids:
            cur.execute("delete from sccs.attendance where student_id = any(%s::bigint[])", (student_ids,))
            cur.execute("delete from sccs.student_grades where student_id = any(%s::bigint[])", (student_ids,))
            cur.execute("delete from sccs.class_registrations where student_id = any(%s::bigint[])", (student_ids,))
        if family_ids:
            cur.execute("delete from sccs.payments where family_id = any(%s::bigint[])", (family_ids,))
            cur.execute("delete from sccs.family_registrations where family_id = any(%s::bigint[])", (family_ids,))
            cur.execute("delete from sccs.students where family_id = any(%s::bigint[])", (family_ids,))
            cur.execute("delete from sccs.families where id = any(%s::bigint[])", (family_ids,))
        if auth_user_ids:
            cur.execute("delete from sccs.user_roles where user_id = any(%s::uuid[])", (auth_user_ids,))
            cur.execute("delete from auth.users where id = any(%s::uuid[])", (auth_user_ids,))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Remove a family account by email.")
    parser.add_argument("email", help="Family account email address to remove")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Actually delete the account. Without this flag, only prints a dry run.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    email = args.email.strip().lower()
    if "@" not in email:
        print("Please provide a valid email address.", file=sys.stderr)
        return 1

    with connect() as conn:
        targets = fetch_targets(conn, email)
        print_summary(targets)

        total = sum(len(rows) for rows in targets.values())
        if not total:
            print("\nNo matching account records found.")
            return 0

        if not args.confirm:
            print("\nDry run only. Add --confirm to delete these records.")
            return 0

        delete_targets(conn, targets)
        conn.commit()

        remaining = fetch_targets(conn, email)
        remaining_total = sum(len(rows) for rows in remaining.values())
        print(f"\nDeleted. Remaining matching records: {remaining_total}")
        if remaining_total:
            print_summary(remaining)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
