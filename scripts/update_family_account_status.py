#!/usr/bin/env python3
"""Update a family account's computed payment status.

Family Search status is computed from profile, students, registrations, and
payments. This script adjusts payment records to move a family between common
payment-related statuses.

Examples:
  python scripts/update_family_account_status.py --email parent@example.com --status waiting-for-payment
  python scripts/update_family_account_status.py --family-id 56419 --status paid --confirm
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit, urlunsplit

import psycopg
from psycopg.rows import dict_row


ROOT = Path(__file__).resolve().parents[1]
SAFETY_PATROL_DEPOSIT_CENTS = 4000


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


def require_ssl(dsn: str) -> str:
    if not dsn.startswith(("postgres://", "postgresql://")):
        return dsn

    match = re.match(r"^(postgres(?:ql)?://)(.*)@([^/]+)(/.*)?$", dsn, re.DOTALL)
    if match:
        scheme, credentials, host, suffix = match.groups()
        if ":" in credentials:
            user, password = credentials.split(":", 1)
            credentials = f"{quote(unquote(user), safe='')}:{quote(unquote(password), safe='')}"
        else:
            credentials = quote(unquote(credentials), safe="")
        dsn = f"{scheme}{credentials}@{host}{suffix or ''}"

    parts = urlsplit(dsn)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.setdefault("sslmode", "require")
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def connect() -> psycopg.Connection:
    load_env_file(ROOT / ".env.local")
    dsns = [os.environ.get("SUPABASE_DB_URL"), os.environ.get("SUPABASE_DB_POOLER_URL")]
    last_error: Exception | None = None
    for dsn in [value for value in dsns if value]:
        try:
            return psycopg.connect(require_ssl(dsn), row_factory=dict_row)
        except psycopg.OperationalError as exc:
            last_error = exc
    raise RuntimeError(f"Could not connect to Supabase database: {last_error}")


def cents(value) -> int:
    try:
        return int(round(float(value or 0) * 100))
    except (TypeError, ValueError):
        return 0


def find_family(conn: psycopg.Connection, email: str | None, family_id: int | None) -> dict:
    with conn.cursor() as cur:
        if family_id:
            cur.execute(
                """
                select id, legacy_family_id, user_id, email, parent_first_name, parent_last_name
                from sccs.families
                where id = %s or legacy_family_id = %s
                order by id
                """,
                (family_id, family_id),
            )
        else:
            cur.execute(
                """
                select id, legacy_family_id, user_id, email, parent_first_name, parent_last_name
                from sccs.families
                where lower(email) = %s
                order by id
                """,
                (email,),
            )
        rows = cur.fetchall()
    if not rows:
        raise RuntimeError("No family profile matched.")
    if len(rows) > 1:
        raise RuntimeError(f"More than one family matched: {[row['id'] for row in rows]}")
    return rows[0]


def load_payment_context(conn: psycopg.Connection, family_id: int) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, first_name, last_name
            from sccs.students
            where family_id = %s
            order by id
            """,
            (family_id,),
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
        registrations = cur.fetchall()
        class_ids = sorted({
            class_id
            for row in registrations
            for class_id in (row["session_1"], row["session_2"], row["session_3"])
            if class_id
        })

        cur.execute(
            """
            select id, name, donation
            from sccs.classes
            where id = any(%s::bigint[])
            order by id
            """,
            (class_ids,),
        )
        classes = cur.fetchall()

        cur.execute(
            """
            select id, method, amount_cents, status, paid_at, stripe_checkout_session_id, notes
            from sccs.payments
            where family_id = %s
            order by id
            """,
            (family_id,),
        )
        payments = cur.fetchall()

    donation_cents = sum(cents(row["donation"]) for row in classes)
    due_cents = donation_cents + (SAFETY_PATROL_DEPOSIT_CENTS if class_ids else 0)
    paid_cents = sum(int(row["amount_cents"] or 0) for row in payments if row["status"] == "paid")
    current_status = computed_status(bool(students), bool(class_ids), due_cents, paid_cents)
    return {
        "students": students,
        "registrations": registrations,
        "classes": classes,
        "payments": payments,
        "due_cents": due_cents,
        "paid_cents": paid_cents,
        "current_status": current_status,
    }


def computed_status(has_students: bool, has_classes: bool, due_cents: int, paid_cents: int) -> str:
    if due_cents > 0 and paid_cents >= due_cents:
        return "Paid"
    if has_classes and due_cents > 0:
        return "Waiting for Payment"
    if has_classes:
        return "Registered Classes"
    if has_students:
        return "Added Students"
    return "Validated account only or Registered account only"


def print_context(family: dict, context: dict) -> None:
    parent = " ".join(
        part for part in [family.get("parent_first_name"), family.get("parent_last_name")] if part
    )
    print(f"Family: {family['id']} legacy={family.get('legacy_family_id')} {parent} {family.get('email')}")
    print(f"Current status: {context['current_status']}")
    print(f"Due: ${context['due_cents'] / 100:.2f}")
    print(f"Paid: ${context['paid_cents'] / 100:.2f}")
    print(f"Students: {len(context['students'])}")
    print(f"Registrations: {len(context['registrations'])}")
    print(f"Classes: {len(context['classes'])}")
    print(f"Payments: {len(context['payments'])}")
    for payment in context["payments"]:
        print(
            "  payment "
            f"id={payment['id']} method={payment['method']} "
            f"amount=${int(payment['amount_cents'] or 0) / 100:.2f} "
            f"status={payment['status']} session={payment.get('stripe_checkout_session_id') or ''}"
        )


def set_waiting_for_payment(conn: psycopg.Connection, family_id: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update sccs.payments
            set status = 'cancelled',
                notes = concat_ws('; ', nullif(notes, ''), 'Status reset to Waiting for Payment by script'),
                updated_at = now()
            where family_id = %s
              and status = 'paid'
            """,
            (family_id,),
        )


def set_paid(conn: psycopg.Connection, family_id: int, context: dict, method: str, notes: str | None) -> None:
    balance_cents = max(context["due_cents"] - context["paid_cents"], 0)
    if balance_cents <= 0:
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into sccs.payments (
              family_id, method, amount_cents, currency, paid_at, status, notes
            )
            values (%s, %s, %s, 'usd', %s, 'paid', %s)
            """,
            (
                family_id,
                method,
                balance_cents,
                datetime.now(timezone.utc),
                notes or "Marked paid by update_family_account_status.py",
            ),
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update computed family account payment status.")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--email", help="Family email address")
    target.add_argument("--family-id", type=int, help="SCCS internal or legacy family id")
    parser.add_argument(
        "--status",
        required=True,
        choices=["paid", "waiting-for-payment"],
        help="Target status to force through payment records",
    )
    parser.add_argument("--method", default="cash", choices=["cash", "check", "online"], help="Payment method for --status paid")
    parser.add_argument("--notes", help="Notes for inserted payment when setting status to paid")
    parser.add_argument("--confirm", action="store_true", help="Actually update records. Default is dry run.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    email = args.email.strip().lower() if args.email else None

    with connect() as conn:
      family = find_family(conn, email, args.family_id)
      context = load_payment_context(conn, family["id"])
      print_context(family, context)

      if args.status == "waiting-for-payment":
          print("\nAction: mark all paid payments for this family as cancelled.")
      elif args.status == "paid":
          print("\nAction: insert a paid payment for the remaining balance, if any.")

      if not args.confirm:
          print("\nDry run only. Add --confirm to apply this change.")
          return 0

      if args.status == "waiting-for-payment":
          set_waiting_for_payment(conn, family["id"])
      elif args.status == "paid":
          set_paid(conn, family["id"], context, args.method, args.notes)
      conn.commit()

      updated = load_payment_context(conn, family["id"])
      print("\nUpdated:")
      print_context(family, updated)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
