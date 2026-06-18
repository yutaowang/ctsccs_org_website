alter table sccs.user_roles
drop constraint if exists user_roles_teacher_id_fkey;

alter table sccs.user_roles
add constraint user_roles_teacher_id_fkey
foreign key (teacher_id)
references sccs.teachers(id)
on delete cascade;
