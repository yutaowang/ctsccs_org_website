drop policy if exists "Admins manage class registrations" on sccs.class_registrations;

create policy "Admins manage class registrations"
on sccs.class_registrations
for update
to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'sccs_superadmin_role'
  ]::sccs.app_role[]))
)
with check (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'sccs_superadmin_role'
  ]::sccs.app_role[]))
);
