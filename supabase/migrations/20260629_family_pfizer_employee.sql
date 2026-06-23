alter table sccs.families
add column if not exists pfizer_employee boolean not null default false;

alter table sccs.families
add column if not exists waterford_resident boolean not null default false;

update sccs.families
set waterford_resident = true
where lower(trim(coalesce(city, ''))) = 'waterford';

create or replace function sccs.set_family_waterford_resident()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.waterford_resident := lower(trim(coalesce(new.city, ''))) = 'waterford';
  return new;
end;
$$;

drop trigger if exists families_set_waterford_resident on sccs.families;
create trigger families_set_waterford_resident
before insert or update of city on sccs.families
for each row execute function sccs.set_family_waterford_resident();
