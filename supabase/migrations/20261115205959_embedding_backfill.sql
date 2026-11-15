-- Wake the worker for items that are ready but have no embedding yet: items
-- saved before search by meaning existed, and ones whose embedding failed
-- (e.g. Voyage rate limits). Before this, pg_cron only woke the worker for
-- items waiting to be organized, so those were never embedded.
--
-- embed_attempted_at limits it to one try per item every 15 minutes, so a
-- missing key or a Voyage outage doesn't wake the worker every minute.

alter table public.items add column embed_attempted_at timestamptz;

create or replace function private.kick_worker_if_due() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.items
    where (status = 'pending' and next_attempt_at <= now())
       or (status in ('fetching', 'enriching') and locked_until < now())
  ) or exists (
    select 1 from public.items
    where status = 'ready' and embedding is null
      and (embed_attempted_at is null or embed_attempted_at < now() - interval '15 minutes')
  ) then
    perform private.kick_worker();
  end if;
end;
$$;
