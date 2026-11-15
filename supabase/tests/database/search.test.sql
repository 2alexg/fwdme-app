-- Keyword search: only your own scraps, every word must match, Hebrew-aware.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('5e111111-1111-1111-1111-111111111111', 'searcher@test.local', '{"username":"searcher"}'),
  ('5e222222-2222-2222-2222-222222222222', 'searcher2@test.local', '{"username":"searcher2"}');

create temp table t_ids (k text primary key, id uuid) on commit drop;
grant all on t_ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5e111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into t_ids select 'pasta', (save_scrap('https://search.test/pasta', 'https://search.test/pasta', 'web', 'Make it for Friday dinner') ->> 'scrap_id')::uuid;
insert into t_ids select 'hummus', (save_scrap('https://search.test/hummus', 'https://search.test/hummus') ->> 'scrap_id')::uuid;
insert into t_ids select 'rome', (save_scrap('https://search.test/rome', 'https://search.test/rome', 'web', null, null, 'Shared caption: 3 days in Rome') ->> 'scrap_id')::uuid;
insert into t_ids select 'wild', (save_scrap('https://search.test/wild', 'https://search.test/wild') ->> 'scrap_id')::uuid;

-- The other user has a pasta link too.
set local request.jwt.claims = '{"sub":"5e222222-2222-2222-2222-222222222222","role":"authenticated"}';
select save_scrap('https://search.test/other-pasta', 'https://search.test/other-pasta', 'web', 'pasta night', 'public');

-- Fill in what the worker would have written.
reset role;
update items set ai_title = 'Lemon pasta', ai_title_he = 'פסטה לימון', tags = '{lemon,pasta}',
  tag_labels = '{"lemon":{"en":"lemon","he":"לימון"}}', summary_en = 'A quick weeknight dinner.',
  raw_text = 'Boil the spaghetti. Zest two lemons.'
  where canonical_url = 'https://search.test/pasta';
update items set ai_title = 'Hummus', ai_title_he = 'חומוס ביתי', summary_he = 'מתכון לחומוס עם טחינה.',
  raw_text = 'Soak the chickpeas overnight. Pasta is not involved.'
  where canonical_url = 'https://search.test/hummus';
update items set og_title = 'Trip planning', raw_text = 'הַטִּיּוּל לְרוֹמָא' where canonical_url = 'https://search.test/rome';
update items set og_title = '100% real_deal' where canonical_url = 'https://search.test/wild';
update scraps set user_category_override = 'food' where id in (select id from t_ids where k in ('pasta', 'hummus'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"5e111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select array_agg(scrap_id order by rank desc) from search_my_scraps('pasta')),
          array[(select id from t_ids where k = 'pasta'), (select id from t_ids where k = 'hummus')],
          'a title match ranks above a page-text match; other people''s scraps never show');
select is((select count(*)::int from search_my_scraps('LEMON')), 1, 'case does not matter');
select is((select count(*)::int from search_my_scraps('lemon hummus')), 0, 'every word has to match');
select is((select scrap_id from search_my_scraps('friday')), (select id from t_ids where k = 'pasta'), 'finds words in my comments');
select is((select scrap_id from search_my_scraps('caption')), (select id from t_ids where k = 'rome'), 'finds words in the text the sharing app attached');
select is((select scrap_id from search_my_scraps('לימון')), (select id from t_ids where k = 'pasta'), 'finds Hebrew titles and tag labels');
select is((select scrap_id from search_my_scraps('טחינה')), (select id from t_ids where k = 'hummus'), 'finds Hebrew summaries');
select is((select scrap_id from search_my_scraps('והחומוס')), (select id from t_ids where k = 'hummus'), 'a Hebrew prefix on the query word is optional');
select is((select scrap_id from search_my_scraps('טיול')), (select id from t_ids where k = 'rome'), 'niqqud in the page text is ignored');
select is((select scrap_id from search_my_scraps('רוֹמָא')), (select id from t_ids where k = 'rome'), 'niqqud in the query is ignored');
select is((select scrap_id from search_my_scraps('100%')), (select id from t_ids where k = 'wild'), '% is matched literally');
select is((select count(*)::int from search_my_scraps('l_mon')), 0, '_ is matched literally, not as a wildcard');
select is((select count(*)::int from search_my_scraps('pasta', 'travel')), 0, 'the category filter applies');
select is((select count(*)::int from search_my_scraps('   ')), 0, 'an empty query finds nothing');

select * from finish();
rollback;
