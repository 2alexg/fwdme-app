-- Boards: owner-only collections of the owner's own scraps.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('b1111111-1111-1111-1111-111111111111', 'board_owner@test.local', '{"username":"board_owner"}'),
  ('b2222222-2222-2222-2222-222222222222', 'board_other@test.local', '{"username":"board_other"}');

set local role authenticated;

-- Other user saves a public scrap.
set local request.jwt.claims = '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}';
create temp table t_ids (k text primary key, id uuid) on commit drop;
grant all on t_ids to authenticated;
insert into t_ids select 'other_scrap', (save_scrap('https://boards.test/other', 'https://boards.test/other', 'web', null, 'public') ->> 'scrap_id')::uuid;
insert into boards (name) values ('Other board');
insert into t_ids select 'other_board', id from boards where name = 'Other board';

-- Owner
set local request.jwt.claims = '{"sub":"b1111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into t_ids select 'scrap1', (save_scrap('https://boards.test/1', 'https://boards.test/1') ->> 'scrap_id')::uuid;
insert into t_ids select 'scrap2', (save_scrap('https://boards.test/2', 'https://boards.test/2') ->> 'scrap_id')::uuid;

insert into boards (name) values ('  Vegan desserts  ');
insert into boards (name) values ('Trip to Rome');
insert into t_ids select 'desserts', id from boards where name = 'Vegan desserts';
insert into t_ids select 'rome', id from boards where name = 'Trip to Rome';

select is((select name from boards where id = (select id from t_ids where k = 'desserts')), 'Vegan desserts', 'names are trimmed');
select is((select array_agg(name order by position) from boards), array['Vegan desserts', 'Trip to Rome'], 'new boards go last');
select throws_ok($$ insert into boards (name) values ('vegan DESSERTS') $$, '23505', null, 'board names are unique per owner, ignoring case');
select throws_ok($$ insert into boards (name) values ('   ') $$, '23514', null, 'empty names are rejected');
select throws_ok($$ insert into boards (name, user_id) values ('Sneaky', 'b2222222-2222-2222-2222-222222222222') $$, '42501', null, 'cannot create a board for someone else');
select is((select count(*)::int from boards), 2, 'owner sees only their own boards');

insert into board_scraps (board_id, scrap_id)
  select (select id from t_ids where k = 'desserts'), (select id from t_ids where k = 'scrap1');
insert into board_scraps (board_id, scrap_id)
  select (select id from t_ids where k = 'desserts'), (select id from t_ids where k = 'scrap2');
insert into board_scraps (board_id, scrap_id)
  select (select id from t_ids where k = 'rome'), (select id from t_ids where k = 'scrap1');

select throws_ok($$ insert into board_scraps (board_id, scrap_id)
  select (select id from t_ids where k = 'desserts'), (select id from t_ids where k = 'other_scrap') $$,
  '42501', null, 'cannot add someone else''s scrap, even a public one');
select throws_ok($$ insert into board_scraps (board_id, scrap_id)
  select (select id from t_ids where k = 'other_board'), (select id from t_ids where k = 'scrap1') $$,
  '42501', null, 'cannot add to someone else''s board');
select throws_ok($$ insert into board_scraps (board_id, scrap_id)
  select (select id from t_ids where k = 'rome'), (select id from t_ids where k = 'scrap1') $$,
  '23505', null, 'a scrap is on a board at most once');

select is((select scraps from my_boards() where name = 'Vegan desserts'), 2, 'my_boards counts scraps');
select is((select jsonb_array_length(covers) from my_boards() where name = 'Vegan desserts'), 2, 'my_boards returns covers');

select reorder_boards(array[(select id from t_ids where k = 'rome'), (select id from t_ids where k = 'desserts')]);
select is((select array_agg(name order by position) from my_boards()), array['Trip to Rome', 'Vegan desserts'], 'reorder saves the new order');

-- Removing the scrap removes it from boards; deleting a board keeps the scraps.
delete from scraps where id = (select id from t_ids where k = 'scrap2');
select is((select scraps from my_boards() where name = 'Vegan desserts'), 1, 'deleting a scrap takes it off its boards');
delete from boards where id = (select id from t_ids where k = 'rome');
select is((select count(*)::int from scraps where id = (select id from t_ids where k = 'scrap1')), 1, 'deleting a board keeps its scraps');

-- The other user sees none of it and can change none of it.
set local request.jwt.claims = '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from boards where id = (select id from t_ids where k = 'desserts')), 0, 'others cannot see the board');
select is((select count(*)::int from board_scraps where board_id = (select id from t_ids where k = 'desserts')), 0, 'others cannot see what is on it');
update boards set name = 'Hacked' where id = (select id from t_ids where k = 'desserts');
reset role;
select is((select name from boards where id = (select id from t_ids where k = 'desserts')), 'Vegan desserts', 'others cannot rename it');

select * from finish();
rollback;
