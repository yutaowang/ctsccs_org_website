-- Support importing the June 15, 2026 SQL Server backup.
-- Run after 20260615_initial_schema.sql and before the generated data files.

alter table sccs.families alter column user_id drop not null;
alter table sccs.families add column if not exists email varchar(254);
alter table sccs.families add column if not exists legacy_create_ip text;
alter table sccs.families alter column created_at drop not null;
alter table sccs.families alter column updated_at drop not null;
alter table sccs.students alter column family_id drop not null;
alter table sccs.students alter column birth_year type varchar(50);
alter table sccs.students add column if not exists legacy_family_id integer;
alter table sccs.students add column if not exists legacy_create_ip text;
alter table sccs.students alter column created_at drop not null;
alter table sccs.students alter column updated_at drop not null;
alter table sccs.class_registrations alter column student_id drop not null;
alter table sccs.class_registrations add column if not exists legacy_student_id integer;
alter table sccs.class_registrations add column if not exists legacy_session_1 integer;
alter table sccs.class_registrations add column if not exists legacy_session_2 integer;
alter table sccs.class_registrations add column if not exists legacy_session_3 integer;
alter table sccs.class_registrations alter column registered_at drop not null;
alter table sccs.class_registrations alter column registration_ip type text
  using registration_ip::text;
alter table sccs.family_registrations alter column family_id drop not null;
alter table sccs.family_registrations add column if not exists legacy_family_id integer;
alter table sccs.family_registrations alter column create_ip type text
  using create_ip::text;

alter table sccs.teachers drop constraint if exists teachers_short_name_key;

create index if not exists families_email_lower_idx
  on sccs.families (lower(trim(email)));

create table if not exists sccs.legacy_family_registration_test (
  id bigint primary key,
  family_id bigint,
  handbook_agreement boolean not null default false,
  medical_release boolean not null default false,
  photo_agreement boolean not null default false,
  pfizer_match boolean not null default false,
  late_fee integer,
  registration_fee integer,
  created_at timestamptz,
  create_ip text,
  pay_1_cash integer,
  pay_1_check integer,
  pay_1_check_number varchar(50),
  pay_1_check_name varchar(50),
  pay_2_cash integer,
  pay_2_check integer,
  pay_2_check_number varchar(50),
  pay_2_check_name varchar(50),
  form_status varchar(50),
  pay_3_cash integer,
  pay_3_check integer,
  pay_3_refund integer,
  pay_3_check_number varchar(50),
  pay_3_check_name varchar(50),
  day_3_refund integer,
  day_2_refund integer,
  pay_4_refund integer,
  pay_4_refund_note varchar(50),
  pay_4_cash integer,
  pay_4_check_number varchar(50),
  pay_4_check_name varchar(50),
  pay_4_check integer,
  pay_5_cash integer,
  pay_5_check integer,
  pay_5_check_number varchar(50),
  pay_5_check_name varchar(50),
  pay_5_refund varchar(50),
  pfizer_employee_name varchar(50),
  pfizer_email varchar(254),
  patrol_deposit integer,
  volunteer_name varchar(50)
);

alter table sccs.legacy_family_registration_test enable row level security;
revoke all on sccs.legacy_family_registration_test from anon, authenticated;

create or replace function sccs.link_legacy_family_to_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;

  update sccs.families family
  set user_id = new.id,
      updated_at = now()
  where family.user_id is null
    and lower(trim(family.email)) = lower(trim(new.email))
    and (
      select count(*)
      from sccs.families candidate
      where lower(trim(candidate.email)) = lower(trim(new.email))
    ) = 1;

  return new;
end;
$$;

drop trigger if exists link_legacy_family_after_auth_user on auth.users;
create trigger link_legacy_family_after_auth_user
after insert or update of email on auth.users
for each row execute function sccs.link_legacy_family_to_user();

-- Link any Auth accounts that already existed before this migration.
update sccs.families family
set user_id = auth_user.id,
    updated_at = now()
from auth.users auth_user
where family.user_id is null
  and auth_user.email is not null
  and lower(trim(family.email)) = lower(trim(auth_user.email))
  and (
    select count(*)
    from sccs.families candidate
    where lower(trim(candidate.email)) = lower(trim(auth_user.email))
  ) = 1;
