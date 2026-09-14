create table sccs.pta_leaders (
  id bigint generated always as identity primary key,
  name_zh text not null default '',
  name_en text not null default '',
  email text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  is_public boolean not null default true,
  check (length(trim(name_zh || name_en)) > 0),
  check (email is null or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
create unique index pta_leaders_email on sccs.pta_leaders(lower(trim(email))) where email is not null;
alter table sccs.pta_leaders enable row level security;
grant select (id, name_zh, name_en, display_order, is_active, is_public)
  on sccs.pta_leaders to anon, authenticated;
grant select, insert, update, delete on sccs.pta_leaders to service_role;
grant usage, select on sequence sccs.pta_leaders_id_seq to service_role;
create policy "Public PTA names" on sccs.pta_leaders
for select to anon, authenticated using (is_active and is_public);

insert into sccs.pta_leaders(name_zh,name_en,email,display_order) values
  ('罗雪梅','Ms. Xuemei Luo','xuemei.luo@pfizer.com',10),
  ('伍緎榛','Ms. Annie Sufen Chong',null,20),
  ('吴霞','Ms. Xia Wu','wuxiayu@gmail.com',30),
  ('曾百灵','Ms. Bailing Zeng','bevanzeng8@gmail.com',40),
  ('待定','TBD',null,50);

-- Full contact details and mutations are available only through this guarded
-- private function. Column grants keep even signed-in families from reading emails.
create function private.manage_pta_leaders(action text, member jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.current_user_has_role(array[
    'sccs_admin_team_role','sccs_superadmin_role']::sccs.app_role[]) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if action = 'save' then
    if nullif(member->>'id','') is null then
      insert into sccs.pta_leaders(name_zh,name_en,email,display_order,is_active,is_public)
      values(trim(coalesce(member->>'name_zh','')),trim(coalesce(member->>'name_en','')),
        nullif(lower(trim(member->>'email')),''),coalesce((member->>'display_order')::integer,0),
        coalesce((member->>'is_active')::boolean,true),coalesce((member->>'is_public')::boolean,true));
    else
      update sccs.pta_leaders set name_zh=trim(coalesce(member->>'name_zh','')),
        name_en=trim(coalesce(member->>'name_en','')), email=nullif(lower(trim(member->>'email')),''),
        display_order=coalesce((member->>'display_order')::integer,0),
        is_active=coalesce((member->>'is_active')::boolean,true),
        is_public=coalesce((member->>'is_public')::boolean,true)
      where id=(member->>'id')::bigint;
      if not found then raise exception 'PTA leader not found'; end if;
    end if;
  elsif action = 'delete' then
    delete from sccs.pta_leaders where id=(member->>'id')::bigint;
    if not found then raise exception 'PTA leader not found'; end if;
  elsif action <> 'list' or action is null then
    raise exception 'Invalid PTA operation';
  end if;
  return coalesce((select jsonb_agg(p order by display_order,id) from sccs.pta_leaders p),'[]'::jsonb);
end;
$$;
revoke all on function private.manage_pta_leaders(text,jsonb) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.manage_pta_leaders(text,jsonb) to authenticated;
create function sccs.manage_pta_leaders(action text default 'list', member jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.manage_pta_leaders(action,member);
$$;
revoke all on function sccs.manage_pta_leaders(text,jsonb) from public,anon;
grant execute on function sccs.manage_pta_leaders(text,jsonb) to authenticated;

create function private.family_patrol_deposit(target_family_id bigint)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  family sccs.families;
  matching_email text;
begin
  select * into family from sccs.families where id=target_family_id;
  if not found then raise exception 'Family not found'; end if;
  if auth.uid() is null or (family.user_id is distinct from auth.uid()
    and not private.current_user_has_role(array['sccs_admin_team_role','sccs_superadmin_role']::sccs.app_role[])) then
    raise exception 'Family access required' using errcode = '42501';
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

create or replace function sccs.waterford_billing_snapshot(target_family_id bigint default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'deposits', coalesce((select jsonb_agg(jsonb_build_object('family_id',f.id,
      'amount',private.family_patrol_deposit(f.id))) from sccs.families f
      where target_family_id is null or f.id=target_family_id),'[]'::jsonb),
    'registrations', coalesce((select jsonb_agg(r) from sccs.class_registrations r
      join sccs.students s on s.id = r.student_id
      where (target_family_id is null or s.family_id = target_family_id)), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(c) from sccs.classes c), '[]'::jsonb),
    'seats', coalesce((select jsonb_agg(w) from sccs.waterford_seats w
      where w.released_at is null
        and (target_family_id is null or w.family_id = target_family_id)), '[]'::jsonb),
    'usage', coalesce((select to_jsonb(u) from sccs.waterford_seat_usage u),
      '{"used":0,"waiting":0}'::jsonb)
  );
$$;
revoke all on function sccs.waterford_billing_snapshot(bigint) from public, anon;
grant execute on function sccs.waterford_billing_snapshot(bigint) to authenticated, service_role;
notify pgrst, 'reload schema';
