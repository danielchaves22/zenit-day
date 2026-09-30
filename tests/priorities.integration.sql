-- Synthetic fixtures and identities are always rolled back.
begin;
select set_config('zenit_test.uid',gen_random_uuid()::text,true);
select set_config('zenit_test.other',gen_random_uuid()::text,true);
insert into auth.users(id) values (current_setting('zenit_test.uid')::uuid),(current_setting('zenit_test.other')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('zenit_test.uid'),true);
select set_config('request.jwt.claims','{}',true);
do $$
declare
  sid uuid := gen_random_uuid();
  op uuid := gen_random_uuid();
  doc jsonb := '{"title":"Priority fixture","status":"todo","responsible_is_self":true,"archived":false}';
  res jsonb;
  receipt jsonb;
  rev integer := 0;
  level text;
  bad jsonb;
begin
  if public.zenit_day_connection_check()->>'priorities' is distinct from 'true' then raise exception 'capability missing'; end if;
  res := public.zenit_day_save_subject(op,sid,rev,doc);
  receipt := res;
  rev := rev+1;
  if res#>>'{subject,priority}' is distinct from 'normal' then raise exception 'legacy default missing'; end if;
  foreach level in array array['low','normal','important','urgent'] loop
    res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||jsonb_build_object('priority',level));
    rev := rev+1;
    if res#>>'{subject,priority}' is distinct from level then raise exception 'priority not saved'; end if;
  end loop;
  -- Older app edits preserve priority set by a newer app.
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||'{"status":"doing"}');
  rev := rev+1;
  if res#>>'{subject,priority}' is distinct from 'urgent' then raise exception 'old app erased priority'; end if;
  if public.zenit_day_save_subject(op,sid,0,doc) is distinct from receipt then raise exception 'old receipt changed'; end if;
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev-1,doc||'{"priority":"low"}');
  if res->>'result'<>'conflict' or res#>>'{subject,priority}'<>'urgent' then raise exception 'priority conflict lost'; end if;
  for bad in select value from jsonb_array_elements('[null,1,true,[],{},"", "high", ["urgent"]]'::jsonb) loop
    begin
      perform public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc||jsonb_build_object('priority',bad));
      raise exception 'invalid priority accepted: %',bad;
    exception when sqlstate '22023' then null; end;
  end loop;
  op := gen_random_uuid();
  doc := doc||'{"priority":"normal"}';
  res := public.zenit_day_save_subject(op,sid,rev,doc);
  if res is distinct from public.zenit_day_save_subject(op,sid,rev,doc) then raise exception 'retry not idempotent'; end if;
  begin
    perform public.zenit_day_save_subject(op,sid,rev,doc||'{"priority":"important"}');
    raise exception 'changed retry accepted';
  exception when sqlstate '22023' then null; end;
  rev := rev+1;
  perform set_config('request.jwt.claim.sub',current_setting('zenit_test.other'),true);
  if exists(select 1 from public.zenit_day_subjects where user_id<>auth.uid()) then raise exception 'RLS isolation broken'; end if;
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,rev,doc);
  if res->>'result'<>'conflict' or res->'subject'<>'null'::jsonb then raise exception 'cross-account leak'; end if;
  if has_function_privilege('anon','public.zenit_day_save_subject(uuid,uuid,integer,jsonb,text)','execute') then raise exception 'anonymous access'; end if;
  if has_table_privilege('authenticated','public.zenit_day_subjects','update') then raise exception 'direct writes allowed'; end if;
end $$;
rollback;
select 'Priority: values, legacy default/preservation, replay, invalid payloads, conflicts and account isolation passed; fixtures rolled back.' as result;
