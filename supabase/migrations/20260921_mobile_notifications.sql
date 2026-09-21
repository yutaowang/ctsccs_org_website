create table if not exists sccs.announcements (
  id bigint generated always as identity primary key,
  title varchar(120) not null check (char_length(trim(title)) between 1 and 120),
  body varchar(2000) not null check (char_length(trim(body)) between 1 and 2000),
  audience varchar(20) not null default 'all' check (audience in ('all','families','teachers')),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict
);

create table if not exists sccs.push_devices (
  expo_push_token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform varchar(20) not null check (platform in ('ios','android','web')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_devices_user_id_idx on sccs.push_devices(user_id);
alter table sccs.announcements enable row level security;
alter table sccs.push_devices enable row level security;
grant select on sccs.announcements to authenticated;
grant insert, update, delete on sccs.announcements to authenticated;
grant select, insert, update, delete on sccs.push_devices to authenticated;
grant usage, select on sequence sccs.announcements_id_seq to authenticated;

create policy "Users read matching announcements" on sccs.announcements for select to authenticated using (
  (expires_at is null or expires_at > now()) and (
    audience = 'all'
    or (audience = 'families' and private.current_user_has_role(array['sccs_family_role']::sccs.app_role[]))
    or (audience = 'teachers' and private.current_user_has_role(array['sccs_teacher_ta_role','sccs_admin_team_role','sccs_superadmin_role']::sccs.app_role[]))
    or private.current_user_has_role(array['sccs_admin_team_role','sccs_superadmin_role']::sccs.app_role[])
  )
);
create policy "Managers publish announcements" on sccs.announcements for all to authenticated using (
  private.current_user_has_role(array['sccs_admin_team_role','sccs_superadmin_role']::sccs.app_role[])
) with check (
  created_by = auth.uid() and private.current_user_has_role(array['sccs_admin_team_role','sccs_superadmin_role']::sccs.app_role[])
);
create policy "Users manage own push devices" on sccs.push_devices for all to authenticated using (
  user_id = auth.uid()
) with check (user_id = auth.uid());
drop trigger if exists push_devices_set_updated_at on sccs.push_devices;
create trigger push_devices_set_updated_at before update on sccs.push_devices for each row execute function sccs.set_updated_at();
notify pgrst, 'reload schema';
