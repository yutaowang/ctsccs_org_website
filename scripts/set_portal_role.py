#!/usr/bin/env python3
"""Assign an SCCS portal role to an existing Supabase Auth user."""

from __future__ import annotations

import argparse
import os
import sys

import psycopg

from import_supabase import ROOT, connection_candidates, load_env_file, require_ssl


ROLES = (
    "sccs_family_role",
    "sccs_teacher_ta_role",
    "sccs_admin_team_role",
    "admin",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", required=True, choices=ROLES)
    parser.add_argument(
        "--teacher-id",
        type=int,
        help="Required for sccs_teacher_ta_role; use the sccs.teachers ID.",
    )
    parser.add_argument("--yes", action="store_true")
    return parser.parse_args()


def main() -> int:
    load_env_file(ROOT / ".env.local")
    args = parse_args()
    email = args.email.strip().lower()
    if args.role == "sccs_teacher_ta_role" and not args.teacher_id:
        print("--teacher-id is required for the teacher/TA role.", file=sys.stderr)
        return 2
    if not args.yes:
        answer = input(f"Assign {args.role} to {email}? [y/N] ")
        if answer.strip().lower() not in {"y", "yes"}:
            print("Cancelled.")
            return 0

    configured = os.environ.get("SUPABASE_DB_POOLER_URL") or os.environ.get(
        "SUPABASE_DB_URL"
    )
    if not configured:
        print("A Supabase database URL is required in .env.local.", file=sys.stderr)
        return 2

    connection = None
    for _, candidate in connection_candidates(require_ssl(configured)):
        try:
            connection = psycopg.connect(candidate, connect_timeout=20)
            break
        except psycopg.OperationalError:
            continue
    if connection is None:
        print("Could not connect to Supabase.", file=sys.stderr)
        return 1

    try:
        with connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "select id from auth.users where lower(email) = %s",
                    (email,),
                )
                user = cursor.fetchone()
                if not user:
                    print("No Supabase Auth user found for that email.", file=sys.stderr)
                    return 1
                if args.teacher_id:
                    cursor.execute(
                        "select 1 from sccs.teachers where id = %s",
                        (args.teacher_id,),
                    )
                    if not cursor.fetchone():
                        print("Teacher ID was not found.", file=sys.stderr)
                        return 1
                cursor.execute(
                    """
                    insert into sccs.user_roles (user_id, role, teacher_id)
                    values (%s, %s, %s)
                    on conflict (user_id) do update
                    set role = excluded.role,
                        teacher_id = excluded.teacher_id,
                        updated_at = now()
                    """,
                    (user[0], args.role, args.teacher_id),
                )
        print(f"Role updated: {email} -> {args.role}")
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
