-- Safe for local and real projects: all fixtures, accounts and operations roll back.
begin;
select set_config('zenit_test.uid',gen_random_uuid()::text,true);
select set_config('zenit_test.other',gen_random_uuid()::text,true);
insert into auth.users(id) values (current_setting('zenit_test.uid')::uuid),(current_setting('zenit_test.other')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('zenit_test.uid'),true);
do $$
declare
  sid uuid := gen_random_uuid();
  item_id uuid := gen_random_uuid();
  op uuid := gen_random_uuid();
  doc jsonb := '{"title":"Checklist integration fixture","status":"doing","responsible_is_self":true,"archived":false}';
  items jsonb;
  res jsonb;
  receipt jsonb;
  bad jsonb;
  rev integer := 1;
begin
  if public.zenit_day_connection_check()->>'checklist' is distinct from 'true' then raise exception 'capability missing'; end if;
  res := public.zenit_day_save_subject(op,sid,0,doc);
  if res#>'{subject,checklist}' is distinct from '[]'::jsonb then raise exception 'legacy create default missing'; end if;
  receipt := res;
  items := jsonb_build_array(jsonb_build_object('id',item_id,'text','Revisar proposta','done',false));
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||jsonb_build_object('checklist',items));
  rev := rev+1;
  if res#>'{subject,checklist}' is distinct from items then raise exception 'checklist not saved'; end if;
  -- A legacy request omits the new field and must not erase existing items.
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc);
  rev := rev+1;
  if res#>'{subject,checklist}' is distinct from items then raise exception 'legacy erased checklist'; end if;
  if public.zenit_day_save_subject(op,sid,0,doc) is distinct from receipt then raise exception 'legacy receipt changed'; end if;
  items := jsonb_set(items,'{0,done}','true');
  op := gen_random_uuid();
  res := public.zenit_day_save_subject(op,sid,rev,doc||jsonb_build_object('checklist',items));
  if res#>>'{subject,status}'<>'doing' or res#>>'{subject,checklist,0,done}'<>'true' then raise exception 'checklist changed status'; end if;
  if public.zenit_day_save_subject(op,sid,rev,doc||jsonb_build_object('checklist',items)) is distinct from res then raise exception 'checklist retry not idempotent'; end if;
  rev := rev+1;
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev-1,doc||'{"checklist":[]}');
  if res->>'result'<>'conflict' or res#>'{subject,checklist}' is distinct from items then raise exception 'conflict lost checklist'; end if;
  foreach bad in array array[
    'null'::jsonb, '{}'::jsonb, '[null]'::jsonb,
    jsonb_set(items,'{0,done}','"yes"'), jsonb_set(items,'{0,text}','" "'),
    jsonb_set(items,'{0,text}',to_jsonb(repeat('a',501))),
    jsonb_set(items,'{0,id}','"invalid"'), items||items,
    jsonb_set(items,'{0,extra}','true'), '[{}]'::jsonb
  ] loop
    begin
      perform public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||jsonb_build_object('checklist',bad));
      raise exception 'invalid checklist accepted: %',bad;
    exception when sqlstate '22023' then null; end;
  end loop;
  begin
    select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'text','x','done',false)) into bad from generate_series(1,101);
    perform public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||jsonb_build_object('checklist',bad));
    raise exception 'oversized checklist accepted';
  exception when sqlstate '22023' then null; end;
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||'{"checklist":[]}');
  if res#>'{subject,checklist}' is distinct from '[]'::jsonb then raise exception 'clear checklist failed'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('zenit_test.other'),true);
  if exists(select 1 from public.zenit_day_subjects where user_id<>auth.uid()) then raise exception 'RLS isolation broken'; end if;
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||jsonb_build_object('checklist',items));
  if res->>'result'<>'conflict' or res->'subject'<>'null'::jsonb then raise exception 'cross-account data leak'; end if;
  if has_function_privilege('anon','public.zenit_day_save_subject(uuid,uuid,integer,jsonb,text)','execute') then raise exception 'anonymous RPC access'; end if;
  if has_table_privilege('authenticated','public.zenit_day_subjects','update') then raise exception 'direct writes allowed'; end if;
end $$;
rollback;
select 'Checklist: create/edit/toggle/clear, legacy requests, replay, conflicts, validation and isolation passed; fixtures rolled back.' as result;
