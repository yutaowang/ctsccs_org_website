#!/usr/bin/env python3
"""Apply the Waterford/PTA production migrations transactionally and verify them."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg

from import_supabase import connection_candidates, load_env_file, require_ssl, safe_error


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = (
    ROOT / "supabase/migrations/20260629_family_pfizer_employee.sql",
    ROOT / "supabase/migrations/20260913230655_waterford_annual_seats.sql",
    ROOT / "supabase/migrations/20260913231422_member_deposit_waivers_pta.sql",
)


def connect():
    load_env_file(ROOT / ".env.local")
    configured = os.environ.get("SUPABASE_DB_URL")
    if not configured:
        raise RuntimeError("SUPABASE_DB_URL is missing from .env.local")
    errors: list[str] = []
    for label, dsn in connection_candidates(require_ssl(configured)):
        try:
            return psycopg.connect(dsn), label
        except Exception as exc:  # pragma: no cover - depends on network route
            errors.append(f"{label}: {safe_error(exc)}")
    raise RuntimeError("; ".join(errors))


def main() -> int:
    try:
        connection, label = connect()
        with connection:
            existing = connection.execute(
                "select to_regclass('sccs.waterford_seats'), to_regclass('sccs.pta_leaders')"
            ).fetchone()
            if any(existing):
                raise RuntimeError(
                    "Target tables already exist; refusing to reapply or repair a partial deployment"
                )
            registrations, families = connection.execute(
                "select (select count(*) from sccs.class_registrations), "
                "(select count(*) from sccs.families)"
            ).fetchone()
            for migration in MIGRATIONS:
                connection.execute(migration.read_text(encoding="utf-8"))

            family_columns = connection.execute(
                "select count(*) "
                "from information_schema.columns where table_schema='sccs' "
                "and table_name='families' and column_name in ('pfizer_employee','waterford_resident')"
            ).fetchone()[0]

            seat_usage = connection.execute(
                "select used, waiting from sccs.waterford_seat_usage"
            ).fetchone()
            pta = connection.execute(
                "select name_zh, email from sccs.pta_leaders order by display_order"
            ).fetchall()
            expected_pta = [
                ("罗雪梅", "xuemei.luo@pfizer.com"),
                ("伍緎榛", None),
                ("吴霞", "wuxiayu@gmail.com"),
                ("曾百灵", "bevanzeng8@gmail.com"),
                ("待定", None),
            ]
            if (family_columns != 2
                    or seat_usage is None or seat_usage[0] > 20 or pta != expected_pta):
                raise RuntimeError(
                    "Post-migration verification failed: "
                    f"family_columns={family_columns!r}, seat_usage={seat_usage!r}, "
                    f"pta_seed_matches={pta == expected_pta}, pta_rows={len(pta)}"
                )
        print(
            f"Production migrations committed via {label}. "
            f"Verified {registrations} registrations, {families} families, "
            f"{seat_usage[0]}/20 free seats used, {seat_usage[1]} waiting, and 5 PTA records."
        )
        return 0
    except Exception as exc:
        print(f"Deployment failed and was rolled back: {safe_error(exc)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
