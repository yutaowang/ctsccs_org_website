-- Role-based portal, teacher assignments, attendance, grades, and site settings.

create schema if not exists private;

do $$
begin
  create type sccs.app_role as enum (
    'sccs_family_role',
    'sccs_teacher_ta_role',
    'sccs_admin_team_role',
    'admin'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists sccs.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role sccs.app_role not null default 'sccs_family_role',
  teacher_id bigint unique references sccs.teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (role = 'sccs_teacher_ta_role' and teacher_id is not null)
    or role <> 'sccs_teacher_ta_role'
  )
);

create table if not exists sccs.teacher_classes (
  teacher_id bigint not null references sccs.teachers(id) on delete cascade,
  class_id bigint not null references sccs.classes(id) on delete cascade,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (teacher_id, class_id)
);

create table if not exists sccs.attendance (
  id bigint generated always as identity primary key,
  class_id bigint not null references sccs.classes(id) on delete cascade,
  student_id bigint not null references sccs.students(id) on delete cascade,
  class_date date not null,
  status varchar(20) not null default 'present'
    check (status in ('present', 'absent', 'late', 'excused')),
  notes varchar(500),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, student_id, class_date)
);

create table if not exists sccs.student_grades (
  id bigint generated always as identity primary key,
  class_id bigint not null references sccs.classes(id) on delete cascade,
  student_id bigint not null references sccs.students(id) on delete cascade,
  grading_period varchar(50) not null,
  assignment_name varchar(100) not null,
  score numeric(7,2),
  maximum_score numeric(7,2),
  letter_grade varchar(10),
  comments varchar(1000),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, student_id, grading_period, assignment_name)
);

create table if not exists sccs.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists user_roles_role_idx on sccs.user_roles(role);
create index if not exists user_roles_teacher_id_idx on sccs.user_roles(teacher_id);
create index if not exists teacher_classes_class_id_idx on sccs.teacher_classes(class_id);
create index if not exists attendance_class_date_idx on sccs.attendance(class_id, class_date);
create index if not exists attendance_student_id_idx on sccs.attendance(student_id);
create index if not exists student_grades_class_id_idx on sccs.student_grades(class_id);
create index if not exists student_grades_student_id_idx on sccs.student_grades(student_id);

insert into sccs.teacher_classes (teacher_id, class_id)
select distinct teacher.id, class.id
from sccs.teachers teacher
join sccs.classes class
  on lower(trim(class.teacher_short_name)) = lower(trim(teacher.short_name))
where nullif(trim(class.teacher_short_name), '') is not null
on conflict do nothing;

insert into sccs.user_roles (user_id, role)
select id, 'sccs_family_role'::sccs.app_role
from auth.users
on conflict (user_id) do nothing;

create or replace function private.current_user_has_role(allowed_roles sccs.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from sccs.user_roles
    where user_id = (select auth.uid())
      and role = any(allowed_roles)
  );
$$;

create or replace function private.current_teacher_has_class(target_class_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from sccs.user_roles role
    join sccs.teacher_classes assignment
      on assignment.teacher_id = role.teacher_id
    where role.user_id = (select auth.uid())
      and role.role = 'sccs_teacher_ta_role'
      and assignment.class_id = target_class_id
  );
$$;

create or replace function private.current_teacher_has_student(target_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from sccs.class_registrations registration
    join sccs.teacher_classes assignment
      on assignment.class_id in (
        registration.session_1,
        registration.session_2,
        registration.session_3
      )
    join sccs.user_roles role
      on role.teacher_id = assignment.teacher_id
    where role.user_id = (select auth.uid())
      and role.role = 'sccs_teacher_ta_role'
      and registration.student_id = target_student_id
  );
$$;

create or replace function private.current_teacher_has_family(target_family_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from sccs.students student
    join sccs.class_registrations registration
      on registration.student_id = student.id
    join sccs.teacher_classes assignment
      on assignment.class_id in (
        registration.session_1,
        registration.session_2,
        registration.session_3
      )
    join sccs.user_roles role
      on role.teacher_id = assignment.teacher_id
    where role.user_id = (select auth.uid())
      and role.role = 'sccs_teacher_ta_role'
      and student.family_id = target_family_id
  );
$$;

create or replace function private.assign_default_portal_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into sccs.user_roles (user_id, role)
  values (new.id, 'sccs_family_role')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists assign_default_portal_role_after_auth_user on auth.users;
create trigger assign_default_portal_role_after_auth_user
after insert on auth.users
for each row execute function private.assign_default_portal_role();

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke execute on function private.current_user_has_role(sccs.app_role[])
  from public, anon;
revoke execute on function private.current_teacher_has_class(bigint)
  from public, anon;
revoke execute on function private.current_teacher_has_student(bigint)
  from public, anon;
revoke execute on function private.current_teacher_has_family(bigint)
  from public, anon;
revoke execute on function private.assign_default_portal_role()
  from public, anon, authenticated;
grant execute on function private.current_user_has_role(sccs.app_role[])
  to authenticated;
grant execute on function private.current_teacher_has_class(bigint)
  to authenticated;
grant execute on function private.current_teacher_has_student(bigint)
  to authenticated;
grant execute on function private.current_teacher_has_family(bigint)
  to authenticated;

alter table sccs.user_roles enable row level security;
alter table sccs.teacher_classes enable row level security;
alter table sccs.attendance enable row level security;
alter table sccs.student_grades enable row level security;
alter table sccs.site_settings enable row level security;

grant select on sccs.user_roles to authenticated;
grant select on sccs.teacher_classes to authenticated;
grant select, insert, update, delete on sccs.attendance, sccs.student_grades
  to authenticated;
grant select on sccs.site_settings to anon, authenticated;
grant insert, update, delete on sccs.user_roles, sccs.teacher_classes,
  sccs.site_settings to authenticated;
grant usage, select on sequence sccs.attendance_id_seq,
  sccs.student_grades_id_seq to authenticated;

revoke select on sccs.teachers from anon;

drop policy if exists "Public teachers" on sccs.teachers;
drop policy if exists "Staff view teachers" on sccs.teachers;
create policy "Staff view teachers" on sccs.teachers
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'admin'
  ]::sccs.app_role[]))
  or exists (
    select 1
    from sccs.user_roles role
    where role.user_id = (select auth.uid())
      and role.teacher_id = teachers.id
  )
);

drop policy if exists "Users view own role" on sccs.user_roles;
create policy "Users view own role" on sccs.user_roles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'admin'
  ]::sccs.app_role[]))
);

drop policy if exists "Admins manage roles" on sccs.user_roles;
create policy "Admins manage roles" on sccs.user_roles
for all to authenticated
using (
  (select private.current_user_has_role(array['admin']::sccs.app_role[]))
)
with check (
  (select private.current_user_has_role(array['admin']::sccs.app_role[]))
);

drop policy if exists "Staff view teacher assignments" on sccs.teacher_classes;
create policy "Staff view teacher assignments" on sccs.teacher_classes
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_teacher_ta_role',
    'sccs_admin_team_role',
    'admin'
  ]::sccs.app_role[]))
);

drop policy if exists "Admins manage teacher assignments" on sccs.teacher_classes;
create policy "Admins manage teacher assignments" on sccs.teacher_classes
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

drop policy if exists "Staff view families" on sccs.families;
create policy "Staff view families" on sccs.families
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'admin'
  ]::sccs.app_role[]))
  or (select private.current_teacher_has_family(id))
);

drop policy if exists "Staff view students" on sccs.students;
create policy "Staff view students" on sccs.students
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'admin'
  ]::sccs.app_role[]))
  or (select private.current_teacher_has_student(id))
);

drop policy if exists "Staff view class registrations" on sccs.class_registrations;
create policy "Staff view class registrations" on sccs.class_registrations
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'admin'
  ]::sccs.app_role[]))
  or (select private.current_teacher_has_student(student_id))
);

drop policy if exists "Admins manage family registrations" on sccs.family_registrations;
create policy "Admins manage family registrations" on sccs.family_registrations
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

drop policy if exists "Staff record attendance" on sccs.attendance;
create policy "Staff record attendance" on sccs.attendance
for all to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'admin'
  ]::sccs.app_role[]))
  or (select private.current_teacher_has_class(class_id))
)
with check (
  recorded_by = (select auth.uid())
  and (
    (select private.current_user_has_role(array[
      'sccs_admin_team_role',
      'admin'
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
    'admin'
  ]::sccs.app_role[]))
  or (select private.current_teacher_has_class(class_id))
)
with check (
  recorded_by = (select auth.uid())
  and (
    (select private.current_user_has_role(array[
      'sccs_admin_team_role',
      'admin'
    ]::sccs.app_role[]))
    or (select private.current_teacher_has_class(class_id))
  )
);

drop policy if exists "Public read site settings" on sccs.site_settings;
create policy "Public read site settings" on sccs.site_settings
for select to anon, authenticated using (true);

drop policy if exists "Admins manage site settings" on sccs.site_settings;
create policy "Admins manage site settings" on sccs.site_settings
for all to authenticated
using (
  (select private.current_user_has_role(array['admin']::sccs.app_role[]))
)
with check (
  updated_by = (select auth.uid())
  and (select private.current_user_has_role(array['admin']::sccs.app_role[]))
);

drop trigger if exists user_roles_set_updated_at on sccs.user_roles;
create trigger user_roles_set_updated_at before update on sccs.user_roles
for each row execute function sccs.set_updated_at();
drop trigger if exists attendance_set_updated_at on sccs.attendance;
create trigger attendance_set_updated_at before update on sccs.attendance
for each row execute function sccs.set_updated_at();
drop trigger if exists student_grades_set_updated_at on sccs.student_grades;
create trigger student_grades_set_updated_at before update on sccs.student_grades
for each row execute function sccs.set_updated_at();
drop trigger if exists site_settings_set_updated_at on sccs.site_settings;
create trigger site_settings_set_updated_at before update on sccs.site_settings
for each row execute function sccs.set_updated_at();
