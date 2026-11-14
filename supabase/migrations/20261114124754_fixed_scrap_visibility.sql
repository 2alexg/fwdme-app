-- A scrap's visibility is fixed when it is saved. The account type is only
-- the default for NEW scraps; changing it never changes existing scraps.
-- Owners can opt in to moving all existing scraps with
-- set_all_scraps_visibility().

-- Resolve the account default at insert time, for every insert path.
create function private.fill_scrap_visibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.visibility is null then
    select case p.account_type when 'public' then 'public'::public.visibility
                               else 'private'::public.visibility end
      into new.visibility
      from public.profiles p where p.id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger scraps_fill_visibility before insert on public.scraps
  for each row execute function private.fill_scrap_visibility();

-- Existing scraps keep what they show today.
update public.scraps s
set visibility = case p.account_type when 'public' then 'public'::public.visibility
                                     else 'private'::public.visibility end
from public.profiles p
where p.id = s.user_id and s.visibility is null;

alter table public.scraps alter column visibility set not null;

-- The privacy rule no longer needs the account type.
create or replace function private.can_view_scrap(p_owner uuid, p_visibility public.visibility)
returns boolean
language sql stable security definer set search_path = '' as $$
  select
    p_owner = (select auth.uid())
    or p_visibility = 'public'
    or (p_visibility = 'followers' and exists (
          select 1 from public.follows f
          where f.follower_id = (select auth.uid()) and f.followee_id = p_owner));
$$;

-- Opt-in bulk change, offered after the account type changes. Runs as the
-- caller, so row-level security limits it to their own scraps.
create function public.set_all_scraps_visibility(p_visibility public.visibility)
returns integer
language sql security invoker set search_path = '' as $$
  with changed as (
    update public.scraps set visibility = p_visibility
    where user_id = (select auth.uid()) and visibility <> p_visibility
    returning 1
  )
  select count(*)::integer from changed;
$$;

revoke execute on function public.set_all_scraps_visibility(public.visibility) from public, anon;
grant execute on function public.set_all_scraps_visibility(public.visibility) to authenticated;
