-- Milestone 3: background enrichment. A saved link is fetched (page tags,
-- oEmbed), its preview image copied into Storage, and one LLM call adds a
-- title, category, tags and Hebrew + English summaries. Results live on the
-- shared item, so a link saved by many people is enriched once.
--
-- Queue: items.status is the queue. The `enrich` Edge Function claims due
-- items with worker_claim_items(); inserting an item pings the function right
-- away (pg_net), and pg_cron pings it every minute to pick up retries.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- New item fields
-- ---------------------------------------------------------------------------

alter table public.items
  -- ai_title is the English title; ai_title_he the Hebrew one.
  add column ai_title_he text,
  -- Labels for the language-neutral tag keys in `tags`:
  -- {"pasta": {"en": "pasta", "he": "פסטה"}}
  add column tag_labels jsonb not null default '{}'::jsonb
    check (jsonb_typeof(tag_labels) = 'object'),
  -- Our own copy of the preview image, in the public `thumbnails` bucket.
  -- Source image links (Instagram, TikTok) expire within hours.
  add column image_path text,
  add column site_name text,
  add column author_name text,
  -- Where the link ended up after redirects (short links, app links).
  add column resolved_url text,
  add column content_language text,
  -- Queue bookkeeping (worker only)
  add column attempts integer not null default 0,
  add column next_attempt_at timestamptz not null default now(),
  add column locked_until timestamptz;

create index items_queue_idx on public.items (next_attempt_at)
  where status in ('pending', 'fetching', 'enriching');

-- ---------------------------------------------------------------------------
-- Thumbnails bucket: public read (paths are random item ids), written only by
-- the worker with the service role.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thumbnails', 'thumbnails', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Claiming work. Marks up to p_limit due items as `fetching` and returns them.
-- SKIP LOCKED lets several worker runs overlap without taking the same item.
-- An item whose worker died (lock expired) is retried, up to max attempts.
-- ---------------------------------------------------------------------------

create function public.worker_claim_items(p_limit integer default 5, p_max_attempts integer default 4)
returns setof public.items
language plpgsql security definer set search_path = '' as $$
begin
  update public.items
  set status = 'failed', error = 'timed out', locked_until = null
  where status in ('fetching', 'enriching')
    and locked_until < now()
    and attempts >= p_max_attempts;

  return query
  with picked as (
    select id from public.items
    where (status = 'pending' and next_attempt_at <= now())
       or (status in ('fetching', 'enriching') and locked_until < now())
    order by next_attempt_at
    limit greatest(1, least(p_limit, 20))
    for update skip locked
  )
  update public.items i
  set status = 'fetching',
      attempts = i.attempts + 1,
      locked_until = now() + interval '3 minutes',
      error = null
  from picked
  where i.id = picked.id
  returning i.*;
end;
$$;

revoke execute on function public.worker_claim_items(integer, integer) from public, anon, authenticated;
grant execute on function public.worker_claim_items(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Waking the worker. The URL and shared secret live in Vault, so each
-- environment sets its own (see README). Without them nothing is sent and
-- items simply wait.
-- ---------------------------------------------------------------------------

create function private.kick_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  -- Queued by pg_net and sent after this transaction commits.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

create function private.kick_worker_on_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.kick_worker();
  return null;
end;
$$;

create trigger items_kick_worker after insert on public.items
  for each row execute function private.kick_worker_on_insert();

-- Called by pg_cron every minute: only pings when something is due.
create function private.kick_worker_if_due() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.items
    where (status = 'pending' and next_attempt_at <= now())
       or (status in ('fetching', 'enriching') and locked_until < now())
  ) then
    perform private.kick_worker();
  end if;
end;
$$;

revoke all on function private.kick_worker(), private.kick_worker_on_insert(),
  private.kick_worker_if_due() from public, anon, authenticated;

select cron.schedule('enrich-items', '* * * * *', 'select private.kick_worker_if_due()');

-- ---------------------------------------------------------------------------
-- Retry: an owner can ask for a failed item to be read again.
-- ---------------------------------------------------------------------------

create function public.retry_item(p_scrap_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_item uuid;
begin
  select s.item_id into v_item from public.scraps s
  where s.id = p_scrap_id and s.user_id = (select auth.uid());
  if v_item is null then
    return false;
  end if;
  update public.items
  set status = 'pending', attempts = 0, next_attempt_at = now(), error = null, locked_until = null
  where id = v_item and status = 'failed';
  if not found then
    return false;
  end if;
  perform private.kick_worker();
  return true;
end;
$$;

revoke execute on function public.retry_item(uuid) from public, anon;
grant execute on function public.retry_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Effective category per scrap: the owner's correction if any, else the AI's.
-- Kept on the scrap so the library can filter and count by it.
-- ---------------------------------------------------------------------------

alter table public.scraps
  add column category text,
  add constraint scraps_category_override_key check (user_category_override ~ '^[a-z_]{1,30}$');

create index scraps_user_category_idx on public.scraps (user_id, category, created_at desc);

create function private.fill_scrap_category() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.category := coalesce(new.user_category_override,
                           (select i.category from public.items i where i.id = new.item_id));
  return new;
end;
$$;

create trigger scraps_fill_category before insert or update of user_category_override on public.scraps
  for each row execute function private.fill_scrap_category();

create function private.sync_item_category() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.scraps set category = new.category
  where item_id = new.id and user_category_override is null;
  return null;
end;
$$;

create trigger items_sync_category after update of category on public.items
  for each row when (new.category is distinct from old.category)
  execute function private.sync_item_category();

revoke all on function private.fill_scrap_category(), private.sync_item_category() from public, anon, authenticated;

-- Category chips in the library: how many of my scraps are in each.
create function public.my_category_counts()
returns table (category text, scraps integer)
language sql stable security invoker set search_path = '' as $$
  select s.category, count(*)::integer
  from public.scraps s
  where s.user_id = (select auth.uid()) and s.category is not null
  group by s.category
  order by count(*) desc, s.category;
$$;

revoke execute on function public.my_category_counts() from public, anon;
grant execute on function public.my_category_counts() to authenticated;
