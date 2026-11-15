-- Milestone 4: one item per page, even when people save different links to it.
--
-- A short link (bit.ly, a Facebook share/p link, a.aliexpress.com…) gets its
-- own item when saved, because only the worker can follow redirects. When the
-- worker finds that it leads to a page with a different canonical URL, it
-- calls worker_resolve_item():
--   - if an item for that page exists, this item is merged into it: every
--     scrap moves over, and someone who saved both keeps one scrap with all
--     their comments, boards and shared text;
--   - otherwise this item is renamed to the page's URL.
-- Either way the old URL is kept as an alias, so saving it again goes
-- straight to the right item.

create table public.item_aliases (
  url text primary key check (char_length(url) <= 2048),
  item_id uuid not null references public.items (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index item_aliases_item_idx on public.item_aliases (item_id);
alter table public.item_aliases enable row level security;
revoke all on public.item_aliases from anon, authenticated;

create function public.worker_resolve_item(p_item uuid, p_canonical_url text, p_source text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
  v_target uuid;
  v_scrap record;
  v_existing uuid;
begin
  if p_canonical_url !~* '^https?://[^/\s]+' then
    raise exception 'invalid url' using errcode = '22023';
  end if;

  select canonical_url into v_old from public.items where id = p_item for update;
  if v_old is null or v_old = p_canonical_url then
    return jsonb_build_object('merged_into', null);
  end if;

  select id into v_target from public.items
  where canonical_url = p_canonical_url and id <> p_item
  for update;

  if v_target is null then
    -- First save of this page: the item becomes the page's item.
    update public.items
    set canonical_url = p_canonical_url,
        source = case when p_source in ('web', 'youtube', 'tiktok', 'instagram', 'facebook', 'x')
                      then p_source else source end
    where id = p_item;
    insert into public.item_aliases (url, item_id) values (v_old, p_item)
    on conflict (url) do update set item_id = excluded.item_id;
    return jsonb_build_object('merged_into', null);
  end if;

  for v_scrap in select * from public.scraps where item_id = p_item for update loop
    select id into v_existing from public.scraps
    where user_id = v_scrap.user_id and item_id = v_target;
    if v_existing is null then
      update public.scraps
      set item_id = v_target,
          category = coalesce(user_category_override,
                              (select i.category from public.items i where i.id = v_target))
      where id = v_scrap.id;
    else
      -- They saved both links: keep the scrap they made first, with everything from both.
      update public.scrap_comments set scrap_id = v_existing where scrap_id = v_scrap.id;
      insert into public.board_scraps (board_id, scrap_id, added_at)
        select board_id, v_existing, added_at from public.board_scraps where scrap_id = v_scrap.id
        on conflict (board_id, scrap_id) do nothing;
      update public.scraps
      set shared_text = coalesce(shared_text, v_scrap.shared_text),
          created_at = least(created_at, v_scrap.created_at)
      where id = v_existing;
      delete from public.scraps where id = v_scrap.id;
    end if;
  end loop;

  update public.item_aliases set item_id = v_target where item_id = p_item;
  insert into public.item_aliases (url, item_id) values (v_old, v_target)
  on conflict (url) do update set item_id = excluded.item_id;
  delete from public.items where id = p_item;
  return jsonb_build_object('merged_into', v_target);
end;
$$;

revoke execute on function public.worker_resolve_item(uuid, text, text) from public, anon, authenticated;
grant execute on function public.worker_resolve_item(uuid, text, text) to service_role;

-- save_scrap: a link we already know redirects somewhere goes straight there.
-- (Same as before apart from the alias lookup.)
create or replace function public.save_scrap(
  p_original_url text,
  p_canonical_url text,
  p_source text default 'web',
  p_comment text default null,
  p_visibility public.visibility default null,
  p_shared_text text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_item uuid;
  v_scrap uuid;
  v_existing boolean := false;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_canonical_url is null or p_canonical_url !~* '^https?://[^/\s]+' then
    raise exception 'invalid url' using errcode = '22023';
  end if;

  select item_id into v_item from public.item_aliases where url = p_canonical_url;

  if v_item is null then
    insert into public.items (canonical_url, source)
    values (p_canonical_url, coalesce(p_source, 'web'))
    on conflict (canonical_url) do nothing
    returning id into v_item;
  end if;
  if v_item is null then
    select id into v_item from public.items where canonical_url = p_canonical_url;
  end if;

  insert into public.scraps (user_id, item_id, original_url, shared_text, visibility)
  values (v_user, v_item, coalesce(p_original_url, p_canonical_url),
          nullif(trim(p_shared_text), ''), p_visibility)
  on conflict (user_id, item_id) do nothing
  returning id into v_scrap;
  if v_scrap is null then
    v_existing := true;
    select id into v_scrap from public.scraps where user_id = v_user and item_id = v_item;
  end if;

  if nullif(trim(p_comment), '') is not null then
    insert into public.scrap_comments (scrap_id, author_id, body)
    values (v_scrap, v_user, trim(p_comment));
  end if;

  return jsonb_build_object('scrap_id', v_scrap, 'item_id', v_item, 'already_saved', v_existing);
end;
$$;
