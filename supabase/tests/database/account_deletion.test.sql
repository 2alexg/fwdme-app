-- Deleting an account: everything the person owns goes with the auth user;
-- pages only they saved are removed by delete_orphan_items.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('de111111-1111-1111-1111-111111111111', 'del_a@test.local', '{"username":"del_a"}'),
  ('de222222-2222-2222-2222-222222222222', 'del_b@test.local', '{"username":"del_b"}');

create temp table t (k text primary key, v text) on commit drop;
grant all on t to authenticated, service_role, anon;

set local role authenticated;
set local request.jwt.claims = '{"sub":"de111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into t values ('a_only', save_scrap('https://del.test/only-a', 'https://del.test/only-a') ->> 'scrap_id');
insert into t values ('a_shared', save_scrap('https://del.test/shared', 'https://del.test/shared') ->> 'scrap_id');
insert into scrap_comments (scrap_id, body) values ((select v::uuid from t where k = 'a_only'), 'my note');
insert into boards (name) values ('Trips');
select create_share_token('iPhone');
set local request.jwt.claims = '{"sub":"de222222-2222-2222-2222-222222222222","role":"authenticated"}';
select save_scrap('https://del.test/shared', 'https://del.test/shared');
reset role;
insert into follows (follower_id, followee_id)
  values ('de222222-2222-2222-2222-222222222222', 'de111111-1111-1111-1111-111111111111');

update items set image_path = 'only-a.jpg' where canonical_url = 'https://del.test/only-a';
update items set image_path = 'shared.jpg' where canonical_url = 'https://del.test/shared';
insert into t select 'items', array_agg(item_id)::text from scraps where user_id = 'de111111-1111-1111-1111-111111111111';

set local role authenticated;
set local request.jwt.claims = '{"sub":"de111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$ select delete_orphan_items((select v::uuid[] from t where k = 'items')) $$,
                 '42501', null, 'signed-in users cannot call delete_orphan_items');
reset role;

-- What auth.admin.deleteUser does.
delete from auth.users where id = 'de111111-1111-1111-1111-111111111111';

select is((select count(*)::int from profiles where id = 'de111111-1111-1111-1111-111111111111'), 0, 'the profile is gone');
select is((select count(*)::int from scraps where user_id = 'de111111-1111-1111-1111-111111111111'), 0, 'their scraps are gone');
select is((select count(*)::int from scrap_comments where author_id = 'de111111-1111-1111-1111-111111111111'), 0, 'their comments are gone');
select is((select count(*)::int from boards where user_id = 'de111111-1111-1111-1111-111111111111'), 0, 'their boards are gone');
select is((select count(*)::int from share_tokens where user_id = 'de111111-1111-1111-1111-111111111111'), 0, 'their share tokens are gone');
select is((select count(*)::int from follows where followee_id = 'de111111-1111-1111-1111-111111111111'), 0, 'follows of them are gone');

set local role service_role;
insert into t values ('paths', delete_orphan_items((select v::uuid[] from t where k = 'items'))::text);
reset role;
select is((select v from t where k = 'paths'), '{only-a.jpg}', 'returns the thumbnails of pages nobody else has');
select is((select count(*)::int from items where canonical_url = 'https://del.test/only-a'), 0, 'a page only they saved is removed');
select is((select count(*)::int from scraps s join items i on i.id = s.item_id where i.canonical_url = 'https://del.test/shared'), 1,
          'a page someone else saved stays, with their scrap');

select * from finish();
rollback;
