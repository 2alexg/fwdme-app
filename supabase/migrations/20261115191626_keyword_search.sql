-- Milestone 4: keyword search over your own library, in Hebrew and English.
--
-- Postgres full-text search has no Hebrew dictionary, and Hebrew glues
-- prefixes onto words (ו, ה, ב, ל, מ, ש, כ), so whole-token matching misses a
-- lot. Instead every query word is matched as a substring, after both sides
-- are normalized (lowercase, Hebrew niqqud and cantillation removed). A
-- Hebrew query word that starts with prefix letters also matches without
-- one (4+ letters) or two (5+ letters), so "הפסטה" and "והחומוס" find
-- "פסטה" and "חומוס".
--
-- A personal library is small (page text is capped at 6000 characters per
-- link), so this scans the caller's scraps without an index. The item's
-- normalized text is stored once (generated columns, kept up to date by
-- Postgres when the worker writes), so a search only compares strings.

create function private.search_norm(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(regexp_replace(coalesce(p, ''), '[֑-ׇ]', '', 'g'));
$$;

-- Escape LIKE wildcards in a user's word.
create function private.like_escape(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_');
$$;

grant execute on function private.search_norm(text), private.like_escape(text) to authenticated;

-- Tag keys plus their he/en labels. (array_to_string is only "stable", so
-- it gets an immutable wrapper to be usable in a generated column.)
create function private.tags_text(p_tags text[], p_labels jsonb) returns text
language sql immutable parallel safe set search_path = '' as $$
  select array_to_string(p_tags, ' ') || ' ' || coalesce(p_labels::text, '');
$$;

-- coalesce(...) || rather than concat_ws, which isn't immutable.
alter table public.items
  add column search_title text generated always as (private.search_norm(
    coalesce(ai_title, '') || ' ' || coalesce(ai_title_he, '') || ' ' || coalesce(og_title, ''))) stored,
  add column search_tags text generated always as (private.search_norm(
    private.tags_text(tags, tag_labels))) stored,
  add column search_summary text generated always as (private.search_norm(
    coalesce(summary_en, '') || ' ' || coalesce(summary_he, '') || ' ' || coalesce(og_description, '')
    || ' ' || coalesce(site_name, '') || ' ' || coalesce(author_name, '') || ' ' || canonical_url)) stored,
  add column search_text text generated always as (private.search_norm(raw_text)) stored;

-- Returns the caller's matching scraps, best first. Every word has to match
-- somewhere; where it matches sets the rank (title > tags and the owner's
-- comments > summary and site > the page text).
create function public.search_my_scraps(
  p_query text,
  p_category text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (scrap_id uuid, rank integer)
language sql stable security invoker set search_path = '' as $$
  with words as (
    select w
    from regexp_split_to_table(private.search_norm(left(p_query, 200)), '\s+') as w
    where w <> ''
    group by w
    limit 8
  ),
  patterns as (
    select w,
      array(select '%' || private.like_escape(x) || '%'
            from unnest(array[w,
                              case when char_length(w) >= 4 and w ~ '^[והבלמשכ]' then substr(w, 2) end,
                              case when char_length(w) >= 5 and w ~ '^[והבלמשכ]{2}' then substr(w, 3) end]) as x
            where x is not null) as likes
    from words
  ),
  docs as (
    select s.id, s.created_at,
      i.search_title as t_title,
      i.search_tags as t_tags,
      private.search_norm((select string_agg(c.body, ' ') from public.scrap_comments c
                           where c.scrap_id = s.id)) as t_comments,
      i.search_summary as t_summary,
      i.search_text || ' ' || private.search_norm(s.shared_text) as t_text
    from public.scraps s
    join public.items i on i.id = s.item_id
    where s.user_id = (select auth.uid())
      and (p_category is null or s.category = p_category)
  ),
  hits as (
    select d.id, d.created_at,
      (d.t_title like any (p.likes)) as in_title,
      (d.t_tags like any (p.likes)) as in_tags,
      (d.t_comments like any (p.likes)) as in_comments,
      (d.t_summary like any (p.likes)) as in_summary,
      (d.t_text like any (p.likes)) as in_text
    from docs d cross join patterns p
  )
  select id,
    sum(case when in_title then 8 else 0 end + case when in_tags then 4 else 0 end
        + case when in_comments then 4 else 0 end + case when in_summary then 2 else 0 end
        + case when in_text then 1 else 0 end)::integer as rank
  from hits
  group by id, created_at
  having bool_and(in_title or in_tags or in_comments or in_summary or in_text)
  order by rank desc, created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.search_my_scraps(text, text, integer, integer) from public, anon;
grant execute on function public.search_my_scraps(text, text, integer, integer) to authenticated;
