-- Milestone 4: boards. A board is a named collection of the owner's scraps
-- ("Vegan desserts", "Trip to Rome"); a scrap can be on any number of boards.
-- Boards are private to their owner for now. Public boards and following a
-- board come with the social milestone.

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  -- Owner's order on the boards screen; new boards go last.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index boards_user_name_key on public.boards (user_id, lower(trim(name)));
create index boards_user_position_idx on public.boards (user_id, position);

create trigger boards_touch before update on public.boards
  for each row execute function private.touch_updated_at();

create function private.board_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.name := trim(new.name);
  if tg_op = 'INSERT' then
    select coalesce(max(b.position) + 1, 0) into new.position
      from public.boards b where b.user_id = new.user_id;
  end if;
  return new;
end;
$$;
create trigger boards_defaults before insert or update of name on public.boards
  for each row execute function private.board_defaults();

create table public.board_scraps (
  board_id uuid not null references public.boards (id) on delete cascade,
  scrap_id uuid not null references public.scraps (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (board_id, scrap_id)
);
create index board_scraps_scrap_idx on public.board_scraps (scrap_id);
create index board_scraps_board_added_idx on public.board_scraps (board_id, added_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security: owner only.
-- ---------------------------------------------------------------------------

alter table public.boards enable row level security;
alter table public.board_scraps enable row level security;

create policy "boards: owner reads" on public.boards
  for select to authenticated using (user_id = (select auth.uid()));
create policy "boards: owner creates" on public.boards
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "boards: owner updates" on public.boards
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "boards: owner deletes" on public.boards
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "board_scraps: owner reads" on public.board_scraps
  for select to authenticated
  using (exists (select 1 from public.boards b
                 where b.id = board_scraps.board_id and b.user_id = (select auth.uid())));
-- Only your own scraps, on your own boards.
create policy "board_scraps: owner adds" on public.board_scraps
  for insert to authenticated
  with check (
    exists (select 1 from public.boards b
            where b.id = board_scraps.board_id and b.user_id = (select auth.uid()))
    and exists (select 1 from public.scraps s
                where s.id = board_scraps.scrap_id and s.user_id = (select auth.uid()))
  );
create policy "board_scraps: owner removes" on public.board_scraps
  for delete to authenticated
  using (exists (select 1 from public.boards b
                 where b.id = board_scraps.board_id and b.user_id = (select auth.uid())));

revoke all on public.boards, public.board_scraps from anon, authenticated;
grant select, delete on public.boards to authenticated;
grant insert (name) on public.boards to authenticated;
grant update (name) on public.boards to authenticated;
grant select, delete on public.board_scraps to authenticated;
-- Scrap queries embed board_scraps, and public scraps are read by anyone. No
-- policy covers anon, so they get the grant but never a row.
grant select on public.board_scraps to anon;
grant insert (board_id, scrap_id) on public.board_scraps to authenticated;

-- ---------------------------------------------------------------------------
-- my_boards: the boards screen in one call: each board with its scrap count
-- and the preview images of its four most recently added scraps.
-- ---------------------------------------------------------------------------

create function public.my_boards()
returns table (id uuid, name text, "position" integer, created_at timestamptz,
               scraps integer, covers jsonb)
language sql stable security invoker set search_path = '' as $$
  select b.id, b.name, b.position, b.created_at,
    (select count(*)::integer from public.board_scraps bs where bs.board_id = b.id),
    coalesce((
      select jsonb_agg(jsonb_build_object('image_path', c.image_path, 'og_image', c.og_image,
                                          'source', c.source) order by c.added_at desc)
      from (select i.image_path, i.og_image, i.source, bs.added_at
            from public.board_scraps bs
            join public.scraps s on s.id = bs.scrap_id
            join public.items i on i.id = s.item_id
            where bs.board_id = b.id
            order by bs.added_at desc
            limit 4) c
    ), '[]'::jsonb)
  from public.boards b
  where b.user_id = (select auth.uid())
  order by b.position, b.created_at;
$$;

-- Saves the owner's order in one statement: p_ids lists their boards top to
-- bottom. Runs as the caller, so it can only touch their own boards.
create function public.reorder_boards(p_ids uuid[])
returns void
language sql security invoker set search_path = '' as $$
  update public.boards b
  set position = o.n::integer
  from unnest(p_ids) with ordinality as o(id, n)
  where b.id = o.id and b.user_id = (select auth.uid());
$$;
grant update (position) on public.boards to authenticated;

revoke execute on function public.my_boards() from public, anon;
grant execute on function public.my_boards() to authenticated;
revoke execute on function public.reorder_boards(uuid[]) from public, anon;
grant execute on function public.reorder_boards(uuid[]) to authenticated;
