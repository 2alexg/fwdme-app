-- Milestone 1: accounts, shared items, personal scraps, owner comments, follows.
-- Privacy is enforced here with row-level security, not in the app.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.account_type as enum ('public', 'private');
create type public.visibility as enum ('private', 'followers', 'public');
create type public.item_status as enum ('pending', 'fetching', 'enriching', 'ready', 'failed');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user. The handle is always public; every other
-- field is shown to others only with per-field consent (see public_profiles).
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text check (char_length(display_name) <= 80),
  avatar_url text check (char_length(avatar_url) <= 2048),
  bio text check (char_length(bio) <= 500),
  account_type public.account_type not null default 'private',
  -- e.g. {"display_name": true, "avatar_url": false, "bio": true}
  profile_field_consent jsonb not null default '{}'::jsonb
    check (jsonb_typeof(profile_field_consent) = 'object'),
  locale text not null default 'he' check (locale in ('he', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Create the profile when someone signs up. The app passes the chosen
-- username and locale in the sign-up metadata.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  wanted text := lower(nullif(trim(new.raw_user_meta_data ->> 'username'), ''));
  wanted_locale text := new.raw_user_meta_data ->> 'locale';
begin
  if wanted is null then
    wanted := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  insert into public.profiles (id, username, locale)
  values (
    new.id,
    wanted,
    case when wanted_locale in ('he', 'en') then wanted_locale else 'he' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Lets the sign-up form check a handle before submitting.
create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,30}$'
     and not exists (select 1 from public.profiles where username = lower(p_username));
$$;

-- What anyone may see about a user: handle always, the rest by consent.
create view public.public_profiles
with (security_barrier = true) as
select
  p.id,
  p.username,
  case when (p.profile_field_consent ->> 'display_name')::boolean then p.display_name end as display_name,
  case when (p.profile_field_consent ->> 'avatar_url')::boolean then p.avatar_url end as avatar_url,
  case when (p.profile_field_consent ->> 'bio')::boolean then p.bio end as bio,
  p.account_type
from public.profiles p;

-- ---------------------------------------------------------------------------
-- follows: people (or later, boards). Created now because the followers-only
-- privacy rule depends on it; clients cannot create follows until the social
-- milestone adds a policy (and decides on approval for private accounts).
-- ---------------------------------------------------------------------------

create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

-- ---------------------------------------------------------------------------
-- items: one row per unique piece of content (canonical URL). Shared across
-- users so a viral link is fetched and enriched once. Written only by
-- save_scrap() and, later, by workers using the service role.
-- ---------------------------------------------------------------------------

create table public.items (
  id uuid primary key default gen_random_uuid(),
  canonical_url text not null unique
    check (canonical_url ~* '^https?://' and char_length(canonical_url) <= 2048),
  source text not null default 'web'
    check (source in ('web', 'youtube', 'tiktok', 'instagram', 'facebook', 'x')),
  og_title text,
  og_description text,
  og_image text,
  raw_text text,
  ai_title text,
  category text,
  tags text[] not null default '{}',
  summary_he text,
  summary_en text,
  extracted_json jsonb,
  status public.item_status not null default 'pending',
  error text,
  enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_status_idx on public.items (status) where status <> 'ready';

create trigger items_touch before update on public.items
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- scraps: a user's save of an item, with their own privacy setting.
-- visibility null = follow the account default (public account -> public,
-- private account -> private).
-- ---------------------------------------------------------------------------

create table public.scraps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  original_url text not null check (char_length(original_url) <= 4096),
  shared_text text check (char_length(shared_text) <= 20000),
  visibility public.visibility,
  user_category_override text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_id)
);
create index scraps_user_created_idx on public.scraps (user_id, created_at desc);
create index scraps_item_idx on public.scraps (item_id);

create trigger scraps_touch before update on public.scraps
  for each row execute function private.touch_updated_at();

-- The single privacy rule: the owner sees everything; others see a scrap if
-- its effective visibility is public, or followers-only and they follow the
-- owner. Security definer so it can read the owner's account type and
-- follows regardless of the caller's own access to those rows.
create function private.can_view_scrap(p_owner uuid, p_visibility public.visibility)
returns boolean
language sql stable security definer set search_path = '' as $$
  select
    p_owner = (select auth.uid())
    or case coalesce(
         p_visibility,
         (select case p.account_type when 'public' then 'public'::public.visibility
                                     else 'private'::public.visibility end
            from public.profiles p where p.id = p_owner)
       )
         when 'public' then true
         when 'followers' then exists (
           select 1 from public.follows f
           where f.follower_id = (select auth.uid()) and f.followee_id = p_owner)
         else false
       end;
$$;
grant usage on schema private to anon, authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.can_view_scrap(uuid, public.visibility) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- scrap_comments: the owner's running notes on a scrap. Shown first in the
-- public view; they follow the scrap's visibility.
-- ---------------------------------------------------------------------------

create table public.scrap_comments (
  id uuid primary key default gen_random_uuid(),
  scrap_id uuid not null references public.scraps (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index scrap_comments_scrap_idx on public.scrap_comments (scrap_id, created_at);

create function private.mark_comment_edited() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;
create trigger scrap_comments_edited before update on public.scrap_comments
  for each row execute function private.mark_comment_edited();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.items enable row level security;
alter table public.scraps enable row level security;
alter table public.scrap_comments enable row level security;

-- profiles: only your own full row; others go through public_profiles.
create policy "profiles: owner reads" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner updates" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- follows: visible to the two people involved. No client writes yet.
create policy "follows: participants read" on public.follows
  for select to authenticated
  using ((select auth.uid()) in (follower_id, followee_id));

-- scraps
create policy "scraps: visible per privacy rule" on public.scraps
  for select to anon, authenticated
  using (private.can_view_scrap(user_id, visibility));
create policy "scraps: owner updates" on public.scraps
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "scraps: owner deletes" on public.scraps
  for delete to authenticated using (user_id = (select auth.uid()));

-- items: readable when you can see at least one scrap of it (the subquery
-- runs under the scraps policy above).
create policy "items: readable through a visible scrap" on public.items
  for select to anon, authenticated
  using (exists (select 1 from public.scraps s where s.item_id = items.id));

-- comments: readable when the scrap is; only the scrap's owner writes for now.
create policy "comments: readable with the scrap" on public.scrap_comments
  for select to anon, authenticated
  using (exists (select 1 from public.scraps s where s.id = scrap_comments.scrap_id));
create policy "comments: owner of the scrap adds" on public.scrap_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.scraps s
                where s.id = scrap_comments.scrap_id and s.user_id = (select auth.uid()))
  );
create policy "comments: author edits" on public.scrap_comments
  for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "comments: author deletes" on public.scrap_comments
  for delete to authenticated using (author_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants (defense in depth on top of RLS: clients may only touch the columns
-- they are meant to)
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.follows, public.items, public.scraps,
  public.scrap_comments from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (username, display_name, avatar_url, bio, account_type,
              profile_field_consent, locale) on public.profiles to authenticated;

grant select on public.public_profiles to anon, authenticated;

grant select on public.follows to authenticated;

grant select on public.items to anon, authenticated;

grant select on public.scraps to anon, authenticated;
grant update (visibility, user_category_override, shared_text) on public.scraps to authenticated;
grant delete on public.scraps to authenticated;

grant select on public.scrap_comments to anon, authenticated;
grant insert (scrap_id, body) on public.scrap_comments to authenticated;
grant update (body) on public.scrap_comments to authenticated;
grant delete on public.scrap_comments to authenticated;

revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_scrap: the one write path for capture (paste link now, share sheet in
-- milestone 2). Finds or creates the shared item, creates the user's scrap
-- (or returns the existing one), and adds the optional comment. The client
-- canonicalizes the URL; the worker re-resolves redirects later.
-- ---------------------------------------------------------------------------

create function public.save_scrap(
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

  insert into public.items (canonical_url, source)
  values (p_canonical_url, coalesce(p_source, 'web'))
  on conflict (canonical_url) do nothing
  returning id into v_item;
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

revoke execute on function public.save_scrap(text, text, text, text, public.visibility, text) from public, anon;
grant execute on function public.save_scrap(text, text, text, text, public.visibility, text) to authenticated;
