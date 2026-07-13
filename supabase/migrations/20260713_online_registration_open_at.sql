insert into sccs.site_settings (key, value, description)
values (
  'online_registration_open_at',
  '{"datetime":"2026-07-20T09:00:00-04:00"}'::jsonb,
  'Date and Eastern Time when online registration opens.'
)
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();
