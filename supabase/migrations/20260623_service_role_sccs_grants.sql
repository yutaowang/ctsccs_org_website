grant usage on schema sccs to service_role;

grant select, insert, update, delete on sccs.user_roles to service_role;
grant select, insert, update, delete on sccs.teachers to service_role;
grant select on sccs.teacher_classes to service_role;

grant usage, select on all sequences in schema sccs to service_role;
