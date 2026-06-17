create or replace view sccs.public_course_schedule as
select
  class.id,
  class.name,
  class.short_name,
  class.teacher_short_name,
  coalesce(
    nullif(trim(concat_ws(' ', teacher.first_name, teacher.last_name)), ''),
    nullif(teacher.short_name, ''),
    class.teacher_short_name
  ) as teacher_name,
  class.classroom,
  class.donation,
  class.type,
  class.is_open,
  class.class_time_id,
  class_time.display_time
from sccs.classes class
left join sccs.class_times class_time
  on class_time.id = class.class_time_id
left join lateral (
  select teacher_row.*
  from sccs.teacher_classes assignment
  join sccs.teachers teacher_row
    on teacher_row.id = assignment.teacher_id
  where assignment.class_id = class.id
  order by assignment.is_primary desc, teacher_row.id
  limit 1
) teacher on true;

grant select on sccs.public_course_schedule to anon, authenticated;
