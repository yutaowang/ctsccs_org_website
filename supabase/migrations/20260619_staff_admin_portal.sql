-- Dedicated staff portal identities and administrator profiles.
-- Passwords remain exclusively in Supabase Auth.

create table if not exists sccs.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username varchar(50) not null unique,
  email varchar(254) not null unique,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lower(email) like '%@ctsccs.org')
);

create table if not exists sccs.admin_team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name varchar(50),
  last_name varchar(50),
  email varchar(254) not null unique,
  phone varchar(50),
  title varchar(100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lower(email) like '%@ctsccs.org')
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
    'admin',
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
        'admin',
        'sccs_admin_team_role',
        'sccs_teacher_ta_role'
      )
  ) and lower(new.email) not like '%@ctsccs.org' then
    raise exception 'Staff portal accounts require a @ctsccs.org email address';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_staff_email_domain_on_role on sccs.user_roles;
create trigger enforce_staff_email_domain_on_role
before insert or update of user_id, role on sccs.user_roles
for each row execute function private.enforce_staff_email_domain();

drop trigger if exists enforce_staff_email_domain_on_auth_user on auth.users;
create trigger enforce_staff_email_domain_on_auth_user
before update of email on auth.users
for each row execute function private.enforce_staff_auth_email_domain();

revoke execute on function private.enforce_staff_email_domain()
  from public, anon, authenticated;
revoke execute on function private.enforce_staff_auth_email_domain()
  from public, anon, authenticated;

alter table sccs.admins enable row level security;
alter table sccs.admin_team_members enable row level security;

grant select, insert, update, delete on sccs.admins,
  sccs.admin_team_members to authenticated;

drop policy if exists "Admins view administrator profiles" on sccs.admins;
create policy "Admins view administrator profiles" on sccs.admins
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.current_user_has_role(array['admin']::sccs.app_role[]))
);

drop policy if exists "Admins update own password flag" on sccs.admins;
create policy "Admins update own password flag" on sccs.admins
for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.current_user_has_role(array['admin']::sccs.app_role[]))
)
with check (
  user_id = (select auth.uid())
  and (select private.current_user_has_role(array['admin']::sccs.app_role[]))
);

drop policy if exists "Admins manage team profiles" on sccs.admin_team_members;
create policy "Admins manage team profiles" on sccs.admin_team_members
for all to authenticated
using (
  (select private.current_user_has_role(array['admin']::sccs.app_role[]))
)
with check (
  (select private.current_user_has_role(array['admin']::sccs.app_role[]))
);

drop trigger if exists admins_set_updated_at on sccs.admins;
create trigger admins_set_updated_at before update on sccs.admins
for each row execute function sccs.set_updated_at();

drop trigger if exists admin_team_members_set_updated_at
  on sccs.admin_team_members;
create trigger admin_team_members_set_updated_at
before update on sccs.admin_team_members
for each row execute function sccs.set_updated_at();
