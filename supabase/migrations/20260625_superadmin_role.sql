alter type sccs.app_role add value if not exists 'sccs_superadmin_role';

grant select, insert, update, delete on sccs.admin_team_members to service_role;

update sccs.user_roles
set role = 'sccs_superadmin_role'::sccs.app_role,
  teacher_id = null
where user_id = (
  select id
  from auth.users
  where lower(email) = 'superadmin@ctsccs.org'
  limit 1
);

create or replace function private.enforce_staff_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_email text;
begin
  if new.role not in (
    'sccs_superadmin_role',
    'sccs_admin_team_role',
    'sccs_teacher_ta_role'
  ) then
    return new;
  end if;

  select lower(email) into auth_email
  from auth.users
  where id = new.user_id;

  if auth_email is null or auth_email not like '%@ctsccs.org' then
    raise exception 'Staff portal roles require a @ctsccs.org email address';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_staff_auth_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from sccs.user_roles
    where user_id = new.id
      and role in (
        'sccs_superadmin_role',
        'sccs_admin_team_role',
        'sccs_teacher_ta_role'
      )
  ) and lower(new.email) not like '%@ctsccs.org' then
    raise exception 'Staff portal accounts require a @ctsccs.org email address';
  end if;
  return new;
end;
$$;

drop policy if exists "Staff view teachers" on sccs.teachers;
create policy "Staff view teachers" on sccs.teachers
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_teacher_ta_role',
    'sccs_admin_team_role',
    'sccs_superadmin_role'
  ]::sccs.app_role[]))
);

drop policy if exists "Admins manage teachers" on sccs.teachers;
create policy "Admins manage teachers" on sccs.teachers
for all to authenticated
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

drop policy if exists "Users view own role" on sccs.user_roles;
create policy "Users view own role" on sccs.user_roles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'sccs_superadmin_role'
  ]::sccs.app_role[]))
);

drop policy if exists "Admins manage roles" on sccs.user_roles;
create policy "Admins manage roles" on sccs.user_roles
for all to authenticated
using (
  (select private.current_user_has_role(array['sccs_superadmin_role']::sccs.app_role[]))
)
with check (
  (select private.current_user_has_role(array['sccs_superadmin_role']::sccs.app_role[]))
);

drop policy if exists "Staff view teacher assignments" on sccs.teacher_classes;
create policy "Staff view teacher assignments" on sccs.teacher_classes
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_teacher_ta_role',
    'sccs_admin_team_role',
    'sccs_superadmin_role'
  ]::sccs.app_role[]))
);

drop policy if exists "Admins manage teacher assignments" on sccs.teacher_classes;
create policy "Admins manage teacher assignments" on sccs.teacher_classes
for all to authenticated
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

drop policy if exists "Admins manage classes" on sccs.classes;
create policy "Admins manage classes" on sccs.classes
for all to authenticated
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

drop policy if exists "Staff view families" on sccs.families;
create policy "Staff view families" on sccs.families
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'sccs_superadmin_role'
  ]::sccs.app_role[]))
  or (select private.current_teacher_has_family(id))
);

drop policy if exists "Staff view students" on sccs.students;
create policy "Staff view students" on sccs.students
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'sccs_superadmin_role'
  ]::sccs.app_role[]))
  or (select private.current_teacher_has_student(id))
);

drop policy if exists "Staff view class registrations" on sccs.class_registrations;
create policy "Staff view class registrations" on sccs.class_registrations
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'sccs_superadmin_role'
  ]::sccs.app_role[]))
  or (select private.current_teacher_has_student(student_id))
);

drop policy if exists "Admins manage family registrations" on sccs.family_registrations;
create policy "Admins manage family registrations" on sccs.family_registrations
for all to authenticated
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

drop policy if exists "Staff record attendance" on sccs.attendance;
create policy "Staff record attendance" on sccs.attendance
for all to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'sccs_superadmin_role'
  ]::sccs.app_role[]))
  or (select private.current_teacher_has_class(class_id))
)
with check (
  recorded_by = (select auth.uid())
  and (
    (select private.current_user_has_role(array[
      'sccs_admin_team_role',
      'sccs_superadmin_role'
    ]::sccs.app_role[]))
    or (select private.current_teacher_has_class(class_id))
  )
);

drop policy if exists "Staff record grades" on sccs.student_grades;
create policy "Staff record grades" on sccs.student_grades
for all to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'sccs_superadmin_role'
  ]::sccs.app_role[]))
  or (select private.current_teacher_has_class(class_id))
)
with check (
  recorded_by = (select auth.uid())
  and (
    (select private.current_user_has_role(array[
      'sccs_admin_team_role',
      'sccs_superadmin_role'
    ]::sccs.app_role[]))
    or (select private.current_teacher_has_class(class_id))
  )
);

drop policy if exists "Admins manage site settings" on sccs.site_settings;
create policy "Admins manage site settings" on sccs.site_settings
for all to authenticated
using (
  (select private.current_user_has_role(array['sccs_superadmin_role']::sccs.app_role[]))
)
with check (
  updated_by = (select auth.uid())
  and (select private.current_user_has_role(array['sccs_superadmin_role']::sccs.app_role[]))
);

drop policy if exists "Admins view administrator profiles" on sccs.admins;
create policy "Admins view administrator profiles" on sccs.admins
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.current_user_has_role(array['sccs_superadmin_role']::sccs.app_role[]))
);

drop policy if exists "Admins update own password flag" on sccs.admins;
create policy "Admins update own password flag" on sccs.admins
for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.current_user_has_role(array['sccs_superadmin_role']::sccs.app_role[]))
)
with check (
  user_id = (select auth.uid())
  and (select private.current_user_has_role(array['sccs_superadmin_role']::sccs.app_role[]))
);

drop policy if exists "Admins manage team profiles" on sccs.admin_team_members;
create policy "Admins manage team profiles" on sccs.admin_team_members
for all to authenticated
using (
  (select private.current_user_has_role(array['sccs_superadmin_role']::sccs.app_role[]))
)
with check (
  (select private.current_user_has_role(array['sccs_superadmin_role']::sccs.app_role[]))
);
