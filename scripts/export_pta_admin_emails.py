#!/usr/bin/env python3
"""Export PTA Leader and Admin Team Member emails to separate CSV files.

The script uses the same Supabase connection configuration as the other SCCS
Python utilities. It creates two timestamped CSV files under scripts/output and
prints both email lists unless --quiet is provided.

Usage:
  python scripts/export_pta_admin_emails.py
  python scripts/export_pta_admin_emails.py --quiet
  python scripts/export_pta_admin_emails.py --output-dir C:\\Exports
"""

from __future__ import annotations

import argparse
import csv
import sys
from datetime import datetime
from pathlib import Path

import psycopg

from export_registered_parent_emails import connect


DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "output"


def fetch_emails(conn: psycopg.Connection) -> tuple[list[str], list[str]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select distinct lower(trim(email)) as email
            from sccs.pta_leaders
            where is_active
              and nullif(trim(email), '') is not null
            order by email
            """
        )
        pta_emails = [row[0] for row in cur.fetchall()]

        cur.execute(
            """
            select distinct lower(trim(email)) as email
            from sccs.admin_team_members
            where nullif(trim(email), '') is not null
            order by email
            """
        )
        admin_emails = [row[0] for row in cur.fetchall()]

    return pta_emails, admin_emails


def write_email_csv(emails: list[str], output_path: Path) -> None:
    with output_path.open("w", newline="", encoding="utf-8-sig") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["email"])
        writer.writerows([email] for email in emails)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export PTA Leader and Admin Team Member emails separately."
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
        help="Do not print individual emails; still print counts and CSV paths.",
    )
    return parser.parse_args()


def print_group(title: str, emails: list[str]) -> None:
    print(f"{title} ({len(emails)}):")
    for email in emails:
        print(email)


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir.expanduser().resolve()
    timestamp = datetime.now().astimezone().strftime("%Y%m%d_%H%M%S")
    pta_path = output_dir / f"pta_leader_emails_{timestamp}.csv"
    admin_path = output_dir / f"admin_team_member_emails_{timestamp}.csv"

    try:
        with connect() as conn:
            pta_emails, admin_emails = fetch_emails(conn)
        output_dir.mkdir(parents=True, exist_ok=True)
        write_email_csv(pta_emails, pta_path)
        write_email_csv(admin_emails, admin_path)
    except (OSError, psycopg.Error, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if not args.quiet:
        print_group("PTA Leaders", pta_emails)
        print()
        print_group("Admin Team Members", admin_emails)
        print()
    print(f"Exported {len(pta_emails)} unique PTA Leader emails.")
    print(f"PTA CSV: {pta_path}")
    print(f"Exported {len(admin_emails)} unique Admin Team Member emails.")
    print(f"Admin CSV: {admin_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
