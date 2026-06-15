#!/usr/bin/env python3
"""Migrate legacy FAMILY email/password rows into Supabase Auth."""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sys
import time
from collections import defaultdict
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BACKUP = Path(
    r"C:\Users\wyatt\Desktop\20230701_CT_SCCS_ORG"
    r"\DB_Dev_Backup\Scripts_bkup_20260615.sql"
)
EMAIL_PATTERN = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+"
    r"[A-Za-z]{2,63}$"
)


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if value and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ.setdefault(key.strip(), value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create Supabase Auth users from the legacy FAMILY table. "
            "Passwords are never printed or written to output files."
        )
    )
    parser.add_argument("--backup", type=Path, default=DEFAULT_BACKUP)
    parser.add_argument(
        "--force-reset",
        action="store_true",
        help=(
            "Assign random passwords and require Forgot password. By default, "
            "usable legacy passwords are preserved."
        ),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--yes", action="store_true")
    return parser.parse_args()


def split_values(text: str) -> list[str]:
    values: list[str] = []
    start = 0
    depth = 0
    quoted = False
    index = 0
    while index < len(text):
        char = text[index]
        if char == "'":
            if quoted and index + 1 < len(text) and text[index + 1] == "'":
                index += 1
            else:
                quoted = not quoted
        elif not quoted and char == "(":
            depth += 1
        elif not quoted and char == ")":
            depth -= 1
        elif not quoted and depth == 0 and char == ",":
            values.append(text[start:index].strip())
            start = index + 1
        index += 1
    values.append(text[start:].strip())
    return values


def parse_value(expression: str):
    if expression.upper() == "NULL":
        return None
    string = re.fullmatch(r"N?'((?:''|[^'])*)'", expression, re.DOTALL)
    if string:
        return string.group(1).replace("''", "'")
    if re.fullmatch(r"-?\d+", expression):
        return int(expression)
    return expression


def statement_complete(statement: str) -> bool:
    values_match = re.search(r"\bVALUES\s*\(", statement, re.IGNORECASE)
    if not values_match:
        return False
    start = statement.find("(", values_match.start())
    depth = 0
    quoted = False
    index = start
    while index < len(statement):
        char = statement[index]
        if char == "'":
            if quoted and index + 1 < len(statement) and statement[index + 1] == "'":
                index += 1
            else:
                quoted = not quoted
        elif not quoted and char == "(":
            depth += 1
        elif not quoted and char == ")":
            depth -= 1
        index += 1
    return not quoted and depth == 0


def read_family_rows(path: Path) -> list[dict]:
    raw = path.read_bytes()
    encoding = "utf-16" if raw.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
    rows: list[dict] = []
    statement = ""

    for line in raw.decode(encoding).splitlines():
        if not statement:
            if not line.startswith("INSERT [dbo].[FAMILY]"):
                continue
            statement = line
        else:
            statement += "\n" + line

        if not statement_complete(statement):
            continue

        match = re.fullmatch(
            r"INSERT\s+\[dbo\]\.\[FAMILY\]\s+\((.*?)\)\s+VALUES\s+\((.*)\)",
            statement,
            re.IGNORECASE | re.DOTALL,
        )
        if not match:
            raise ValueError(f"Could not parse FAMILY statement: {statement[:120]}")
        columns = re.findall(r"\[([^\]]+)\]", match.group(1))
        values = [parse_value(value) for value in split_values(match.group(2))]
        rows.append(dict(zip(columns, values, strict=True)))
        statement = ""

    return rows


class SupabaseAdmin:
    def __init__(self, url: str, service_key: str):
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }

    def request(self, method: str, path: str, payload: dict | None = None):
        body = json.dumps(payload).encode() if payload is not None else None
        request = Request(
            f"{self.url}{path}",
            data=body,
            headers=self.headers,
            method=method,
        )
        try:
            with urlopen(request, timeout=30) as response:
                return response.status, json.loads(response.read() or b"{}")
        except HTTPError as exc:
            response_body = exc.read().decode("utf-8", errors="replace")
            try:
                details = json.loads(response_body)
            except json.JSONDecodeError:
                details = {"message": response_body}
            return exc.code, details

    def existing_emails(self) -> set[str]:
        emails: set[str] = set()
        page = 1
        while True:
            status, data = self.request(
                "GET", f"/auth/v1/admin/users?page={page}&per_page=1000"
            )
            if status != 200:
                raise RuntimeError(f"Could not list Auth users: HTTP {status}")
            users = data.get("users", [])
            emails.update(
                user["email"].strip().lower()
                for user in users
                if user.get("email")
            )
            if len(users) < 1000:
                break
            page += 1
        return emails

    def create_user(self, email: str, password: str, family_id: int, reset_required: bool):
        return self.request(
            "POST",
            "/auth/v1/admin/users",
            {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {
                    "legacy_family_id": family_id,
                    "legacy_password_migrated": not reset_required,
                    "password_reset_required": reset_required,
                },
            },
        )


def main() -> int:
    load_env_file(ROOT / ".env.local")
    args = parse_args()

    if not args.backup.is_file():
        print(f"Backup not found: {args.backup}", file=sys.stderr)
        return 2

    rows = read_family_rows(args.backup)
    by_email: dict[str, list[dict]] = defaultdict(list)
    invalid: list[int] = []
    for row in rows:
        email = str(row.get("FamilyName") or "").strip().lower()
        if (
            not EMAIL_PATTERN.fullmatch(email)
            or ".." in email
            or email.startswith(".")
            or email.split("@", 1)[0].endswith(".")
        ):
            invalid.append(row["FamilyId"])
        else:
            by_email[email].append(row)

    duplicate = {email: items for email, items in by_email.items() if len(items) > 1}
    candidates = [
        (email, items[0])
        for email, items in by_email.items()
        if len(items) == 1
    ]
    if args.limit:
        candidates = candidates[: args.limit]

    usable_passwords = sum(
        1 for _, row in candidates if len(str(row.get("Mima") or "")) >= 6
    )
    print(f"Legacy FAMILY rows: {len(rows)}")
    print(f"Unique valid-email candidates: {len(candidates)}")
    print(f"Invalid/blank emails skipped: {len(invalid)}")
    print(f"Duplicate email groups skipped: {len(duplicate)}")
    print(f"Passwords usable by Supabase policy: {usable_passwords}")
    print(
        "Mode: force password reset for every migrated account"
        if args.force_reset
        else "Mode: preserve usable legacy passwords"
    )

    if args.dry_run:
        return 0

    url = os.environ.get("VITE_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_key:
        print(
            "VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local.",
            file=sys.stderr,
        )
        return 2

    if not args.yes:
        answer = input("Create these users in Supabase Auth? [y/N] ")
        if answer.strip().lower() not in {"y", "yes"}:
            print("Cancelled.")
            return 0

    admin = SupabaseAdmin(url, service_key)
    try:
        existing = admin.existing_emails()
    except (RuntimeError, URLError) as exc:
        print(f"Could not connect to Supabase Auth: {exc}", file=sys.stderr)
        return 1

    created = 0
    skipped_existing = 0
    reset_required_count = 0
    failures: list[tuple[int, int]] = []
    for index, (email, row) in enumerate(candidates, start=1):
        if email in existing:
            skipped_existing += 1
            continue

        legacy_password = str(row.get("Mima") or "")
        preserve = not args.force_reset and len(legacy_password) >= 6
        password = legacy_password if preserve else secrets.token_urlsafe(32)
        status, _data = admin.create_user(
            email, password, row["FamilyId"], reset_required=not preserve
        )
        if status in {200, 201}:
            created += 1
            reset_required_count += int(not preserve)
            existing.add(email)
        else:
            failures.append((row["FamilyId"], status))

        if index % 100 == 0:
            print(f"Processed {index}/{len(candidates)} accounts...")
        time.sleep(0.03)

    print("\nMigration summary")
    print(f"Created: {created}")
    print(f"Already existed: {skipped_existing}")
    print(f"Created accounts requiring reset: {reset_required_count}")
    print(f"Failures: {len(failures)}")
    if failures:
        print("Failed legacy family IDs and HTTP statuses:")
        for family_id, status in failures:
            print(f"  {family_id}: HTTP {status}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
