# Waterford tuition seats

Apply `supabase/migrations/20260913230655_waterford_annual_seats.sql` before deploying the updated portal/API. This replaces the earlier, unapplied semester migration draft. The application requires the new billing RPC; it stops billing rather than guessing discounts if allocations cannot be read. The migration has been tested against isolated PostgreSQL 17; it does not automatically deploy the website or update a hosted database.

## Rules

- Waterford families share 20 free Chinese language course seats **per school year across the school**, for example 2026–2027. Each distinct student/course pair consumes one seat. A student taking two qualifying courses consumes two seats; duplicate session references to the same course consume one.
- Course `type` must be `CHN` or a numbered legacy variant such as `CHN2`. Names are not used: Chinese painting (`CC`), math and SAT remain payable.
- Eligibility uses `waterford_resident` or an exact case-insensitive `city = Waterford`. A street address containing the word Waterford does not establish residency.
- Successful saved registrations receive seats in database allocation order. Concurrent saves are serialized. Unsaved selections and failed transactions do not reserve seats; repeated saves do not consume extra seats.
- Cancellation, deletion or loss of eligibility releases the award. The oldest still-registered eligible waiting seat is promoted. Re-registering a cancelled course joins the end of the queue. Promotion changes tuition due; payments already recorded are not automatically refunded.
- Waterford status never waives the $40 **per-family** Safety Patrol Deposit. Qualifying Pfizer/SCCS employees, Admin Team members, teachers and active PTA Leaders receive independent waivers; see [member waivers](member-deposit-waivers.md).

## Annual database reset

The database holds one school year's data and is cleared each year. No semester/year columns, date-based filters or period-switching settings are added. January and the spring semester do not reset the quota. All registrations currently in the database belong to the same quota pool.

Include `sccs.waterford_seats` and `sccs.waterford_seat_usage` in the existing annual database cleanup, together with registrations. If the schema itself is recreated, reapply the migration. The normal application never performs an annual reset automatically. After cleanup, the quota starts at zero used, with all 20 seats available. Truncating registrations also releases awards and refreshes the totals.

The one-time migration backfills all existing registrations in `registered_at`/registration-id/course-id order without excluding any calendar dates. The old schema did not record when each course was added, so individual course history cannot be reconstructed more precisely. Subsequent allocation records preserve queue order and award/release history until the annual reset.

## Records and verification

`sccs.waterford_seats` records family, student, course, request time, seat number, award time and release time. A released record is retained until the annual cleanup. Slot numbers 1–20 and a unique active-slot index enforce the limit. Families can read their own records; administrators can read all; clients cannot write awards. `sccs.waterford_seat_usage` exposes aggregate used/waiting counts without family data.

The administrator Registration Summary shows this school year's used/remaining/waiting totals and each student's assigned or waiting courses. Refresh loads current counts. Family summaries and printed invoices show their discount and allocated-seat count. All billing reads registrations and awards through `waterford_billing_snapshot`, a security-invoker function honoring RLS in one database snapshot.

```sql
select * from sccs.waterford_seat_usage;
select count(*) as used
from sccs.waterford_seats
where released_at is null and seat_number is not null;
```

Local checks:

```sh
node --test tests/tuition.test.js
npm run build
# Requires psycopg and an isolated PostgreSQL server on localhost:55439.
# Creates and removes its own disposable database; never reads .env credentials.
python tests/waterford_database_test.py
```
