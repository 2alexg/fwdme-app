-- Milestone 5: feedback from the app (Settings → Send feedback). Read in the
-- Supabase dashboard (Table Editor → feedback). Deleted with the account.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  -- Where it came from, to reproduce problems: app version, ios/android/web,
  -- OS version, app language.
  app_version text check (char_length(app_version) <= 50),
  platform text check (char_length(platform) <= 20),
  os_version text check (char_length(os_version) <= 50),
  locale text check (char_length(locale) <= 10),
  created_at timestamptz not null default now()
);
create index feedback_user_created_idx on public.feedback (user_id, created_at desc);
create index feedback_created_idx on public.feedback (created_at desc);

-- No policies: people send feedback only through send_feedback() and can't
-- read it back.
alter table public.feedback enable row level security;

-- Saves feedback from the signed-in user, at most 20 a day.
create function public.send_feedback(
  p_body text,
  p_app_version text default null,
  p_platform text default null,
  p_os_version text default null,
  p_locale text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'empty_feedback' using errcode = '22023';
  end if;
  if (select count(*) from public.feedback
      where user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_much_feedback' using errcode = '54000';
  end if;
  insert into public.feedback (user_id, body, app_version, platform, os_version, locale)
  values (auth.uid(), left(trim(p_body), 5000), left(p_app_version, 50), left(p_platform, 20),
          left(p_os_version, 50), left(p_locale, 10))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.send_feedback(text, text, text, text, text) from public, anon;
grant execute on function public.send_feedback(text, text, text, text, text) to authenticated;
