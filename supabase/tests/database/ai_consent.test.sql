-- AI consent: nothing of a person's goes to the AI services until they agree.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Park everything else in the database so only this test's items are due.
update items set status = 'ready', locked_until = null, embed_attempted_at = now();

insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000001', 'consent-yes@test.local', '{"username":"consent_yes","ai_consent":true}'),
  ('cccccccc-0000-0000-0000-000000000002', 'consent-old@test.local', '{"username":"consent_old"}'),
  ('cccccccc-0000-0000-0000-000000000003', 'consent-late@test.local', '{"username":"consent_late"}');

select isnt((select ai_consent_at from profiles where username = 'consent_yes'), null, 'agreeing at sign-up is recorded');
select is((select ai_consent_at from profiles where username = 'consent_old'), null, 'older accounts start without consent');

-- Users can't set it by editing their profile
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$ update profiles set ai_consent_at = now() where id = 'cccccccc-0000-0000-0000-000000000002' $$,
                 '42501', null, 'consent is not editable directly');
select is(my_ai_consent(), false, 'my_ai_consent is false before agreeing');

-- consent_old saves a link (with shared text); nobody agreed for it yet
select save_scrap('https://old-only.consent-test/', 'https://old-only.consent-test/', p_shared_text => 'look at this https://old-only.consent-test/');
-- ...and one consent_yes also saves
select save_scrap('https://both.consent-test/', 'https://both.consent-test/', p_shared_text => 'old person text https://both.consent-test/');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';
select save_scrap('https://both.consent-test/', 'https://both.consent-test/', p_shared_text => 'agreed person text https://both.consent-test/');
select is(my_ai_consent(), true, 'my_ai_consent is true after agreeing at sign-up');
reset role;

set local role service_role;
select is(array(select canonical_url from worker_claim_items(10) order by 1),
          array['https://both.consent-test/'], 'only items someone agreed for are claimed');
select is(array(select worker_shared_texts(
            (select id from items where canonical_url = 'https://both.consent-test/'))),
          array['agreed person text https://both.consent-test/'], 'only shared text from people who agreed is sent');
reset role;

-- The cron check doesn't wake the worker for items nobody agreed for
delete from net.http_request_queue;
select private.kick_worker_if_due();
select is((select count(*)::int from net.http_request_queue), 0, 'no wake-ups for items waiting on consent');

-- consent_old agrees from the app
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}';
select isnt(give_ai_consent(), null, 'give_ai_consent returns the time');
select is(my_ai_consent(), true, 'and my_ai_consent is true');
reset role;
select is((select count(*)::int from net.http_request_queue where url like '%/functions/v1/enrich'), 1,
          'agreeing wakes the worker');
update profiles set ai_consent_at = '2026-01-01' where username = 'consent_old';
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}';
select is(give_ai_consent(), '2026-01-01'::timestamptz, 'agreeing twice keeps the first time');
reset role;

set local role service_role;
select is(array(select canonical_url from worker_claim_items(10)),
          array['https://old-only.consent-test/'], 'their waiting link is claimed now');
reset role;

-- Only signed-in people can agree; only the worker reads shared texts
set local role anon;
select throws_ok($$ select give_ai_consent() $$, '42501', null, 'anonymous callers cannot agree');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok($$ select worker_shared_texts(gen_random_uuid()) $$, '42501', null, 'users cannot read shared texts');
select throws_ok($$ select private.item_has_ai_consent(gen_random_uuid()) $$, '42501', null, 'the helper is private');
reset role;

select * from finish();
rollback;
