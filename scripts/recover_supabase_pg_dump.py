#!/usr/bin/env python3
"""Restore an SCCS pg_dump SQL backup with PostgreSQL psql."""

from __future__ import annotations

from recover_supabase import RecoveryConfig, recover


def main() -> int:
    return recover(
        RecoveryConfig(
            label="an SCCS pg_dump SQL backup",
            pattern="supabase_sccs_pg_dump_*.sql",
            marker="-- PostgreSQL database dump",
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
