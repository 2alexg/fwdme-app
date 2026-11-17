-- Consent to the AI services. Saving a link sends the page (and any text
-- shared with it) to Anthropic to write its title, summary and tags, and page
-- text to Voyage AI for search by meaning. App Store guideline 5.1.2(i) asks
-- for explicit permission before personal data goes to a third-party AI, so
-- the app asks once (at sign-up, or on the next launch for older accounts)
-- and nothing of a person's is sent until they agree.
--
-- Items are shared between everyone who saved the link, so an item is
-- organized as soon as one person who saved it has agreed, and only their
-- shared text is sent along.

alter table public.profiles add column ai_consent_at timestamptz;

-- Did anyone who saved this item agree?
create function private.item_has_ai_consent(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.scraps s
    join public.profiles p on p.id = s.user_id
    where s.item_id = p_item and p.ai_consent_at is not null
  );
$$;

revoke all on function private.item_has_ai_consent(uuid) from public, anon, authenticated;

-- Sign-up: the app sends {"ai_consent": true} in the metadata once the box is ticked.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  wanted text := lower(nullif(trim(new.raw_user_meta_data ->> 'username'), ''));
  wanted_locale text := new.raw_user_meta_data ->> 'locale';
  consented boolean := coalesce((new.raw_user_meta_data ->> 'ai_consent')::boolean, false);
begin
  if wanted is null then
    wanted := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  insert into public.profiles (id, username, locale, ai_consent_at)
  values (
    new.id,
    wanted,
    case when wanted_locale in ('he', 'en') then wanted_locale else 'he' end,
    case when consented then now() end
  );
  return new;
end;
$$;

-- Existing accounts agree from the app. Their links saved before that are
-- waiting in the queue, so wake the worker.
create function public.give_ai_consent() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_at timestamptz;
begin
  update public.profiles
  set ai_consent_at = coalesce(ai_consent_at, now())
  where id = (select auth.uid())
  returning ai_consent_at into v_at;
  if v_at is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform private.kick_worker();
  return v_at;
end;
$$;

revoke execute on function public.give_ai_consent() from public, anon;
grant execute on function public.give_ai_consent() to authenticated;

-- The queue only hands out items someone agreed for.
create or replace function public.worker_claim_items(p_limit integer default 5, p_max_attempts integer default 4)
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
    select i.id from public.items i
    where ((i.status = 'pending' and i.next_attempt_at <= now())
        or (i.status in ('fetching', 'enriching') and i.locked_until < now()))
      and private.item_has_ai_consent(i.id)
    order by i.next_attempt_at
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

-- Don't wake the worker every minute for items nobody agreed for yet.
create or replace function private.kick_worker_if_due() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.items i
    where ((i.status = 'pending' and i.next_attempt_at <= now())
        or (i.status in ('fetching', 'enriching') and i.locked_until < now()))
      and private.item_has_ai_consent(i.id)
  ) or exists (
    select 1 from public.items
    where status = 'ready' and embedding is null
      and (embed_attempted_at is null or embed_attempted_at < now() - interval '15 minutes')
  ) then
    perform private.kick_worker();
  end if;
end;
$$;

-- Text shared along with the link, only from people who agreed.
create function public.worker_shared_texts(p_item uuid, p_limit integer default 2)
returns setof text
language sql stable security definer set search_path = '' as $$
  select s.shared_text
  from public.scraps s
  join public.profiles p on p.id = s.user_id
  where s.item_id = p_item and s.shared_text is not null and p.ai_consent_at is not null
  order by s.created_at
  limit greatest(0, least(p_limit, 10));
$$;

revoke execute on function public.worker_shared_texts(uuid, integer) from public, anon, authenticated;
grant execute on function public.worker_shared_texts(uuid, integer) to service_role;

-- Search by meaning sends the typed words to Voyage AI.
create function public.my_ai_consent() returns boolean
language sql stable security invoker set search_path = '' as $$
  select coalesce((select ai_consent_at is not null from public.profiles where id = (select auth.uid())), false);
$$;

revoke execute on function public.my_ai_consent() from public, anon;
grant execute on function public.my_ai_consent() to authenticated;
