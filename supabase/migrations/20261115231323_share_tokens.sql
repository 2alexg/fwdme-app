-- Milestone 4: saving from the iOS share sheet.
--
-- An iOS share extension runs apart from the app and can't use the app's
-- session (sharing refresh tokens between two processes risks Supabase's
-- reuse detection signing the user out). Instead, the signed-in app creates
-- a share token for its device and hands it to the extension through their
-- App Group. The extension sends the shared link with the token to the
-- `share` Edge Function, which saves it as that user.
--
-- Only a SHA-256 hash of each token is stored. Tokens are revoked on sign-out
-- (the app calls revoke_share_token) and can only save, comment on and set
-- the visibility of the token owner's own scraps.

create table public.share_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  label text check (char_length(label) <= 100),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index share_tokens_user_idx on public.share_tokens (user_id);

alter table public.share_tokens enable row level security;
-- Owners can see their devices (for a future "devices" list), never the hashes.
create policy "share_tokens: owner reads" on public.share_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy "share_tokens: owner deletes" on public.share_tokens
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.share_tokens from anon, authenticated;
grant select (id, label, created_at, last_used_at), delete on public.share_tokens to authenticated;

create function private.share_token_hash(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Returns a new token once; only its hash is kept.
create function public.create_share_token(p_label text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.share_tokens (user_id, token_hash, label)
  values (auth.uid(), private.share_token_hash(v_token), left(p_label, 100));
  return v_token;
end;
$$;

create function public.revoke_share_token(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.share_tokens
  where token_hash = private.share_token_hash(p_token) and user_id = (select auth.uid());
$$;

revoke execute on function public.create_share_token(text), public.revoke_share_token(text) from public, anon;
grant execute on function public.create_share_token(text), public.revoke_share_token(text) to authenticated;

-- The user a token belongs to (and note that it was used), or an error.
create function private.share_token_user(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  update public.share_tokens set last_used_at = now()
  where token_hash = private.share_token_hash(coalesce(p_token, ''))
  returning user_id into v_user;
  if v_user is null then
    raise exception 'invalid share token' using errcode = '28000';
  end if;
  return v_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- The three things the share sheet does, each as the token's user. Called by
-- the `share` Edge Function with the service role only. They run the regular
-- client paths with that user's identity (request.jwt.claims), so row-level
-- security and every check in save_scrap apply exactly as in the app.
-- ---------------------------------------------------------------------------

create function private.act_as(p_user uuid) returns void
language sql set search_path = '' as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create function public.share_save(
  p_token text,
  p_original_url text,
  p_canonical_url text,
  p_source text,
  p_shared_text text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.act_as(private.share_token_user(p_token));
  return public.save_scrap(p_original_url, p_canonical_url, p_source, null, null, p_shared_text);
end;
$$;

create function public.share_add_comment(p_token text, p_scrap_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.share_token_user(p_token);
begin
  if not exists (select 1 from public.scraps where id = p_scrap_id and user_id = v_user) then
    raise exception 'not your scrap' using errcode = '42501';
  end if;
  if nullif(trim(p_body), '') is null then
    return;
  end if;
  insert into public.scrap_comments (scrap_id, author_id, body) values (p_scrap_id, v_user, trim(p_body));
end;
$$;

create function public.share_set_visibility(p_token text, p_scrap_id uuid, p_visibility public.visibility) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.share_token_user(p_token);
begin
  update public.scraps set visibility = p_visibility where id = p_scrap_id and user_id = v_user;
  if not found then
    raise exception 'not your scrap' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.share_save(text, text, text, text, text),
  public.share_add_comment(text, uuid, text),
  public.share_set_visibility(text, uuid, public.visibility) from public, anon, authenticated;
grant execute on function public.share_save(text, text, text, text, text),
  public.share_add_comment(text, uuid, text),
  public.share_set_visibility(text, uuid, public.visibility) to service_role;
