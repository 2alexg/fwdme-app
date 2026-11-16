-- Milestone 5: deleting your account from the app (required by the App Store
-- and Google Play). The delete-account Edge Function deletes the auth user,
-- and foreign keys cascade to everything the person owns: profile, scraps,
-- comments, boards, follows, share tokens.
--
-- Items (one per page) are shared between users, so they stay while anyone
-- else still has them. Pages only this person saved are removed afterwards
-- with this function; the Edge Function then deletes their thumbnails.

create function public.delete_orphan_items(p_item_ids uuid[])
returns text[]
language sql security definer set search_path = '' as $$
  with gone as (
    delete from public.items i
    where i.id = any (p_item_ids)
      and not exists (select 1 from public.scraps s where s.item_id = i.id)
    returning i.image_path
  )
  select coalesce(array_agg(image_path) filter (where image_path is not null), '{}')
  from gone;
$$;

revoke all on function public.delete_orphan_items(uuid[]) from public, anon, authenticated;
grant execute on function public.delete_orphan_items(uuid[]) to service_role;
