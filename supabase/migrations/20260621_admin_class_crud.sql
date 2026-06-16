grant insert, update, delete on sccs.classes to authenticated;
grant usage, select on sequence sccs.classes_id_seq to authenticated;

drop policy if exists "Admins manage classes" on sccs.classes;
create policy "Admins manage classes" on sccs.classes
for all to authenticated
using (
  (select private.current_user_has_role(array['admin']::sccs.app_role[]))
)
with check (
  (select private.current_user_has_role(array['admin']::sccs.app_role[]))
);
