grant usage on schema sccs to authenticated;
grant select, insert, update, delete on sccs.teachers to authenticated;
grant usage, select on sequence sccs.teachers_id_seq to authenticated;

drop policy if exists "Public teachers" on sccs.teachers;
drop policy if exists "Staff view teachers" on sccs.teachers;
drop policy if exists "Admins manage teachers" on sccs.teachers;

create policy "Staff view teachers" on sccs.teachers
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_teacher_ta_role',
    'sccs_admin_team_role',
    'admin'
  ]::sccs.app_role[]))
);

create policy "Admins manage teachers" on sccs.teachers
for all to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'admin'
  ]::sccs.app_role[]))
)
with check (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'admin'
  ]::sccs.app_role[]))
);
