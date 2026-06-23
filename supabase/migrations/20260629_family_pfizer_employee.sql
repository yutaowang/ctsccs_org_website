alter table sccs.families
add column if not exists pfizer_employee boolean not null default false;
