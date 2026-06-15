-- Expose the application schema through PostgREST without removing defaults.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, sccs';
notify pgrst, 'reload config';
