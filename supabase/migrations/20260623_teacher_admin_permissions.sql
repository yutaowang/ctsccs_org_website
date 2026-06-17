grant usage on schema sccs to authenticated;
grant select, insert, update, delete on sccs.teachers to authenticated;
grant usage, select on sequence sccs.teachers_id_seq to authenticated;

drop policy if exists "Admins manage teachers" on sccs.teachers;
create policy "Admins manage teachers" on sccs.teachers
for all to authenticated
using (
  (select private.current_user_has_role(array['admin', 'sccs_admin_team_role']::sccs.app_role[]))
)
with check (
  (select private.current_user_has_role(array['admin', 'sccs_admin_team_role']::sccs.app_role[]))
);
