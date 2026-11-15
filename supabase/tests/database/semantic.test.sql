-- Search by meaning: only your own scraps, closest first, and embeddings are
-- dropped when what they describe changes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- A 1024-dim vector pointing mostly along axis 1 (a) or axis 2 (b).
create function pg_temp.vec(a float, b float) returns extensions.vector
language sql as $$
  select ('[' || a || ',' || b || ',' || array_to_string(array_fill(0, array[1022]), ',') || ']')::extensions.vector;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('5a111111-1111-1111-1111-111111111111', 'sem_a@test.local', '{"username":"sem_a"}'),
  ('5a222222-2222-2222-2222-222222222222', 'sem_b@test.local', '{"username":"sem_b"}');

create temp table t_ids (k text primary key, id uuid) on commit drop;
grant all on t_ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5a111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into t_ids select 'pasta', (save_scrap('https://sem.test/pasta', 'https://sem.test/pasta') ->> 'scrap_id')::uuid;
insert into t_ids select 'risotto', (save_scrap('https://sem.test/risotto', 'https://sem.test/risotto') ->> 'scrap_id')::uuid;
insert into t_ids select 'hiking', (save_scrap('https://sem.test/hiking', 'https://sem.test/hiking') ->> 'scrap_id')::uuid;
insert into t_ids select 'pending', (save_scrap('https://sem.test/pending', 'https://sem.test/pending') ->> 'scrap_id')::uuid;
set local request.jwt.claims = '{"sub":"5a222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into t_ids select 'b_lasagna', (save_scrap('https://sem.test/lasagna', 'https://sem.test/lasagna') ->> 'scrap_id')::uuid;
select save_scrap('https://sem.test/pasta', 'https://sem.test/pasta');  -- b saved the same pasta link

reset role;
update items set status = 'ready', embedding = pg_temp.vec(1, 0)    where canonical_url = 'https://sem.test/pasta';
update items set status = 'ready', embedding = pg_temp.vec(1, 0.3)  where canonical_url = 'https://sem.test/risotto';
update items set status = 'ready', embedding = pg_temp.vec(0, 1)    where canonical_url = 'https://sem.test/hiking';
update items set status = 'ready', embedding = pg_temp.vec(1, 0.1)  where canonical_url = 'https://sem.test/lasagna';
update scraps set user_category_override = 'recipes'
  where id in (select id from t_ids where k in ('pasta', 'risotto'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"5a111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select array_agg(scrap_id order by similarity desc) from match_my_scraps(pg_temp.vec(1, 0.05))),
          array[(select id from t_ids where k = 'pasta'), (select id from t_ids where k = 'risotto')],
          'closest first; unrelated, unembedded and other people''s scraps are left out');
select ok((select similarity from match_my_scraps(pg_temp.vec(1, 0)) limit 1) > 0.99, 'similarity is cosine similarity');
select is((select count(*)::int from match_my_scraps(pg_temp.vec(0, 1), 20, 0.5)), 1, 'the threshold filters weak matches');
select is((select count(*)::int from match_my_scraps(pg_temp.vec(1, 0), 20, 0.3, 'travel')), 0, 'the category filter applies');

select is((select array_agg(scrap_id) from related_scraps((select id from t_ids where k = 'pasta'))),
          array[(select id from t_ids where k = 'risotto')],
          'related: my other close scraps, not the scrap itself');
select is((select count(*)::int from related_scraps((select id from t_ids where k = 'pending'))), 0,
          'nothing related until the scrap has an embedding');
select is((select count(*)::int from related_scraps((select id from t_ids where k = 'b_lasagna'))), 0,
          'nothing for a scrap I cannot see');

set local request.jwt.claims = '{"sub":"5a222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select array_agg(scrap_id) from related_scraps((select id from t_ids where k = 'b_lasagna'))),
          array[(select s.id from scraps s join items i on i.id = s.item_id
                 where i.canonical_url = 'https://sem.test/pasta' and s.user_id = '5a222222-2222-2222-2222-222222222222')],
          'related uses the caller''s own scraps');

reset role;
update items set ai_title = 'Lemon pasta' where canonical_url = 'https://sem.test/pasta';
select is((select embedding from items where canonical_url = 'https://sem.test/pasta'), null,
          'a new title drops the old embedding');
update items set embedding = pg_temp.vec(1, 0), embedding_model = 'voyage-4' where canonical_url = 'https://sem.test/pasta';
select isnt((select embedding from items where canonical_url = 'https://sem.test/pasta'), null,
            'writing an embedding keeps it');

set local role anon;
select throws_ok($$ select * from match_my_scraps(pg_temp.vec(1, 0)) $$, '42501', null, 'signed-out visitors cannot search');

select * from finish();
rollback;
