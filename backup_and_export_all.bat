@echo off
setlocal

rem Always run from the repository root, including when launched by double-click.
cd /d "%~dp0"

set "PAUSE_AT_END=1"
if /i "%~1"=="--no-pause" set "PAUSE_AT_END=0"

call python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python was not found on PATH.
    echo Install Python or add it to PATH, then run this file again.
    goto :failed
)

echo ============================================================
echo SCCS Supabase backups and email exports
echo ============================================================

call :run "Backup 1/3: SCCS schema and data" "scripts\backup_supabase.py"
if errorlevel 1 goto :failed

call :run "Backup 2/3: PostgreSQL pg_dump" "scripts\backup_supabase_pg_dump.py"
if errorlevel 1 goto :failed

call :run "Backup 3/3: Supabase Auth and Storage" "scripts\backup_supabase_auth_storage.py"
if errorlevel 1 goto :failed

call :run "Export 1/3: registered parent emails" "scripts\export_registered_parent_emails.py" --quiet
if errorlevel 1 goto :failed

rem This script creates both the PTA Leader and Admin Team Member CSV files.
call :run "Exports 2/3 and 3/3: PTA and admin emails" "scripts\export_pta_admin_emails.py" --quiet
if errorlevel 1 goto :failed

echo.
echo ============================================================
echo All backups and exports completed successfully.
echo Backups: backups\
echo Exports: scripts\output\
echo ============================================================
if "%PAUSE_AT_END%"=="1" pause
exit /b 0

:run
echo.
echo ------------------------------------------------------------
echo %~1
echo ------------------------------------------------------------
call python "%~2" %3
if errorlevel 1 (
    echo ERROR: %~1 failed.
    exit /b 1
)
exit /b 0

:failed
echo.
echo ============================================================
echo The batch stopped because a step failed.
echo Fix the error shown above, then run it again.
echo ============================================================
if "%PAUSE_AT_END%"=="1" pause
exit /b 1
