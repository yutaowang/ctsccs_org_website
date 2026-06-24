insert into sccs.site_settings (key, value, description)
values (
  'school_year_start_date',
  '{"date":"2026-09-06"}'::jsonb,
  'First day of the 2026-2027 SCCS school year.'
)
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();
