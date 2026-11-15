-- Local development only (runs on `supabase db reset`, never on the cloud).
-- Lets the database wake the local `enrich` Edge Function. The secret must
-- match WORKER_SECRET in supabase/functions/.env.
select vault.create_secret('http://kong:8000/functions/v1/enrich', 'worker_url')
where not exists (select 1 from vault.secrets where name = 'worker_url');
select vault.create_secret('local-dev-worker-secret', 'worker_secret')
where not exists (select 1 from vault.secrets where name = 'worker_secret');
