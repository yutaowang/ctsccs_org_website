#!/usr/bin/env python3
"""Create a pg_dump schema and INSERT data backup for the SCCS Supabase database."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit, urlunsplit


ROOT = Path(__file__).resolve().parents[1]
BACKUP_DIR = ROOT / "backups"
SCHEMAS = ("sccs",)


def find_pg_dump() -> str | None:
    pg_dump_path = shutil.which("pg_dump")
    if pg_dump_path:
        return pg_dump_path

    program_files = Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
    candidates = list((program_files / "PostgreSQL").glob("*/bin/pg_dump.exe"))
    if not candidates:
        return None

    def version_key(path: Path) -> tuple[int, ...]:
        try:
            return tuple(int(part) for part in path.parents[1].name.split("."))
        except ValueError:
            return ()

    return str(max(candidates, key=version_key))


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


def pg_dump_args(pg_dump_path: str, dsn: str, backup_path: Path) -> tuple[list[str], dict[str, str]]:
    parts = urlsplit(require_ssl(dsn))
    database = unquote(parts.path.lstrip("/"))
    query = dict(parse_qsl(parts.query, keep_blank_values=True))

    if not parts.hostname or not parts.username or not database:
        raise ValueError("Database URL must include host, username, and database name")

    args = [
        pg_dump_path,
        "--host",
        parts.hostname,
        "--port",
        str(parts.port or 5432),
        "--username",
        unquote(parts.username),
        "--dbname",
        database,
        "--format",
        "plain",
        "--column-inserts",
        "--no-password",
        "--file",
        str(backup_path),
    ]

    for schema in SCHEMAS:
        args.extend(["--schema", schema])

    env = os.environ.copy()
    if parts.password:
        env["PGPASSWORD"] = unquote(parts.password)
    env["PGSSLMODE"] = query.get("sslmode", "require")
    return args, env


def main() -> int:
    load_env_file(ROOT / ".env.local")

    pg_dump_path = find_pg_dump()
    if not pg_dump_path:
        print("pg_dump was not found on PATH. Install PostgreSQL client tools and try again.", file=sys.stderr)
        return 1

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
    backup_path = BACKUP_DIR / f"supabase_sccs_pg_dump_{timestamp}.sql"

    last_error = ""
    for dsn in dsns:
        try:
            args, env = pg_dump_args(pg_dump_path, dsn, backup_path)
            result = subprocess.run(args, env=env, capture_output=True, text=True, check=False)
        except ValueError as exc:
            last_error = str(exc)
            continue

        if result.returncode == 0:
            print(f"Backup created: {backup_path}")
            return 0

        last_error = result.stderr.strip() or result.stdout.strip() or f"pg_dump exited with {result.returncode}"
        if backup_path.exists():
            backup_path.unlink()

    print(f"Could not create pg_dump backup: {last_error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
