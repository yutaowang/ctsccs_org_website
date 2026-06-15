-- Run after legacy_data_20260615.sql.

select *
from (
  select 'class_times' as table_name, count(*)::bigint as imported_rows, 10::bigint as expected_rows
  from sccs.class_times where legacy_class_time_id is not null
  union all
  select 'teachers', count(*), 121 from sccs.teachers where legacy_teacher_id is not null
  union all
  select 'classes', count(*), 72 from sccs.classes where legacy_class_id is not null
  union all
  select 'families', count(*), 1444 from sccs.families where legacy_family_id is not null
  union all
  select 'students', count(*), 1184 from sccs.students where legacy_student_id is not null
  union all
  select 'class_registrations', count(*), 163
  from sccs.class_registrations where legacy_class_registration_id is not null
  union all
  select 'family_registrations', count(*), 123
  from sccs.family_registrations where legacy_family_registration_id is not null
  union all
  select 'legacy_family_registration_test', count(*), 164
  from sccs.legacy_family_registration_test
) counts
order by table_name;

select
  (select count(*) from sccs.students
    where family_id is null and legacy_family_id is not null) as students_with_missing_legacy_family,
  (select count(*) from sccs.families where user_id is not null) as families_linked_to_auth,
  (select count(*) from sccs.families where user_id is null) as families_not_linked_to_auth;

select
  count(*) filter (where student_id is null and legacy_student_id is not null) as registrations_with_missing_student,
  count(*) filter (where session_1 is null and legacy_session_1 not in (0)) as missing_session_1_class,
  count(*) filter (where session_2 is null and legacy_session_2 not in (0)) as missing_session_2_class,
  count(*) filter (where session_3 is null and legacy_session_3 not in (0)) as missing_session_3_class
from sccs.class_registrations;

select lower(trim(email)) as duplicate_email, count(*) as family_count
from sccs.families
where nullif(trim(email), '') is not null
group by lower(trim(email))
having count(*) > 1
order by family_count desc, duplicate_email;
