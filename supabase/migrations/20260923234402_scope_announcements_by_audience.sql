drop policy if exists "Authenticated users read announcements" on sccs.announcements;
drop policy if exists "Users read matching announcements" on sccs.announcements;

create policy "Users read matching announcements"
on sccs.announcements
for select
to authenticated
using (
  (expires_at is null or expires_at > now())
  and (
    audience = 'all'
    or (
      audience = 'families'
      and private.current_user_has_role(
        array['sccs_family_role']::sccs.app_role[]
      )
    )
    or (
      audience = 'teachers'
      and private.current_user_has_role(
        array['sccs_teacher_ta_role']::sccs.app_role[]
      )
    )
    or private.current_user_has_role(
      array[
        'sccs_admin_team_role',
        'sccs_superadmin_role'
      ]::sccs.app_role[]
    )
  )
);

notify pgrst, 'reload schema';
