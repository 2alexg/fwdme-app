-- Feedback: signed-in users send it, nobody reads it back, 20 a day at most.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('fb111111-1111-1111-1111-111111111111', 'fb_a@test.local', '{"username":"fb_a"}');

set local role anon;
select throws_ok($$ select send_feedback('hi') $$, '42501', null, 'signed-out callers cannot send feedback');

set local role authenticated;
set local request.jwt.claims = '{"sub":"fb111111-1111-1111-1111-111111111111","role":"authenticated"}';
select isnt(send_feedback('  The share sheet is slow  ', '1.0.0', 'ios', '18.2', 'he'), null, 'feedback is saved');
select throws_ok($$ select send_feedback('   ') $$, '22023', 'empty_feedback', 'empty feedback is refused');
select is((select count(*)::int from feedback), 0, 'senders cannot read feedback back');
select throws_ok($$ insert into feedback (user_id, body) values ('fb111111-1111-1111-1111-111111111111', 'x') $$,
                 '42501', null, 'and cannot write the table directly');
select send_feedback('more ' || g) from generate_series(1, 19) g;
select throws_ok($$ select send_feedback('one too many') $$, '54000', 'too_much_feedback', 'at most 20 a day');
reset role;

select is((select body || ' / ' || platform || ' ' || os_version || ' / ' || locale from feedback
           where body like 'The share%'),
          'The share sheet is slow / ios 18.2 / he', 'trimmed, with where it came from');
delete from auth.users where id = 'fb111111-1111-1111-1111-111111111111';
select is((select count(*)::int from feedback), 0, 'deleted with the account');

select * from finish();
rollback;
