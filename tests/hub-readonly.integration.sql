begin;
select set_config('zenit_test.uid', gen_random_uuid()::text, true);
select set_config('zenit_test.other', gen_random_uuid()::text, true);
insert into auth.users(id) values (current_setting('zenit_test.uid')::uuid), (current_setting('zenit_test.other')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('zenit_test.uid'), true);
select set_config('request.jwt.claims', '{}', true);
do $$
declare sid uuid := gen_random_uuid(); res jsonb; n integer;
begin
  res := public.zenit_day_save_subject(gen_random_uuid(), sid, 0,
    '{"title":"Hub fixture","status":"todo","responsible_is_self":true,"archived":false}');
  if res->>'result' <> 'saved' then raise exception 'normal app write failed'; end if;
  perform set_config('request.jwt.claims', '{"client_id":"hub-client"}', true);
  if public.zenit_day_hub_connection_check()->>'hub_read_only' <> 'true' then raise exception 'missing capability'; end if;
  select count(*) into n from public.zenit_day_subjects where id=sid;
  if n <> 1 then raise exception 'owner cannot read'; end if;
  begin
    perform public.zenit_day_save_subject(gen_random_uuid(), sid, 1,
      '{"title":"Forbidden OAuth write","status":"done","responsible_is_self":true,"archived":false}');
    raise exception 'oauth write was accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', current_setting('zenit_test.other'), true);
  select count(*) into n from public.zenit_day_subjects where id=sid;
  if n <> 0 then raise exception 'cross-user read'; end if;
  perform set_config('request.jwt.claim.sub', current_setting('zenit_test.uid'), true);
  perform set_config('request.jwt.claims', '{}', true);
  res := public.zenit_day_save_subject(gen_random_uuid(), sid, 1,
    '{"title":"Normal update after OAuth denial","status":"done","responsible_is_self":true,"archived":false}');
  if res->>'result' <> 'saved' then raise exception 'normal update blocked'; end if;
end;
$$;
rollback;
select 'Hub OAuth read-only and owner isolation passed' as result;
