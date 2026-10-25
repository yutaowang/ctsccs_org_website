-- The server-side attendance notification endpoint reads these tables through
-- PostgREST with the service role. RLS bypass does not replace table grants.
grant select on sccs.attendance, sccs.classes to service_role;
