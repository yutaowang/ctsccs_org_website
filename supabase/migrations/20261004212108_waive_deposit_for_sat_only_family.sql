create or replace function private.family_patrol_deposit(target_family_id bigint)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  family sccs.families;
  matching_email text;
  registered_course_count integer;
  sat_course_count integer;
begin
  select * into family from sccs.families where id=target_family_id;
  if not found then raise exception 'Family not found'; end if;
  if auth.uid() is null or (family.user_id is distinct from auth.uid()
    and not private.current_user_has_role(array['sccs_admin_team_role','sccs_superadmin_role']::sccs.app_role[])) then
    raise exception 'Family access required' using errcode = '42501';
  end if;

  select count(*), count(*) filter (where upper(trim(course.type)) = 'SAT')
    into registered_course_count, sat_course_count
  from sccs.students student
  join sccs.class_registrations registration on registration.student_id = student.id
  cross join lateral (values
    (registration.session_1),
    (registration.session_2),
    (registration.session_3)
  ) selected_course(class_id)
  join sccs.classes course on course.id = selected_course.class_id
  where student.family_id = target_family_id
    and selected_course.class_id is not null;

  -- A household registering exactly one course owes no patrol deposit when
  -- that sole course is SAT. Any second course restores the household fee.
  if registered_course_count = 1 and sat_course_count = 1 then
    return 0;
  end if;

  -- A linked family's Auth email cannot be forged by editing its profile email.
  select lower(trim(email)) into matching_email from auth.users where id=family.user_id;
  if family.user_id is null then matching_email := lower(trim(family.email)); end if;
  if nullif(matching_email,'') is null then return 40; end if;
  if exists(select 1 from sccs.admin_team_members where lower(trim(email))=matching_email)
    or exists(select 1 from sccs.teachers where lower(trim(email_1))=matching_email or lower(trim(email_2))=matching_email)
    or exists(select 1 from sccs.pta_leaders where is_active and lower(trim(email))=matching_email)
    or (family.pfizer_employee and split_part(matching_email,'@',2) in ('pfizer.com','ctsccs.org')) then
    return 0;
  end if;
  return 40;
end;
$$;

revoke all on function private.family_patrol_deposit(bigint) from public,anon;
grant execute on function private.family_patrol_deposit(bigint) to authenticated;
