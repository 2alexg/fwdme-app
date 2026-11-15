-- Enrichment queue: claiming, stale locks, retries, who may call what.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Park everything else in the database so only this test's items are due.
update items set status = 'ready', locked_until = null;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'enrich-owner@test.local', '{"username":"enrich_owner"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'enrich-other@test.local', '{"username":"enrich_other"}');

-- Plumbing
select ok((select public from storage.buckets where id = 'thumbnails'), 'thumbnails bucket exists and is public');
select is((select schedule from cron.job where jobname = 'enrich-items'), '* * * * *', 'cron wakes the worker every minute');

-- Saving a link queues its item and pings the worker
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select save_scrap('https://one.enrich-test/', 'https://one.enrich-test/');
select save_scrap('https://two.enrich-test/', 'https://two.enrich-test/');
reset role;
select is((select status::text from items where canonical_url = 'https://one.enrich-test/'), 'pending', 'new items start pending');
select ok(exists (select 1 from net.http_request_queue where url like '%/functions/v1/enrich'),
          'inserting an item queues a request to the worker');

-- Only the worker (service role) may claim
set local role authenticated;
select throws_ok($$ select * from worker_claim_items(5) $$, '42501', null, 'users cannot claim work');
reset role;
set local role anon;
select throws_ok($$ select * from worker_claim_items(5) $$, '42501', null, 'anonymous callers cannot claim work');
reset role;

set local role service_role;
select is((select count(*)::int from worker_claim_items(1)), 1, 'claim respects the limit');
select is((select count(*)::int from worker_claim_items(5)), 1, 'the next claim takes the remaining item');
select is((select count(*)::int from worker_claim_items(5)), 0, 'claimed items are not handed out twice');
select is((select status::text from items where canonical_url = 'https://one.enrich-test/'), 'fetching', 'claimed items are marked fetching');
select is((select attempts from items where canonical_url = 'https://one.enrich-test/'), 1, 'claiming counts an attempt');

-- A worker died: the lock expires and the item is retried
update items set locked_until = now() - interval '1 second' where canonical_url = 'https://one.enrich-test/';
select is((select canonical_url from worker_claim_items(5)), 'https://one.enrich-test/', 'expired locks are reclaimed');
select is((select attempts from items where canonical_url = 'https://one.enrich-test/'), 2, 'and count another attempt');

-- ...until it runs out of attempts
update items set locked_until = now() - interval '1 second', attempts = 4 where canonical_url = 'https://one.enrich-test/';
select is((select count(*)::int from worker_claim_items(5)), 0, 'items out of attempts are not reclaimed');
select is((select status::text || ':' || error from items where canonical_url = 'https://one.enrich-test/'),
          'failed:timed out', 'they are marked failed');

-- Backoff: a pending item waits for next_attempt_at
update items set status = 'pending', next_attempt_at = now() + interval '1 minute' where canonical_url = 'https://two.enrich-test/';
select is((select count(*)::int from worker_claim_items(5)), 0, 'items wait for their retry time');
reset role;

-- Retry from the app: only the owner, only failed items
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select is(retry_item((select id from scraps where original_url = 'https://one.enrich-test/')), false,
          'others cannot retry your scrap');
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select is(retry_item((select id from scraps where original_url = 'https://two.enrich-test/')), false,
          'items that have not failed are left alone');
select is(retry_item((select id from scraps where original_url = 'https://one.enrich-test/')), true,
          'the owner can retry a failed item');
reset role;
select is((select status::text || ':' || attempts from items where canonical_url = 'https://one.enrich-test/'),
          'pending:0', 'retry re-queues it with fresh attempts');

-- Effective category: the AI's, unless the owner corrected it
update items set category = 'recipes' where canonical_url in ('https://one.enrich-test/', 'https://two.enrich-test/');
select is((select category from scraps where original_url = 'https://one.enrich-test/'), 'recipes',
          'scraps follow the AI category of their item');
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
update scraps set user_category_override = 'travel' where original_url = 'https://one.enrich-test/';
select is((select category from scraps where original_url = 'https://one.enrich-test/'), 'travel',
          'the owner can correct the category');
reset role;
update items set category = 'humor' where canonical_url in ('https://one.enrich-test/', 'https://two.enrich-test/');
select is((select string_agg(category, ',' order by original_url) from scraps where original_url like '%.enrich-test/'),
          'travel,humor', 'a corrected category survives re-enrichment; others follow it');
set local role authenticated;
select results_eq($$ select category, scraps from my_category_counts() $$,
                  $$ values ('humor', 1), ('travel', 1) $$, 'category counts cover only my scraps');
update scraps set user_category_override = null where original_url = 'https://one.enrich-test/';
select is((select category from scraps where original_url = 'https://one.enrich-test/'), 'humor',
          'clearing the correction goes back to the AI category');
reset role;

select * from finish();
rollback;
