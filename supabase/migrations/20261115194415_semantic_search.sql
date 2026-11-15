-- Milestone 4: search by meaning and "related in your library".
--
-- Each organized item gets an embedding (Voyage, 1024 dimensions) of its
-- titles, summaries, tags and the start of its page text. The enrich worker
-- fills in items that are ready and have none, including ones saved before
-- this migration. Embeddings belong to the shared item, like the AI summary,
-- so a link saved by many people is embedded once.
--
-- No vector index: matches are always limited to the caller's own scraps,
-- and an exact scan of one person's library is fast. (An HNSW index would
-- filter after the approximate search and could return too few rows.)

create extension if not exists vector with schema extensions;

alter table public.items
  add column embedding extensions.vector(1024),
  add column embedding_model text,
  add column embedded_at timestamptz;

create index items_needs_embedding_idx on public.items (updated_at)
  where status = 'ready' and embedding is null;

-- When what the embedding describes changes (a retry, a re-enrichment),
-- drop it so the worker makes a fresh one.
create function private.reset_item_embedding() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.ai_title, new.ai_title_he, new.summary_en, new.summary_he, new.tags, new.og_title, new.og_description)
     is distinct from
     (old.ai_title, old.ai_title_he, old.summary_en, old.summary_he, old.tags, old.og_title, old.og_description)
     -- (compared as text: the vector type's operators live in the extensions schema)
     and new.embedding::text is not distinct from old.embedding::text then
    new.embedding := null;
    new.embedding_model := null;
    new.embedded_at := null;
  end if;
  return new;
end;
$$;
create trigger items_reset_embedding before update on public.items
  for each row execute function private.reset_item_embedding();

-- ---------------------------------------------------------------------------
-- Matching. Both run as the caller, so only their own scraps come back.
-- Similarity is cosine similarity (1 = same meaning).
-- ---------------------------------------------------------------------------

-- The caller's scraps closest to a query embedding (made by the
-- semantic-search Edge Function from the words typed).
create function public.match_my_scraps(
  p_embedding extensions.vector(1024),
  p_limit integer default 20,
  p_min_similarity real default 0.3,
  p_category text default null
)
returns table (scrap_id uuid, similarity real)
language sql stable security invoker set search_path = '' as $$
  select s.id, (1 - (i.embedding operator(extensions.<=>) p_embedding))::real as similarity
  from public.scraps s
  join public.items i on i.id = s.item_id
  where s.user_id = (select auth.uid())
    and i.embedding is not null
    and (p_category is null or s.category = p_category)
    and 1 - (i.embedding operator(extensions.<=>) p_embedding) >= p_min_similarity
  order by i.embedding operator(extensions.<=>) p_embedding
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- "Related in your library": the caller's other scraps closest to this one.
-- No API call needed; the scrap's own embedding is the query.
--
-- Item-to-item similarities run high across the board (0.4-0.5 between
-- unrelated links), so a fixed cut-off doesn't work. A scrap counts as related
-- when it is clearly closer than typical for this scrap: at least two standard
-- deviations above its average similarity to the rest of the library, and at
-- least p_min_similarity. With fewer than 5 other scraps there is no "typical"
-- yet, so only very close ones (0.6+) count.
create function public.related_scraps(
  p_scrap_id uuid,
  p_limit integer default 6,
  p_min_similarity real default 0.5
)
returns table (scrap_id uuid, similarity real)
language sql stable security invoker set search_path = '' as $$
  with target as (
    select i.id as item_id, i.embedding
    from public.scraps s join public.items i on i.id = s.item_id
    where s.id = p_scrap_id and i.embedding is not null
  ),
  sims as (
    select s.id, (1 - (i.embedding operator(extensions.<=>) t.embedding))::real as similarity
    from target t
    join public.scraps s on s.user_id = (select auth.uid()) and s.item_id <> t.item_id
    join public.items i on i.id = s.item_id
    where i.embedding is not null
  ),
  stats as (
    select count(*) as n, avg(similarity) as mean, coalesce(stddev_pop(similarity), 0) as sd from sims
  )
  select sims.id, sims.similarity
  from sims, stats
  where sims.similarity >= p_min_similarity
    and case when stats.n >= 5 then sims.similarity >= stats.mean + 2 * stats.sd
             else sims.similarity >= greatest(p_min_similarity, 0.6) end
  order by sims.similarity desc
  limit least(greatest(coalesce(p_limit, 6), 1), 50);
$$;

revoke execute on function public.match_my_scraps(extensions.vector, integer, real, text) from public, anon;
grant execute on function public.match_my_scraps(extensions.vector, integer, real, text) to authenticated;
revoke execute on function public.related_scraps(uuid, integer, real) from public, anon;
grant execute on function public.related_scraps(uuid, integer, real) to authenticated;
