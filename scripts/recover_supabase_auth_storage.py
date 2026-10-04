#!/usr/bin/env python3
"""Recover Supabase Auth data/password hashes and Storage object contents.

The default mode validates files and prints a plan. --confirm is required to
write to the recovery project. Storage restoration is idempotent and uses
upserts, but Auth data should be restored into a new project without users.
"""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote, unquote, urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
BACKUP_ROOT = ROOT / "backups"
BACKUP_PATTERN = "supabase_auth_storage_*"


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


def latest_backup() -> Path | None:
    matches = [path for path in BACKUP_ROOT.glob(BACKUP_PATTERN) if path.is_dir()]
    return max(matches, key=lambda path: path.stat().st_mtime) if matches else None


def find_psql() -> str | None:
    executable = shutil.which("psql")
    if executable:
        return executable
    program_files = Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
    candidates = list((program_files / "PostgreSQL").glob("*/bin/psql.exe"))
    return str(max(candidates, key=lambda path: path.parents[1].name)) if candidates else None


def psql_command(psql_path: str, dsn: str, auth_path: Path) -> tuple[list[str], dict[str, str]]:
    parts = urlsplit(dsn)
    database = unquote(parts.path.lstrip("/"))
    if not parts.hostname or not parts.username or not database:
        raise ValueError("Recovery database URL must include host, username, and database.")
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    command = [
        psql_path,
        "--host", parts.hostname,
        "--port", str(parts.port or 5432),
        "--username", unquote(parts.username),
        "--dbname", database,
        "--no-password",
        "--single-transaction",
        "--set", "ON_ERROR_STOP=on",
        "--command", "set session_replication_role = replica;",
        "--file", str(auth_path),
    ]
    env = os.environ.copy()
    if parts.password:
        env["PGPASSWORD"] = unquote(parts.password)
    env["PGSSLMODE"] = query.get("sslmode", "require")
    return command, env


def api_request(base_url: str, service_key: str, method: str, path: str, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(
        f"{base_url.rstrip('/')}{path}",
        data=data,
        method=method,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=120) as response:
            payload = response.read()
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Storage API {method} {path} failed ({exc.code}): {details}") from exc
    except URLError as exc:
        raise RuntimeError(f"Storage API {method} {path} failed: {exc.reason}") from exc
    return json.loads(payload) if payload else None


def ensure_bucket(base_url: str, service_key: str, bucket: dict, existing: set[str]) -> None:
    if bucket["id"] in existing:
        return
    api_request(
        base_url,
        service_key,
        "POST",
        "/storage/v1/bucket",
        {
            "id": bucket["id"],
            "name": bucket.get("name") or bucket["id"],
            "public": bool(bucket.get("public", False)),
            "file_size_limit": bucket.get("file_size_limit"),
            "allowed_mime_types": bucket.get("allowed_mime_types"),
        },
    )
    existing.add(bucket["id"])


def upload_blob(
    base_url: str,
    service_key: str,
    bucket: str,
    object_record: dict,
    blob_path: Path,
) -> None:
    parts = urlsplit(base_url)
    if parts.scheme != "https" or not parts.hostname:
        raise ValueError("SUPABASE_RECOVERY_URL must be an HTTPS URL.")
    object_path = quote(object_record["path"], safe="/")
    endpoint = (
        f"/storage/v1/object/{quote(bucket, safe='')}/{object_path}"
    )
    connection = http.client.HTTPSConnection(parts.hostname, parts.port or 443, timeout=300)
    try:
        connection.putrequest("POST", endpoint)
        connection.putheader("apikey", service_key)
        connection.putheader("Authorization", f"Bearer {service_key}")
        connection.putheader("x-upsert", "true")
        connection.putheader("Content-Type", object_record.get("content_type") or "application/octet-stream")
        connection.putheader("Content-Length", str(blob_path.stat().st_size))
        if object_record.get("cache_control"):
            connection.putheader("Cache-Control", str(object_record["cache_control"]))
        connection.endheaders()
        with blob_path.open("rb") as blob:
            while chunk := blob.read(1024 * 1024):
                connection.send(chunk)
        response = connection.getresponse()
        details = response.read().decode("utf-8", errors="replace")
        if response.status >= 300:
            raise RuntimeError(
                f"Upload failed for {bucket}/{object_record['path']} "
                f"({response.status}): {details}"
            )
    finally:
        connection.close()


def validate_storage(backup_dir: Path, manifest: dict) -> tuple[int, int]:
    if manifest.get("format_version") != 1:
        raise ValueError("Unsupported Storage manifest format.")
    count = total_bytes = 0
    for bucket in manifest.get("buckets", []):
        if not bucket.get("id"):
            raise ValueError("Storage manifest contains a bucket without an id.")
        for item in bucket.get("objects", []):
            blob_path = backup_dir / "storage_blobs" / item["sha256"]
            if not blob_path.is_file():
                raise ValueError(f"Missing Storage blob: {item['sha256']}")
            digest = hashlib.sha256()
            with blob_path.open("rb") as blob:
                while chunk := blob.read(1024 * 1024):
                    digest.update(chunk)
            if digest.hexdigest() != item["sha256"]:
                raise ValueError(f"Storage blob checksum failed: {item['sha256']}")
            count += 1
            total_bytes += blob_path.stat().st_size
    return count, total_bytes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Recover Supabase Auth password hashes and Storage files."
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        help="Backup directory; defaults to the newest backups/supabase_auth_storage_*.",
    )
    parser.add_argument("--skip-auth", action="store_true")
    parser.add_argument("--skip-storage", action="store_true")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Execute recovery. Without this flag, validate and print the plan only.",
    )
    return parser.parse_args()


def main() -> int:
    load_env_file(ROOT / ".env.local")
    args = parse_args()
    if args.skip_auth and args.skip_storage:
        print("Nothing to recover: both components were skipped.", file=sys.stderr)
        return 2
    selected = args.backup_dir or latest_backup()
    if selected is None:
        print(f"No backup matching backups/{BACKUP_PATTERN} was found.", file=sys.stderr)
        return 2
    backup_dir = selected.expanduser().resolve()

    try:
        auth_path = backup_dir / "auth_data.sql"
        if not args.skip_auth and not auth_path.is_file():
            raise ValueError(f"Missing Auth backup: {auth_path}")

        manifest = None
        object_count = byte_count = 0
        if not args.skip_storage:
            manifest_path = backup_dir / "storage_manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            object_count, byte_count = validate_storage(backup_dir, manifest)

        db_url = os.environ.get("SUPABASE_RECOVERY_DB_URL")
        recovery_url = os.environ.get("SUPABASE_RECOVERY_URL")
        recovery_key = os.environ.get("SUPABASE_RECOVERY_SERVICE_ROLE_KEY")
        if not args.skip_auth and not db_url:
            raise ValueError("Missing SUPABASE_RECOVERY_DB_URL.")
        if not args.skip_storage and (not recovery_url or not recovery_key):
            raise ValueError(
                "Missing SUPABASE_RECOVERY_URL or SUPABASE_RECOVERY_SERVICE_ROLE_KEY."
            )
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        print(f"Recovery validation failed: {exc}", file=sys.stderr)
        return 2

    print(f"Backup: {backup_dir}")
    print(f"Restore Auth: {'no' if args.skip_auth else 'yes'}")
    print(f"Restore Storage: {'no' if args.skip_storage else 'yes'}")
    if not args.skip_storage:
        print(f"Storage objects: {object_count}; bytes: {byte_count}")
    if not args.confirm:
        print("Plan only. No database or Storage changes were made. Add --confirm to execute.")
        return 0

    try:
        if not args.skip_auth:
            psql_path = find_psql()
            if not psql_path:
                raise RuntimeError("psql was not found. Install PostgreSQL client tools first.")
            command, env = psql_command(psql_path, db_url, auth_path)
            result = subprocess.run(command, env=env, check=False)
            if result.returncode:
                raise RuntimeError(f"Auth recovery failed; psql exited with {result.returncode}.")

        if not args.skip_storage:
            existing_buckets = {
                bucket["id"]
                for bucket in (api_request(recovery_url, recovery_key, "GET", "/storage/v1/bucket") or [])
            }
            for bucket in manifest["buckets"]:
                ensure_bucket(recovery_url, recovery_key, bucket, existing_buckets)
                for item in bucket.get("objects", []):
                    upload_blob(
                        recovery_url,
                        recovery_key,
                        bucket["id"],
                        item,
                        backup_dir / "storage_blobs" / item["sha256"],
                    )
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Recovery failed: {exc}", file=sys.stderr)
        return 1

    print("Auth and Storage recovery completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
