#!/usr/bin/env python3
"""Create a schema and INSERT data backup for the SCCS Supabase PostgreSQL database."""

from __future__ import annotations

import os
import json
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


def column_type(row: dict) -> str:
    if row["identity_generation"]:
        return f"{row['data_type_sql']} GENERATED {row['identity_generation']} AS IDENTITY"
    return row["data_type_sql"]


def table_ddl(conn: psycopg.Connection, schema: str, table: str) -> str:
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute(
            """
            select
              a.attname as column_name,
              pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type_sql,
              pg_get_expr(d.adbin, d.adrelid) as column_default,
              case when a.attnotnull then 'NO' else 'YES' end as is_nullable,
              case a.attidentity when 'a' then 'ALWAYS' when 'd' then 'BY DEFAULT' else null end as identity_generation
            from pg_attribute a
            join pg_class c on c.oid = a.attrelid
            join pg_namespace n on n.oid = c.relnamespace
            left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where n.nspname = %s
              and c.relname = %s
              and a.attnum > 0
              and not a.attisdropped
            order by a.attnum
            """,
            (schema, table),
        )
        columns = cur.fetchall()

        cur.execute(
            """
            select conname, pg_get_constraintdef(oid, true) as definition
            from pg_constraint
            where conrelid = %s::regclass
            order by conname
            """,
            (f"{schema}.{table}",),
        )
        constraints = cur.fetchall()

    lines = [f"CREATE TABLE {sql.Identifier(schema).as_string(conn)}.{sql.Identifier(table).as_string(conn)} ("]
    definitions: list[str] = []
    for column in columns:
        parts = [
            sql.Identifier(column["column_name"]).as_string(conn),
            column_type(column),
        ]
        if column["column_default"] is not None and not column["identity_generation"]:
            parts.extend(["DEFAULT", column["column_default"]])
        if column["is_nullable"] == "NO":
            parts.append("NOT NULL")
        definitions.append("  " + " ".join(parts))

    for constraint in constraints:
        definitions.append(
            "  CONSTRAINT "
            + sql.Identifier(constraint["conname"]).as_string(conn)
            + " "
            + constraint["definition"]
        )

    lines.append(",\n".join(definitions))
    lines.append(");")
    return "\n".join(lines)


def write_schema(conn: psycopg.Connection, out, tables: list[tuple[str, str]]) -> None:
    out.write("-- Schema definitions\n")
    for schema in SCHEMAS:
        out.write(f"CREATE SCHEMA IF NOT EXISTS {sql.Identifier(schema).as_string(conn)};\n")
    out.write("\n")

    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute(
            """
            select n.nspname as schema_name, t.typname as type_name, array_agg(e.enumlabel order by e.enumsortorder) as labels
            from pg_type t
            join pg_namespace n on n.oid = t.typnamespace
            join pg_enum e on e.enumtypid = t.oid
            where n.nspname = any(%s)
            group by n.nspname, t.typname
            order by n.nspname, t.typname
            """,
            (list(SCHEMAS),),
        )
        enum_types = cur.fetchall()
        if enum_types:
            out.write("-- Types\n")
            for enum_type in enum_types:
                labels = ", ".join(sql.Literal(label).as_string(conn) for label in enum_type["labels"])
                out.write(
                    f"CREATE TYPE {sql.Identifier(enum_type['schema_name']).as_string(conn)}."
                    f"{sql.Identifier(enum_type['type_name']).as_string(conn)} AS ENUM ({labels});\n"
                )
            out.write("\n")

    for schema, table in tables:
        out.write(f"-- Table: {schema}.{table}\n")
        out.write(table_ddl(conn, schema, table))
        out.write("\n\n")

    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute(
            """
            select n.nspname as schema_name, p.proname as function_name, pg_get_functiondef(p.oid) as definition
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = any(%s)
            order by n.nspname, p.proname, p.oid
            """,
            (list(SCHEMAS),),
        )
        functions = cur.fetchall()
        if functions:
            out.write("-- Functions\n")
            for function in functions:
                out.write(function["definition"].rstrip())
                out.write("\n\n")

        cur.execute(
            """
            select schemaname, indexname, indexdef
            from pg_indexes
            where schemaname = any(%s)
              and not exists (
                select 1
                from pg_constraint constraint_row
                where constraint_row.conindid = (quote_ident(schemaname) || '.' || quote_ident(indexname))::regclass
              )
            order by schemaname, indexname
            """,
            (list(SCHEMAS),),
        )
        indexes = cur.fetchall()
        if indexes:
            out.write("-- Indexes\n")
            for index in indexes:
                out.write(f"{index['indexdef']};\n")
            out.write("\n")

        cur.execute(
            """
            select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity, c.relforcerowsecurity
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where c.relkind = 'r'
              and n.nspname = any(%s)
              and (c.relrowsecurity or c.relforcerowsecurity)
            order by n.nspname, c.relname
            """,
            (list(SCHEMAS),),
        )
        rls_rows = cur.fetchall()
        if rls_rows:
            out.write("-- Row level security\n")
            for row in rls_rows:
                table_name = f"{sql.Identifier(row['schema_name']).as_string(conn)}.{sql.Identifier(row['table_name']).as_string(conn)}"
                if row["relrowsecurity"]:
                    out.write(f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;\n")
                if row["relforcerowsecurity"]:
                    out.write(f"ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;\n")
            out.write("\n")

        cur.execute(
            """
            select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
            from pg_policies
            where schemaname = any(%s)
            order by schemaname, tablename, policyname
            """,
            (list(SCHEMAS),),
        )
        policies = cur.fetchall()
        if policies:
            out.write("-- Policies\n")
            for policy in policies:
                table_name = f"{sql.Identifier(policy['schemaname']).as_string(conn)}.{sql.Identifier(policy['tablename']).as_string(conn)}"
                roles = ", ".join(policy["roles"]) if policy["roles"] else "public"
                command = "ALL" if policy["cmd"] == "ALL" else policy["cmd"]
                out.write(
                    "CREATE POLICY "
                    + sql.Identifier(policy["policyname"]).as_string(conn)
                    + f" ON {table_name} AS {policy['permissive']} FOR {command} TO {roles}"
                )
                if policy["qual"]:
                    out.write(f" USING ({policy['qual']})")
                if policy["with_check"]:
                    out.write(f" WITH CHECK ({policy['with_check']})")
                out.write(";\n")
            out.write("\n")

        cur.execute(
            """
            select n.nspname as schema_name, c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid, true) as definition
            from pg_trigger t
            join pg_class c on c.oid = t.tgrelid
            join pg_namespace n on n.oid = c.relnamespace
            where not t.tgisinternal
              and n.nspname = any(%s)
            order by n.nspname, c.relname, t.tgname
            """,
            (list(SCHEMAS),),
        )
        triggers = cur.fetchall()
        if triggers:
            out.write("-- Triggers\n")
            for trigger in triggers:
                out.write(f"{trigger['definition']};\n")
            out.write("\n")

        cur.execute(
            """
            select
              table_schema,
              table_name,
              grantee,
              string_agg(privilege_type, ', ' order by privilege_type) as privileges
            from information_schema.role_table_grants
            where table_schema = any(%s)
            group by table_schema, table_name, grantee
            order by table_schema, table_name, grantee
            """,
            (list(SCHEMAS),),
        )
        grants = cur.fetchall()
        if grants:
            out.write("-- Grants\n")
            for grant in grants:
                table_name = f"{sql.Identifier(grant['table_schema']).as_string(conn)}.{sql.Identifier(grant['table_name']).as_string(conn)}"
                out.write(f"GRANT {grant['privileges']} ON TABLE {table_name} TO {sql.Identifier(grant['grantee']).as_string(conn)};\n")
            out.write("\n")


def write_insert_table(conn: psycopg.Connection, out, schema: str, table: str) -> int:
    columns = column_names(conn, schema, table)
    if not columns:
        return 0

    out.write(f"\n-- Data for {schema}.{table}\n")
    table_name = sql.Identifier(schema).as_string(conn) + "." + sql.Identifier(table).as_string(conn)
    column_list = ", ".join(sql.Identifier(col).as_string(conn) for col in columns)

    with conn.cursor() as cur:
        query = sql.SQL("select {} from {}.{}").format(
            sql.SQL(", ").join(sql.Identifier(col) for col in columns),
            sql.Identifier(schema),
            sql.Identifier(table),
        )
        cur.execute(query)
        rows = 0
        for row in cur:
            values = ", ".join(
                sql.Literal(json.dumps(value) if isinstance(value, (dict, list)) else value).as_string(conn)
                for value in row
            )
            out.write(f"INSERT INTO {table_name} ({column_list}) VALUES ({values});\n")
            rows += 1

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
    backup_path = BACKUP_DIR / f"supabase_sccs_full_{timestamp}.sql"

    last_error: Exception | None = None
    for dsn in dsns:
        try:
            with psycopg.connect(require_ssl(dsn), autocommit=True) as conn:
                tables = table_names(conn)
                with backup_path.open("w", encoding="utf-8", newline="") as out:
                    out.write("-- SCCS Supabase schema and data backup\n")
                    out.write(f"-- Created at {datetime.now(timezone.utc).isoformat()}\n")
                    out.write("-- Schema and INSERT data backup for schema: sccs\n\n")
                    out.write("SET client_encoding = 'UTF8';\n")
                    out.write("SET check_function_bodies = false;\n")
                    out.write("SET statement_timeout = 0;\n")
                    out.write("SET lock_timeout = 0;\n\n")

                    write_schema(conn, out, tables)

                    out.write("-- Data inserts\n")
                    out.write("SET session_replication_role = replica;\n")

                    counts: list[tuple[str, str, int]] = []
                    for schema, table in tables:
                        counts.append((schema, table, write_insert_table(conn, out, schema, table)))

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
