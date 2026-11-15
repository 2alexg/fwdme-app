-- A short link that leads to a page someone already saved becomes one item.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('3e111111-1111-1111-1111-111111111111', 'merge_a@test.local', '{"username":"merge_a"}'),
  ('3e222222-2222-2222-2222-222222222222', 'merge_b@test.local', '{"username":"merge_b"}');

create temp table t_ids (k text primary key, id uuid) on commit drop;
grant all on t_ids to authenticated, service_role;

set local role authenticated;
-- A saves the full page (with a comment, on a board) and later the short link (with a comment).
set local request.jwt.claims = '{"sub":"3e111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into t_ids select 'a_full', (save_scrap('https://kitchen.test/pasta', 'https://kitchen.test/pasta', 'web', 'first note') ->> 'scrap_id')::uuid;
insert into boards (name) values ('Dinners');
insert into board_scraps (board_id, scrap_id) select id, (select id from t_ids where k = 'a_full') from boards where name = 'Dinners';
insert into t_ids select 'a_short', (save_scrap('https://bit.test/x', 'https://bit.test/x', 'web', 'second note', null, 'caption from the app') ->> 'scrap_id')::uuid;
-- B only saved the short link.
set local request.jwt.claims = '{"sub":"3e222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into t_ids select 'b_short', (save_scrap('https://bit.test/x', 'https://bit.test/x') ->> 'scrap_id')::uuid;

reset role;
insert into t_ids select 'full_item', id from items where canonical_url = 'https://kitchen.test/pasta';
insert into t_ids select 'short_item', id from items where canonical_url = 'https://bit.test/x';
update items set category = 'recipes' where canonical_url = 'https://kitchen.test/pasta';

-- Clients can't call it.
set local role authenticated;
select throws_ok($$ select worker_resolve_item((select id from t_ids where k = 'short_item'), 'https://kitchen.test/pasta', 'web') $$,
                 '42501', null, 'only the worker can merge items');

set local role service_role;
select is(worker_resolve_item((select id from t_ids where k = 'short_item'), 'https://kitchen.test/pasta', 'web') ->> 'merged_into',
          (select id from t_ids where k = 'full_item')::text, 'merges into the item for the page');
reset role;

select is((select count(*)::int from items where id = (select id from t_ids where k = 'short_item')), 0, 'the short item is gone');
select is((select count(*)::int from scraps where user_id = '3e111111-1111-1111-1111-111111111111'), 1, 'someone who saved both keeps one scrap');
select is((select id from scraps where user_id = '3e111111-1111-1111-1111-111111111111'), (select id from t_ids where k = 'a_full'), '…the one they made first');
select is((select array_agg(body order by created_at) from scrap_comments where scrap_id = (select id from t_ids where k = 'a_full')),
          array['first note', 'second note'], 'with the comments from both');
select is((select shared_text from scraps where id = (select id from t_ids where k = 'a_full')), 'caption from the app', 'and the shared text');
select is((select count(*)::int from board_scraps where scrap_id = (select id from t_ids where k = 'a_full')), 1, 'and still on its board');
select is((select item_id from scraps where id = (select id from t_ids where k = 'b_short')), (select id from t_ids where k = 'full_item'),
          'someone who saved only the short link now has the page');
select is((select category from scraps where id = (select id from t_ids where k = 'b_short')), 'recipes', 'with the page''s category');

-- Saving the short link again goes straight to the page.
set local role authenticated;
set local request.jwt.claims = '{"sub":"3e222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(save_scrap('https://bit.test/x', 'https://bit.test/x') ->> 'already_saved', 'true', 'the short link is now an alias');
select is((select count(*)::int from items where canonical_url = 'https://bit.test/x'), 0, 'no new item for it');

-- No item for the page yet: the item is renamed.
insert into t_ids select 'c_short', (save_scrap('https://bit.test/y', 'https://bit.test/y') ->> 'scrap_id')::uuid;
reset role;
set local role service_role;
select is(worker_resolve_item((select item_id from scraps where id = (select id from t_ids where k = 'c_short')), 'https://youtube.com/watch?v=abc', 'youtube') ->> 'merged_into',
          null, 'renames when nobody saved the page yet');
reset role;
select is((select canonical_url || ' ' || source from items i join scraps s on s.item_id = i.id where s.id = (select id from t_ids where k = 'c_short')),
          'https://youtube.com/watch?v=abc youtube', 'with the page''s URL and source');
insert into t_ids select 'c_item', item_id from scraps where id = (select id from t_ids where k = 'c_short');
set local role authenticated;
set local request.jwt.claims = '{"sub":"3e111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((save_scrap('https://bit.test/y', 'https://bit.test/y') ->> 'item_id'),
          (select id from t_ids where k = 'c_item')::text, 'and its old URL leads to it');
reset role;
set local role service_role;
select is(worker_resolve_item((select item_id from scraps where id = (select id from t_ids where k = 'c_short')), 'https://youtube.com/watch?v=abc', 'youtube') ->> 'merged_into',
          null, 'resolving to the URL it already has does nothing');

select * from finish();
rollback;
