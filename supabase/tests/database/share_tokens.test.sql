-- Share tokens: the iOS share sheet saves as the token's user, and only that.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('7a111111-1111-1111-1111-111111111111', 'tok_a@test.local', '{"username":"tok_a"}'),
  ('7a222222-2222-2222-2222-222222222222', 'tok_b@test.local', '{"username":"tok_b"}');

create temp table t (k text primary key, v text) on commit drop;
grant all on t to authenticated, service_role, anon;

set local role authenticated;
set local request.jwt.claims = '{"sub":"7a111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into t values ('tok_a', create_share_token('iPhone'));
select is(char_length((select v from t where k = 'tok_a')), 64, 'a token is 64 hex characters');
select is((select count(*)::int from share_tokens), 1, 'the owner sees their device');
select is((select label from share_tokens), 'iPhone', 'with its label');
select throws_ok($$ select token_hash from share_tokens $$, '42501', null, 'the hash is never readable');
set local request.jwt.claims = '{"sub":"7a222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into t values ('b_scrap', save_scrap('https://tok.test/b', 'https://tok.test/b') ->> 'scrap_id');
select is((select count(*)::int from share_tokens), 0, 'others don''t see it');
select throws_ok($$ select share_save((select v from t where k = 'tok_a'), 'https://tok.test/x', 'https://tok.test/x', 'web') $$,
                 '42501', null, 'signed-in users cannot call the share functions');

set local role service_role;
insert into t values ('a_scrap', share_save((select v from t where k = 'tok_a'), 'https://tok.test/a?x=1', 'https://tok.test/a', 'web', 'a caption') ->> 'scrap_id');
reset role;
select is((select user_id::text from scraps where id = (select v::uuid from t where k = 'a_scrap')),
          '7a111111-1111-1111-1111-111111111111', 'share_save saves as the token''s user');
select is((select shared_text from scraps where id = (select v::uuid from t where k = 'a_scrap')), 'a caption', 'with the shared text');
select isnt((select last_used_at from share_tokens where user_id = '7a111111-1111-1111-1111-111111111111'), null, 'and notes when the token was used');

set local role service_role;
select share_add_comment((select v from t where k = 'tok_a'), (select v::uuid from t where k = 'a_scrap'), ' for Friday ');
select share_set_visibility((select v from t where k = 'tok_a'), (select v::uuid from t where k = 'a_scrap'), 'public');
reset role;
select is((select body || ' / ' || s.visibility from scrap_comments c join scraps s on s.id = c.scrap_id
           where s.id = (select v::uuid from t where k = 'a_scrap')), 'for Friday / public', 'comments and visibility from the sheet');

set local role service_role;
select throws_ok($$ select share_add_comment((select v from t where k = 'tok_a'), (select v::uuid from t where k = 'b_scrap'), 'hi') $$,
                 '42501', 'not your scrap', 'a token cannot touch someone else''s scrap');
select throws_ok($$ select share_save('not-a-token', 'https://tok.test/z', 'https://tok.test/z', 'web') $$,
                 '28000', 'invalid share token', 'a wrong token is refused');

-- Sign-out revokes it.
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a111111-1111-1111-1111-111111111111","role":"authenticated"}';
select revoke_share_token((select v from t where k = 'tok_a'));
set local role service_role;
select throws_ok($$ select share_save((select v from t where k = 'tok_a'), 'https://tok.test/z', 'https://tok.test/z', 'web') $$,
                 '28000', 'invalid share token', 'a revoked token no longer works');

select * from finish();
rollback;
