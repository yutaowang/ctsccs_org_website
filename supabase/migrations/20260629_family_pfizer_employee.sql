alter table sccs.families
add column if not exists pfizer_employee boolean not null default false;

alter table sccs.families
add column if not exists waterford_resident boolean not null default false;

notify pgrst, 'reload schema';
