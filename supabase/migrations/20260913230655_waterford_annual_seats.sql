-- One school year per database: all current registrations share 20 seats.
create table sccs.waterford_seats (
  id bigint generated always as identity primary key,
  student_id bigint not null,
  family_id bigint not null,
  class_id bigint not null,
  requested_at timestamptz not null default clock_timestamp(),
  seat_number smallint check (seat_number between 1 and 20),
  awarded_at timestamptz,
  released_at timestamptz,
  check ((seat_number is null) = (awarded_at is null))
);
-- Keep historical records even after deletion of students/families/classes.
create unique index waterford_seats_active_course
  on sccs.waterford_seats (student_id, class_id) where released_at is null;
create unique index waterford_seats_active_number
  on sccs.waterford_seats (seat_number)
  where released_at is null and seat_number is not null;
create index waterford_seats_family on sccs.waterford_seats (family_id);

create table sccs.waterford_seat_usage (
  singleton boolean primary key default true check (singleton),
  used integer not null default 0 check (used between 0 and 20),
  waiting integer not null default 0 check (waiting >= 0)
);
alter table sccs.waterford_seats enable row level security;
alter table sccs.waterford_seat_usage enable row level security;
revoke all on sccs.waterford_seats, sccs.waterford_seat_usage from anon, authenticated;
grant select on sccs.waterford_seats, sccs.waterford_seat_usage to authenticated, service_role;
create policy "Families read own seat records" on sccs.waterford_seats
for select to authenticated using (
  exists (select 1 from sccs.families f where f.id = family_id and f.user_id = (select auth.uid()))
  or (select private.current_user_has_role(array[
    'sccs_admin_team_role', 'sccs_superadmin_role'
  ]::sccs.app_role[]))
);
create policy "Read anonymous seat totals" on sccs.waterford_seat_usage
for select to authenticated using (true);

-- All relevant mutations serialize BEFORE writing base rows. The unique slot
-- index is an additional hard guarantee that the school year cannot exceed 20.
create function private.lock_waterford_seats()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(20260913, 20);
  return null;
end;
$$;
revoke all on function private.lock_waterford_seats() from public, anon, authenticated;

-- Cross-family allocation requires a private definer trigger: callers can only
-- change their own RLS-protected registrations, never write awards directly.
create function private.refresh_waterford_seats()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  candidate record;
  available smallint;
begin
  if auth.uid() is null and current_setting('role') not in ('none', 'service_role') then
    raise exception 'Authentication required';
  end if;
  perform pg_advisory_xact_lock(20260913, 20);
  -- Released awards remain available for audit until the annual database reset.
  update sccs.waterford_seats w set released_at = clock_timestamp()
  where w.released_at is null and not exists (
    select 1 from sccs.class_registrations r
    join sccs.students s on s.id = r.student_id
    join sccs.families f on f.id = s.family_id
    join sccs.classes c on c.id = w.class_id
    where r.student_id = w.student_id
      and f.id = w.family_id
      and w.class_id in (r.session_1, r.session_2, r.session_3)
      and (f.waterford_resident or lower(trim(f.city)) = 'waterford')
      and upper(trim(c.type)) ~ '^CHN[0-9]*$'
  );

  insert into sccs.waterford_seats (student_id, family_id, class_id)
  select r.student_id, s.family_id, c.id
  from sccs.class_registrations r
  join sccs.students s on s.id = r.student_id
  join sccs.families f on f.id = s.family_id
  join sccs.classes c on c.id in (r.session_1, r.session_2, r.session_3)
  where (f.waterford_resident or lower(trim(f.city)) = 'waterford')
    and upper(trim(c.type)) ~ '^CHN[0-9]*$'
    and not exists (select 1 from sccs.waterford_seats w
      where w.student_id = r.student_id
        and w.class_id = c.id and w.released_at is null)
  order by r.registered_at, r.id, c.id;

  for candidate in
    select id from sccs.waterford_seats
    where released_at is null and seat_number is null
    order by id
  loop
    select n::smallint into available from generate_series(1,20) n
    where not exists (select 1 from sccs.waterford_seats w
      where w.released_at is null and w.seat_number = n)
    order by n limit 1;
    exit when available is null;
    update sccs.waterford_seats set seat_number = available, awarded_at = clock_timestamp()
    where id = candidate.id;
  end loop;

  insert into sccs.waterford_seat_usage (singleton, used, waiting)
  select true, count(*) filter (where seat_number is not null),
    count(*) filter (where seat_number is null)
  from sccs.waterford_seats where released_at is null
  on conflict (singleton) do update set used = excluded.used, waiting = excluded.waiting;
  return null;
end;
$$;
revoke all on function private.refresh_waterford_seats() from public, anon, authenticated;

do $$
declare target text;
begin
  foreach target in array array['class_registrations', 'families', 'students', 'classes'] loop
    execute format('create trigger waterford_lock before insert or update or delete or truncate on sccs.%I for each statement execute function private.lock_waterford_seats()', target);
    execute format('create trigger waterford_refresh after insert or update or delete or truncate on sccs.%I for each statement execute function private.refresh_waterford_seats()', target);
  end loop;
end;
$$;

-- Backfill every current registration in original registration order.
-- A no-row update initializes allocations without modifying existing registrations.
update sccs.class_registrations set registered_at = registered_at where false;

-- A single statement snapshot keeps the invoice's registrations and awards
-- consistent if another family cancels while the invoice is loading.
create function sccs.waterford_billing_snapshot(target_family_id bigint default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'registrations', coalesce((select jsonb_agg(r) from sccs.class_registrations r
      join sccs.students s on s.id = r.student_id
      where (target_family_id is null or s.family_id = target_family_id)), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(c) from sccs.classes c), '[]'::jsonb),
    'seats', coalesce((select jsonb_agg(w) from sccs.waterford_seats w
      where w.released_at is null
        and (target_family_id is null or w.family_id = target_family_id)), '[]'::jsonb),
    'usage', coalesce((select to_jsonb(u) from sccs.waterford_seat_usage u),
      '{"used":0,"waiting":0}'::jsonb)
  );
$$;
revoke all on function sccs.waterford_billing_snapshot(bigint) from public, anon;
grant execute on function sccs.waterford_billing_snapshot(bigint) to authenticated, service_role;
notify pgrst, 'reload schema';
