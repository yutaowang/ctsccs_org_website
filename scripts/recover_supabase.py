#!/usr/bin/env python3
"""Restore an SCCS pure-Python SQL backup with PostgreSQL psql.

The default mode only prints a recovery plan. Writing to the target database
requires --confirm. Use a dedicated SUPABASE_RECOVERY_DB_URL; this script never
falls back to the application's normal SUPABASE_DB_URL.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
BACKUP_DIR = ROOT / "backups"
DEFAULT_PATTERN = "supabase_sccs_full_*.sql"
EXPECTED_MARKER = "-- SCCS Supabase schema and data backup"


@dataclass(frozen=True)
class RecoveryConfig:
    label: str
    pattern: str
    marker: str


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


def find_psql() -> str | None:
    executable = shutil.which("psql")
    if executable:
        return executable
    program_files = Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
    candidates = list((program_files / "PostgreSQL").glob("*/bin/psql.exe"))
    if not candidates:
        return None

    def version_key(path: Path) -> tuple[int, ...]:
        try:
            return tuple(int(part) for part in path.parents[1].name.split("."))
        except ValueError:
            return ()

    return str(max(candidates, key=version_key))


def latest_backup(pattern: str) -> Path | None:
    matches = [path for path in BACKUP_DIR.glob(pattern) if path.is_file()]
    return max(matches, key=lambda path: path.stat().st_mtime) if matches else None


def validate_backup(path: Path, marker: str) -> None:
    if not path.is_file():
        raise ValueError(f"Backup file not found: {path}")
    with path.open("r", encoding="utf-8", errors="replace") as backup:
        header = backup.read(8192)
    if marker not in header:
        raise ValueError(
            f"The selected file does not look like the expected backup format: {path}"
        )


def connection_args(psql_path: str, dsn: str) -> tuple[list[str], dict[str, str], str]:
    parts = urlsplit(dsn)
    database = unquote(parts.path.lstrip("/"))
    if not parts.hostname or not parts.username or not database:
        raise ValueError("Recovery URL must include host, username, and database name")
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    args = [
        psql_path,
        "--host", parts.hostname,
        "--port", str(parts.port or 5432),
        "--username", unquote(parts.username),
        "--dbname", database,
        "--no-password",
        "--set", "ON_ERROR_STOP=on",
        "--single-transaction",
    ]
    env = os.environ.copy()
    if parts.password:
        env["PGPASSWORD"] = unquote(parts.password)
    env["PGSSLMODE"] = query.get("sslmode", "require")
    target = f"{unquote(parts.username)}@{parts.hostname}:{parts.port or 5432}/{database}"
    return args, env, target


def parser_for(config: RecoveryConfig) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=f"Restore {config.label}.")
    parser.add_argument(
        "--backup-file",
        type=Path,
        help=f"SQL backup path; defaults to the newest backups/{config.pattern}",
    )
    parser.add_argument(
        "--database-url",
        help="Target URL. Prefer SUPABASE_RECOVERY_DB_URL to keep credentials out of shell history.",
    )
    parser.add_argument(
        "--replace-schema",
        action="store_true",
        help="Drop the target sccs schema inside the recovery transaction before restoring.",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Execute the recovery. Without this flag, only print the plan.",
    )
    return parser


def recover(config: RecoveryConfig, argv: list[str] | None = None) -> int:
    load_env_file(ROOT / ".env.local")
    args = parser_for(config).parse_args(argv)
    selected = args.backup_file or latest_backup(config.pattern)
    if selected is None:
        print(f"No backup matching backups/{config.pattern} was found.", file=sys.stderr)
        return 2
    backup_path = selected.expanduser().resolve()

    try:
        validate_backup(backup_path, config.marker)
        dsn = args.database_url or os.environ.get("SUPABASE_RECOVERY_DB_URL")
        if not dsn:
            raise ValueError(
                "Set SUPABASE_RECOVERY_DB_URL or pass --database-url for the recovery target."
            )
        psql_path = find_psql()
        if not psql_path:
            raise ValueError("psql was not found. Install PostgreSQL client tools first.")
        command, env, target = connection_args(psql_path, dsn)
    except (OSError, UnicodeError, ValueError) as exc:
        print(f"Recovery configuration error: {exc}", file=sys.stderr)
        return 2

    print(f"Backup: {backup_path}")
    print(f"Target: {target}")
    print(f"Replace sccs schema: {'yes' if args.replace_schema else 'no'}")
    if not args.confirm:
        print("Plan only. No database changes were made. Add --confirm to execute.")
        return 0

    command.extend(["--command", "drop schema if exists sccs cascade;"] if args.replace_schema else [])
    command.extend(["--file", str(backup_path)])
    result = subprocess.run(command, env=env, check=False)
    if result.returncode:
        print(f"Recovery failed; psql exited with {result.returncode}.", file=sys.stderr)
        return result.returncode
    print("Recovery completed successfully.")
    return 0


def main() -> int:
    return recover(
        RecoveryConfig(
            label="an SCCS pure-Python SQL backup",
            pattern=DEFAULT_PATTERN,
            marker=EXPECTED_MARKER,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
