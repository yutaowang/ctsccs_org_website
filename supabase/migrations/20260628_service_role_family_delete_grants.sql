grant usage on schema sccs to service_role;

grant select, insert, update, delete on
  sccs.families,
  sccs.students,
  sccs.class_registrations,
  sccs.family_registrations,
  sccs.payments
to service_role;

grant usage, select on all sequences in schema sccs to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema sccs to supabase_auth_admin;
    grant select, delete on
      sccs.families,
      sccs.students,
      sccs.class_registrations,
      sccs.family_registrations,
      sccs.payments
    to supabase_auth_admin;
  end if;
end $$;
