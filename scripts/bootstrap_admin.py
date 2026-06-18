#!/usr/bin/env python3
"""Create or update the initial SCCS administrator account."""

from __future__ import annotations

import argparse
import json
import os
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import psycopg

from import_supabase import ROOT, connection_candidates, load_env_file, require_ssl


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", default="superadmin@ctsccs.org")
    return parser.parse_args()


def auth_request(url: str, key: str, method: str, path: str, payload=None):
    request = Request(
        f"{url.rstrip('/')}{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"{}")
    except HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}")


def main() -> int:
    load_env_file(ROOT / ".env.local")
    args = parse_args()
    email = args.email.strip().lower()
    password = os.environ.get("ADMIN_INITIAL_PASSWORD")
    url = os.environ.get("VITE_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    configured = os.environ.get("SUPABASE_DB_POOLER_URL") or os.environ.get(
        "SUPABASE_DB_URL"
    )
    if not password or not url or not service_key or not configured:
        print(
            "ADMIN_INITIAL_PASSWORD and Supabase server credentials are required.",
            file=sys.stderr,
        )
        return 2
    if not email.endswith("@ctsccs.org"):
        print("Administrator email must use ctsccs.org.", file=sys.stderr)
        return 2

    status, listed = auth_request(
        url,
        service_key,
        "GET",
        f"/auth/v1/admin/users?page=1&per_page=1000",
    )
    if status != 200:
        print("Could not list Supabase Auth users.", file=sys.stderr)
        return 1
    existing = next(
        (user for user in listed.get("users", []) if user.get("email", "").lower() == email),
        None,
    )
    if existing:
        user_id = existing["id"]
        status, _ = auth_request(
            url,
            service_key,
            "PUT",
            f"/auth/v1/admin/users/{user_id}",
            {
                "email": email,
                "password": password,
                "email_confirm": True,
                "app_metadata": {"portal": "staff", "role": "admin"},
            },
        )
    else:
        status, created = auth_request(
            url,
            service_key,
            "POST",
            "/auth/v1/admin/users",
            {
                "email": email,
                "password": password,
                "email_confirm": True,
                "app_metadata": {"portal": "staff", "role": "admin"},
            },
        )
        user_id = created.get("id")
    if status not in {200, 201} or not user_id:
        print("Could not create or update the administrator Auth user.", file=sys.stderr)
        return 1

    connection = None
    for _, candidate in connection_candidates(require_ssl(configured)):
        try:
            connection = psycopg.connect(candidate, connect_timeout=20)
            break
        except psycopg.OperationalError:
            continue
    if connection is None:
        print("Could not connect to Supabase PostgreSQL.", file=sys.stderr)
        return 1

    try:
        with connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    insert into sccs.user_roles (user_id, role, teacher_id)
                    values (%s, 'sccs_superadmin_role'::sccs.app_role, null)
                    on conflict (user_id) do update
                    set role = excluded.role,
                        teacher_id = null,
                        updated_at = now()
                    """,
                    (user_id,),
                )
                cursor.execute(
                    """
                    insert into sccs.admins (
                      user_id, username, email, must_change_password
                    )
                    values (%s, %s, %s, true)
                    on conflict (user_id) do update
                    set username = excluded.username,
                        email = excluded.email,
                        must_change_password = true,
                        updated_at = now()
                    """,
                    (user_id, "superadmin", email),
                )
        print(f"Superadmin initialized: {email}")
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
