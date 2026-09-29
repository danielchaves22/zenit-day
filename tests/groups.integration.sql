-- Fixtures and account identities are rolled back, including on the real project.
begin;
select set_config('zenit_test.uid',gen_random_uuid()::text,true);
select set_config('zenit_test.other',gen_random_uuid()::text,true);
insert into auth.users(id) values (current_setting('zenit_test.uid')::uuid),(current_setting('zenit_test.other')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('zenit_test.uid'),true);
do $$
declare
  sid uuid := gen_random_uuid();
  op uuid := gen_random_uuid();
  doc jsonb := '{"title":"Groups fixture","status":"doing","responsible_is_self":true,"archived":false,"project":"Projeto legado"}';
  res jsonb;
  receipt jsonb;
  rev integer := 1;
begin
  if public.zenit_day_connection_check()->>'groups' is distinct from 'true' then raise exception 'groups capability missing'; end if;
  res := public.zenit_day_save_subject(op,sid,0,doc);
  receipt := res;
  if res#>>'{subject,project}'<>'Projeto legado' or res#>>'{subject,subgroup}' is not null then raise exception 'legacy context not retained as group'; end if;
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||'{"subgroup":"Cliente A"}');
  rev := rev+1;
  if res#>>'{subject,subgroup}'<>'Cliente A' then raise exception 'subgroup not saved'; end if;
  if public.zenit_day_save_subject(op,sid,0,doc) is distinct from receipt then raise exception 'legacy receipt changed'; end if;
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||'{"situation":"Edit from old client"}');
  rev := rev+1;
  if res#>>'{subject,subgroup}'<>'Cliente A' then raise exception 'old client erased subgroup'; end if;
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev-1,doc||'{"subgroup":"Cliente B"}');
  if res->>'result'<>'conflict' or res#>>'{subject,subgroup}'<>'Cliente A' then raise exception 'group conflict lost'; end if;
  begin
    perform public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||'{"project":null,"subgroup":"Orphan"}');
    raise exception 'orphan subgroup accepted';
  exception when check_violation then null; end;
  begin
    perform public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||jsonb_build_object('subgroup',repeat('a',201)));
    raise exception 'long subgroup accepted';
  exception when check_violation then null; end;
  begin
    perform public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||'{"subgroup":{}}');
    raise exception 'invalid subgroup type';
  exception when sqlstate '22023' then null; end;
  -- Moving a subject in an older client cannot leave a child under the wrong parent.
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||'{"project":"Outro grupo"}');
  rev := rev+1;
  if res#>>'{subject,project}'<>'Outro grupo' or res#>>'{subject,subgroup}' is not null then raise exception 'legacy move not cleared'; end if;
  op := gen_random_uuid();
  doc := doc||'{"project":"Pessoal","subgroup":"Cliente A"}';
  res := public.zenit_day_save_subject(op,sid,rev,doc);
  if res is distinct from public.zenit_day_save_subject(op,sid,rev,doc) then raise exception 'retry not idempotent'; end if;
  rev := rev+1;
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||'{"project":null,"subgroup":null}');
  if res#>>'{subject,project}' is not null or res#>>'{subject,subgroup}' is not null then raise exception 'ungroup failed'; end if;
  if res#>>'{subject,status}'<>'doing' then raise exception 'group changed status'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('zenit_test.other'),true);
  if exists(select 1 from public.zenit_day_subjects where user_id<>auth.uid()) then raise exception 'RLS broken'; end if;
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc);
  if res->>'result'<>'conflict' or res->'subject'<>'null'::jsonb then raise exception 'cross-account group leak'; end if;
  if has_function_privilege('anon','public.zenit_day_save_subject(uuid,uuid,integer,jsonb,text)','execute') then raise exception 'anonymous access'; end if;
end $$;
rollback;
select 'Groups: legacy contexts, optional membership, subgroup validation, moves, replay, conflicts and RLS passed; fixtures rolled back.' as result;
