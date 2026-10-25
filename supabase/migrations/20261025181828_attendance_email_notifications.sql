create table sccs.attendance_notification_runs (
  id bigint generated always as identity primary key,
  class_date date not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'sending'
    check (status in ('sending', 'completed', 'partial', 'failed')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table sccs.attendance_notification_recipients (
  id bigint generated always as identity primary key,
  notification_run_id bigint not null
    references sccs.attendance_notification_runs(id) on delete cascade,
  attendance_id bigint references sccs.attendance(id) on delete set null,
  class_id bigint references sccs.classes(id) on delete set null,
  student_id bigint references sccs.students(id) on delete set null,
  family_id bigint references sccs.families(id) on delete set null,
  student_name varchar(150) not null,
  parent_name varchar(150),
  email varchar(254),
  phone varchar(50),
  course_name varchar(150) not null,
  subject varchar(300) not null,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  error_message varchar(1000),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_run_id, attendance_id)
);

create index attendance_notification_runs_date_idx
  on sccs.attendance_notification_runs(class_date, created_at desc);
create index attendance_notification_recipients_run_idx
  on sccs.attendance_notification_recipients(notification_run_id, id);

alter table sccs.attendance_notification_runs enable row level security;
alter table sccs.attendance_notification_recipients enable row level security;

grant usage on schema sccs to authenticated, service_role;
grant select on sccs.attendance_notification_runs,
  sccs.attendance_notification_recipients to authenticated;
grant select, insert, update, delete on sccs.attendance_notification_runs,
  sccs.attendance_notification_recipients to service_role;
grant usage, select on sequence sccs.attendance_notification_runs_id_seq,
  sccs.attendance_notification_recipients_id_seq to service_role;

create policy "Admins view attendance notification runs"
on sccs.attendance_notification_runs
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'sccs_superadmin_role'
  ]::sccs.app_role[]))
);

create policy "Admins view attendance notification recipients"
on sccs.attendance_notification_recipients
for select to authenticated
using (
  (select private.current_user_has_role(array[
    'sccs_admin_team_role',
    'sccs_superadmin_role'
  ]::sccs.app_role[]))
);

notify pgrst, 'reload schema';
