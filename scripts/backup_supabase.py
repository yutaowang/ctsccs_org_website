#!/usr/bin/env python3
"""Create a data backup for the SCCS Supabase PostgreSQL database."""

from __future__ import annotations

import csv
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit, urlunsplit

import psycopg
from psycopg import sql


ROOT = Path(__file__).resolve().parents[1]
BACKUP_DIR = ROOT / "backups"
SCHEMAS = ("sccs",)


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
            credentials = f"{quote(unquote(user), safe='')}:{quote(unquote(password), safe='')}"
        else:
            credentials = quote(unquote(credentials), safe="")
        dsn = f"{scheme}{credentials}@{host}{suffix or ''}"

    parts = urlsplit(dsn)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.setdefault("sslmode", "require")
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def table_names(conn: psycopg.Connection) -> list[tuple[str, str]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select table_schema, table_name
            from information_schema.tables
            where table_type = 'BASE TABLE'
              and table_schema = any(%s)
            order by table_schema, table_name
            """,
            (list(SCHEMAS),),
        )
        return [(row[0], row[1]) for row in cur.fetchall()]


def column_names(conn: psycopg.Connection, schema: str, table: str) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select column_name
            from information_schema.columns
            where table_schema = %s
              and table_name = %s
            order by ordinal_position
            """,
            (schema, table),
        )
        return [row[0] for row in cur.fetchall()]


def write_copy_table(conn: psycopg.Connection, out, schema: str, table: str) -> int:
    columns = column_names(conn, schema, table)
    if not columns:
        return 0

    out.write(f"\n-- Data for {schema}.{table}\n")
    out.write(
        "COPY "
        + sql.Identifier(schema).as_string(conn)
        + "."
        + sql.Identifier(table).as_string(conn)
        + " ("
        + ", ".join(sql.Identifier(col).as_string(conn) for col in columns)
        + ") FROM stdin WITH (FORMAT csv, HEADER true);\n"
    )

    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(columns)

    with conn.cursor() as cur:
        query = sql.SQL("select {} from {}.{}").format(
            sql.SQL(", ").join(sql.Identifier(col) for col in columns),
            sql.Identifier(schema),
            sql.Identifier(table),
        )
        cur.execute(query)
        rows = 0
        for row in cur:
            writer.writerow(row)
            rows += 1

    out.write("\\.\n")
    return rows


def main() -> int:
    load_env_file(ROOT / ".env.local")
    dsns = [
        os.environ.get("SUPABASE_DB_URL"),
        os.environ.get("SUPABASE_DB_POOLER_URL"),
    ]
    dsns = [dsn for dsn in dsns if dsn]
    if not dsns:
        print("Missing SUPABASE_DB_URL or SUPABASE_DB_POOLER_URL in .env.local", file=sys.stderr)
        return 1

    BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"supabase_sccs_data_{timestamp}.sql"

    last_error: Exception | None = None
    for dsn in dsns:
        try:
            with psycopg.connect(require_ssl(dsn), autocommit=True) as conn:
                tables = table_names(conn)
                with backup_path.open("w", encoding="utf-8", newline="") as out:
                    out.write("-- SCCS Supabase data backup\n")
                    out.write(f"-- Created at {datetime.now(timezone.utc).isoformat()}\n")
                    out.write("-- Data-only backup for schema: sccs\n\n")
                    out.write("SET client_encoding = 'UTF8';\n")
                    out.write("SET check_function_bodies = false;\n")
                    out.write("SET session_replication_role = replica;\n")

                    counts: list[tuple[str, str, int]] = []
                    for schema, table in tables:
                        counts.append((schema, table, write_copy_table(conn, out, schema, table)))

                    out.write("\nSET session_replication_role = DEFAULT;\n")
            break
        except psycopg.OperationalError as exc:
            last_error = exc
    else:
        print(f"Could not connect to Supabase: {last_error}", file=sys.stderr)
        return 1

    print(f"Backup created: {backup_path}")
    for schema, table, rows in counts:
        print(f"{schema}.{table}: {rows} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
