-- Privacy rule: owner sees all; others see public, or followers-only if they
-- follow the owner. Visibility is fixed at save time (account type = default).
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-- Count only this test's fixtures so leftover dev/e2e data doesn't matter.
create temp table t_users (id uuid primary key) on commit drop;
insert into t_users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333'), ('44444444-4444-4444-4444-444444444444');
grant select on t_users to anon, authenticated;

-- Users: owner (private account), fan (follows owner), stranger, pub (public account)
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.local',    '{"username":"Owner","locale":"en"}'),
  ('22222222-2222-2222-2222-222222222222', 'fan@test.local',      '{"username":"fan"}'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@test.local', '{}'),
  ('44444444-4444-4444-4444-444444444444', 'pub@test.local',      '{"username":"pub"}');

-- Sign-up trigger
select is((select username from profiles where id = '11111111-1111-1111-1111-111111111111'),
          'owner', 'username from metadata is lowercased');
select is((select locale from profiles where id = '11111111-1111-1111-1111-111111111111'),
          'en', 'locale from metadata');
select is((select locale from profiles where id = '22222222-2222-2222-2222-222222222222'),
          'he', 'locale defaults to he');
select matches((select username from profiles where id = '33333333-3333-3333-3333-333333333333'),
          '^user_[0-9a-f]{10}$', 'missing username gets a generated handle');
select is((select account_type::text from profiles where id = '11111111-1111-1111-1111-111111111111'),
          'private', 'accounts are private by default');

update profiles set account_type = 'public',
  display_name = 'Pub Lic', bio = 'hidden bio', profile_field_consent = '{"display_name": true}'
  where id = '44444444-4444-4444-4444-444444444444';
insert into follows (follower_id, followee_id) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');

-- Owner saves four scraps through the RPC
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((save_scrap('https://a.test/x?utm_source=1', 'https://a.test/x', 'web', 'why I saved it', null) ->> 'already_saved'),
          'false', 'first save creates a scrap');
select is((save_scrap('https://a.test/x', 'https://a.test/x', 'web', 'second note', null) ->> 'already_saved'),
          'true', 'saving the same canonical URL again returns the existing scrap');
select is((select count(*)::int from scrap_comments where author_id in (select id from t_users)), 2, 'both comments were kept on the one scrap');
select save_scrap('https://b.test/', 'https://b.test/', 'web', null, 'public');
select save_scrap('https://c.test/', 'https://c.test/', 'web', null, 'followers');
select save_scrap('https://d.test/', 'https://d.test/', 'web', null, 'private');
select is((select count(*)::int from scraps where user_id in (select id from t_users)), 4, 'owner sees all four scraps');
select is((select count(*)::int from items where canonical_url like '%.test/%'), 4, 'owner sees all four items');
select throws_ok($$ select save_scrap('ftp://nope', 'ftp://nope') $$, '22023', 'invalid url',
                 'non-http URLs are rejected');
select throws_ok($$ insert into items (canonical_url) values ('https://evil.test/') $$, '42501', null,
                 'clients cannot write items directly');
select throws_ok($$ update scraps set user_id = '22222222-2222-2222-2222-222222222222' $$, '42501', null,
                 'clients cannot reassign a scrap');

-- Public account: no choice means public
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select save_scrap('https://a.test/x', 'https://a.test/x', 'web', 'pub note', null);
select is((select count(*)::int from items where canonical_url = 'https://a.test/x'), 1,
          'two users share one item row');

-- Fan: public + followers-only from owner, plus pub's default-public scrap
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select set_eq($$ select i.canonical_url from scraps s join items i on i.id = s.item_id where s.user_id in (select id from t_users) $$,
              array['https://b.test/', 'https://c.test/', 'https://a.test/x'],
              'follower sees public and followers-only scraps, not private or default-private');
select is((select count(*)::int from scrap_comments where author_id in (select id from t_users)), 1,
          'follower sees only comments on scraps they can see (pub note)');
select is((select count(*)::int from profiles), 1, 'others cannot read full profile rows');
select is((select display_name from public_profiles where username = 'pub'), 'Pub Lic',
          'consented field is shown');
select is((select bio from public_profiles where username = 'pub'), null,
          'unconsented field is hidden');
select is((select count(*)::int from public_profiles where id in (select id from t_users)), 4, 'every handle is public');
select throws_ok($$ insert into scrap_comments (scrap_id, body)
                    select id, 'hijack' from scraps where user_id = '11111111-1111-1111-1111-111111111111' limit 1 $$, '42501', null,
                 'only the scrap owner can comment');
update scraps set visibility = 'private' where user_id in (select id from t_users);
select is((select count(*)::int from scraps where user_id in (select id from t_users) and visibility = 'private'), 0,
          'non-owners cannot change visibility (update silently matches nothing)');
delete from scraps where user_id in (select id from t_users);
select is((select count(*)::int from scraps where user_id in (select id from t_users)), 3, 'non-owners cannot delete');

-- Stranger: only public
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select set_eq($$ select i.canonical_url from scraps s join items i on i.id = s.item_id where s.user_id in (select id from t_users) $$,
              array['https://b.test/', 'https://a.test/x'],
              'stranger sees only public scraps');
select is((select count(*)::int from items where canonical_url like '%.test/%'), 2, 'stranger sees only items behind visible scraps');
select is((select count(*)::int from follows where follower_id in (select id from t_users)), 0, 'stranger cannot see other people''s follows');

-- Anonymous visitor
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from scraps where user_id in (select id from t_users)), 2, 'anon sees only public scraps');
select throws_ok($$ select save_scrap('https://e.test/', 'https://e.test/') $$, '42501', null,
                 'anon cannot save');

-- Account type is only the default for new scraps
reset role;
select is((select visibility::text from scraps s join items i on i.id = s.item_id
           where s.user_id = '11111111-1111-1111-1111-111111111111' and i.canonical_url = 'https://a.test/x'),
          'private', 'a scrap saved with no choice stores the account default (private)');
select is((select visibility::text from scraps
           where user_id = '44444444-4444-4444-4444-444444444444'),
          'public', 'a public account''s scrap stores public');
update profiles set account_type = 'public' where id = '11111111-1111-1111-1111-111111111111';
set local role anon;
select is((select count(*)::int from scraps where user_id in (select id from t_users)), 2,
          'changing the account type does not change existing scraps');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select save_scrap('https://f.test/', 'https://f.test/');
select is((select visibility::text from scraps where original_url = 'https://f.test/'),
          'public', 'new scraps after the change use the new default');
select throws_ok($$ update scraps set visibility = null where original_url = 'https://f.test/' $$,
                 '23502', null, 'visibility can no longer be null');

-- Opt-in bulk change: only the caller's scraps, only those that differ
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(set_all_scraps_visibility('private'), 1, 'bulk change returns how many scraps changed');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(set_all_scraps_visibility('public'), 3, 'bulk change skips scraps already in that mode');
select is((select count(*)::int from scraps where user_id = auth.uid() and visibility <> 'public'), 0,
          'all of the owner''s scraps are now public');
reset role;
select is((select visibility::text from scraps where user_id = '44444444-4444-4444-4444-444444444444'),
          'private', 'another user''s bulk change did not touch this user''s scraps');
set local role anon;
select throws_ok($$ select set_all_scraps_visibility('public') $$, '42501', null,
                 'anon cannot bulk change');

-- Owner edits and deletes
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update scrap_comments set body = 'edited' where body = 'second note';
select isnt((select edited_at from scrap_comments where body = 'edited'), null, 'editing sets edited_at');
delete from scraps where original_url = 'https://d.test/';
select is((select count(*)::int from scraps where user_id = auth.uid()), 4, 'owner can delete their scrap');

select * from finish();
rollback;
