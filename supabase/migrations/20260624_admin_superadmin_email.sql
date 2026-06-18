-- Root admin signs in with username "admin"; the backing Supabase Auth email
-- is only used for password recovery and Auth internals.

update sccs.admins
set email = 'superadmin@ctsccs.org'
where username = 'admin';

update auth.users
set
  email = 'superadmin@ctsccs.org',
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where id = (
  select user_id
  from sccs.admins
  where username = 'admin'
);
