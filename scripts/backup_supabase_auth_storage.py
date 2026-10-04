#!/usr/bin/env python3
"""Back up Supabase Auth data/password hashes and Storage object contents.

Auth is exported with the Supabase CLI. Storage files are downloaded through
the Storage API and stored as SHA-256-addressed blobs with a JSON manifest.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote, unquote, urlsplit
from urllib.request import Request, urlopen

from backup_supabase_pg_dump import find_pg_dump, require_ssl


ROOT = Path(__file__).resolve().parents[1]
BACKUP_ROOT = ROOT / "backups"
PAGE_SIZE = 1000


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


def safe_error(value: object) -> str:
    return re.sub(
        r"(postgres(?:ql)?://[^:\s]+:)[^@\s]+(@)",
        r"\1***\2",
        str(value),
        flags=re.IGNORECASE,
    )


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


def list_folder(base_url: str, service_key: str, bucket: str, prefix: str) -> list[dict]:
    items: list[dict] = []
    offset = 0
    while True:
        page = api_request(
            base_url,
            service_key,
            "POST",
            f"/storage/v1/object/list/{quote(bucket, safe='')}",
            {
                "prefix": prefix,
                "limit": PAGE_SIZE,
                "offset": offset,
                "sortBy": {"column": "name", "order": "asc"},
            },
        ) or []
        items.extend(page)
        if len(page) < PAGE_SIZE:
            return items
        offset += len(page)


def list_objects(base_url: str, service_key: str, bucket: str, prefix: str = "") -> list[dict]:
    objects: list[dict] = []
    for item in list_folder(base_url, service_key, bucket, prefix):
        name = item.get("name", "")
        full_path = f"{prefix}/{name}" if prefix else name
        if item.get("metadata") is None:
            objects.extend(list_objects(base_url, service_key, bucket, full_path))
        else:
            objects.append({"path": full_path, "metadata": item.get("metadata") or {}})
    return objects


def download_object(
    base_url: str,
    service_key: str,
    bucket: str,
    object_path: str,
    blob_dir: Path,
) -> tuple[str, int]:
    encoded_path = quote(object_path, safe="/")
    request = Request(
        f"{base_url.rstrip('/')}/storage/v1/object/authenticated/"
        f"{quote(bucket, safe='')}/{encoded_path}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    digest = hashlib.sha256()
    size = 0
    temp_path: Path | None = None
    try:
        with urlopen(request, timeout=300) as response:
            with tempfile.NamedTemporaryFile(delete=False, dir=blob_dir) as temp_file:
                temp_path = Path(temp_file.name)
                while chunk := response.read(1024 * 1024):
                    digest.update(chunk)
                    size += len(chunk)
                    temp_file.write(chunk)
    except (HTTPError, URLError) as exc:
        if temp_path:
            temp_path.unlink(missing_ok=True)
        raise RuntimeError(f"Could not download {bucket}/{object_path}: {exc}") from exc

    checksum = digest.hexdigest()
    final_path = blob_dir / checksum
    if final_path.exists():
        temp_path.unlink(missing_ok=True)
    else:
        temp_path.replace(final_path)
    return checksum, size


def back_up_auth(database_url: str, output_path: Path) -> None:
    pg_dump_path = find_pg_dump()
    if not pg_dump_path:
        raise RuntimeError(
            "pg_dump was not found. Install PostgreSQL client tools first."
        )

    parts = urlsplit(require_ssl(database_url))
    database = unquote(parts.path.lstrip("/"))
    if not parts.hostname or not parts.username or not database:
        raise RuntimeError(
            "Database URL must include host, username, and database name."
        )

    command = [
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
        "--no-owner",
        "--no-privileges",
        "--no-password",
        "--file",
        str(output_path),
        "--data-only",
        "--schema",
        "auth",
    ]
    env = os.environ.copy()
    if parts.password:
        env["PGPASSWORD"] = unquote(parts.password)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    env["PGSSLMODE"] = query.get("sslmode", "require")

    result = subprocess.run(
        command, env=env, capture_output=True, text=True, check=False
    )
    if result.returncode:
        output_path.unlink(missing_ok=True)
        raise RuntimeError(
            "Supabase Auth pg_dump failed: "
            + safe_error(result.stderr.strip() or result.stdout.strip())
        )


def back_up_storage(base_url: str, service_key: str, backup_dir: Path) -> tuple[int, int]:
    blob_dir = backup_dir / "storage_blobs"
    blob_dir.mkdir(parents=True, exist_ok=True)
    buckets = api_request(base_url, service_key, "GET", "/storage/v1/bucket") or []
    manifest = {
        "format_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_host": urlsplit(base_url).hostname,
        "buckets": [],
    }
    total_objects = 0
    total_bytes = 0
    for bucket in buckets:
        bucket_id = bucket["id"]
        bucket_record = {
            "id": bucket_id,
            "name": bucket.get("name") or bucket_id,
            "public": bool(bucket.get("public", False)),
            "file_size_limit": bucket.get("file_size_limit"),
            "allowed_mime_types": bucket.get("allowed_mime_types"),
            "objects": [],
        }
        for item in list_objects(base_url, service_key, bucket_id):
            checksum, size = download_object(
                base_url, service_key, bucket_id, item["path"], blob_dir
            )
            metadata = item["metadata"]
            bucket_record["objects"].append(
                {
                    "path": item["path"],
                    "sha256": checksum,
                    "size": size,
                    "content_type": metadata.get("mimetype") or "application/octet-stream",
                    "cache_control": metadata.get("cacheControl") or metadata.get("cache_control"),
                }
            )
            total_objects += 1
            total_bytes += size
        manifest["buckets"].append(bucket_record)

    (backup_dir / "storage_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return total_objects, total_bytes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Back up Supabase Auth password hashes and Storage files."
    )
    parser.add_argument("--skip-auth", action="store_true")
    parser.add_argument("--skip-storage", action="store_true")
    return parser.parse_args()


def main() -> int:
    load_env_file(ROOT / ".env.local")
    args = parse_args()
    if args.skip_auth and args.skip_storage:
        print("Nothing to back up: both components were skipped.", file=sys.stderr)
        return 2

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = BACKUP_ROOT / f"supabase_auth_storage_{timestamp}"
    backup_dir.mkdir(parents=True, exist_ok=False)
    try:
        if not args.skip_auth:
            database_urls = [
                value
                for value in (
                    os.environ.get("SUPABASE_DB_URL"),
                    os.environ.get("SUPABASE_DB_POOLER_URL"),
                )
                if value
            ]
            if not database_urls:
                raise RuntimeError("Missing SUPABASE_DB_URL or SUPABASE_DB_POOLER_URL.")

            last_auth_error: RuntimeError | None = None
            for database_url in database_urls:
                try:
                    back_up_auth(database_url, backup_dir / "auth_data.sql")
                    break
                except RuntimeError as exc:
                    last_auth_error = exc
            else:
                raise last_auth_error or RuntimeError("Could not back up Supabase Auth.")

        object_count = byte_count = 0
        if not args.skip_storage:
            base_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
            service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            if not base_url or not service_key:
                raise RuntimeError(
                    "Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
                )
            object_count, byte_count = back_up_storage(base_url, service_key, backup_dir)
    except (OSError, RuntimeError) as exc:
        print(f"Backup failed: {safe_error(exc)}", file=sys.stderr)
        return 1

    print(f"Backup created: {backup_dir}")
    if not args.skip_storage:
        print(f"Storage objects: {object_count}; bytes: {byte_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
