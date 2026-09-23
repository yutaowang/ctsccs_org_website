alter table sccs.announcements enable row level security;

grant usage on schema sccs to authenticated, service_role;
grant select, insert on table sccs.announcements to authenticated, service_role;
grant usage, select on sequence sccs.announcements_id_seq to authenticated, service_role;
grant select on table sccs.push_devices to service_role;
revoke update, delete on table sccs.announcements from authenticated;

drop policy if exists "Users read matching announcements" on sccs.announcements;
drop policy if exists "Authenticated users read announcements" on sccs.announcements;
drop policy if exists "Managers publish announcements" on sccs.announcements;

create policy "Authenticated users read announcements"
on sccs.announcements
for select
to authenticated
using (true);

create policy "Managers publish announcements"
on sccs.announcements
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and private.current_user_has_role(
    array[
      'sccs_admin_team_role',
      'sccs_superadmin_role'
    ]::sccs.app_role[]
  )
);

notify pgrst, 'reload schema';
