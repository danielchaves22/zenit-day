begin;
insert into zenit_day_private.reminder_clients values ('7a30e372-a6dc-4369-9302-a26963bf219e');
select set_config('zenit_test.uid',gen_random_uuid()::text,true);
select set_config('zenit_test.other',gen_random_uuid()::text,true);
select set_config('zenit_test.reminder',gen_random_uuid()::text,true);
select set_config('zenit_test.due',(date_trunc('second',clock_timestamp())-interval '1 minute')::text,true);
insert into auth.users(id) values(current_setting('zenit_test.uid')::uuid),(current_setting('zenit_test.other')::uuid);
-- Realistic elapsed occurrence, created before its due time; no test sleeps.
insert into public.zenit_day_reminders(user_id,id,title,subject_id,enabled,deleted,schedule,revision,created_at,updated_at,requires_confirmation)
values(current_setting('zenit_test.uid')::uuid,current_setting('zenit_test.reminder')::uuid,'Current occurrence',null,true,false,
 jsonb_build_object('kind','interval','timeZone','America/Sao_Paulo','startAt',current_setting('zenit_test.due')::timestamptz-interval '1 hour','endAt',null,'times','[]'::jsonb,'weekDays','[]'::jsonb,'monthDay',null,'intervalMinutes',60,'windowStart',null,'windowEnd',null),1,
 current_setting('zenit_test.due')::timestamptz-interval '2 hours',current_setting('zenit_test.due')::timestamptz-interval '2 hours',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('zenit_test.uid'),true);
select set_config('request.jwt.claims','{}',true);
do $$
declare rid uuid:=current_setting('zenit_test.reminder')::uuid; due timestamptz:=current_setting('zenit_test.due')::timestamptz;
  client text:='7a30e372-a6dc-4369-9302-a26963bf219e'; id uuid:=gen_random_uuid(); r jsonb; doc jsonb; old_doc jsonb;
begin
  select jsonb_build_object('title','Legacy client','subject_id',null,'enabled',r.enabled,'deleted',r.deleted,'schedule',r.schedule) into old_doc from public.zenit_day_reminders r where r.id=rid;
  r:=public.zenit_day_save_reminder(gen_random_uuid(),id,0,old_doc);
  if r->'reminder'->>'requires_confirmation'<>'false' or r->'reminder'->>'respect_quiet_hours'<>'true' then raise exception 'Unsafe defaults'; end if;
  doc:=old_doc||'{"requires_confirmation":true,"repeat_minutes":7,"respect_quiet_hours":false}';
  r:=public.zenit_day_save_reminder(gen_random_uuid(),id,1,doc);
  r:=public.zenit_day_save_reminder(gen_random_uuid(),id,2,old_doc||'{"title":"Old writer edit"}');
  if r->'reminder'->>'requires_confirmation'<>'true' or r->'reminder'->>'repeat_minutes'<>'7' or r->'reminder'->>'respect_quiet_hours'<>'false' then raise exception 'Old writer erased options'; end if;
  begin perform public.zenit_day_save_reminder(gen_random_uuid(),id,3,doc||'{"repeat_minutes":0}'); raise exception 'Accepted zero interval'; exception when invalid_parameter_value then null; end;
  begin perform public.zenit_day_save_reminder(gen_random_uuid(),id,3,doc||'{"repeat_minutes":1.5}'); raise exception 'Accepted fractional interval'; exception when invalid_parameter_value then null; end;
  begin perform public.zenit_day_save_reminder(gen_random_uuid(),id,3,doc||'{"respect_quiet_hours":null}'); raise exception 'Accepted null option'; exception when invalid_parameter_value then null; end;
  if public.zenit_day_reminder_occurrence_state(rid,1,due)->>'state'<>'pending' then raise exception 'Missing current occurrence'; end if;
  if public.zenit_day_complete_reminder(rid,1,due-interval '1 hour')->>'state'<>'obsolete' then raise exception 'Completed old occurrence'; end if;
  if public.zenit_day_complete_reminder(rid,1,due+interval '1 hour')->>'state'<>'obsolete' then raise exception 'Completed future occurrence'; end if;
  if public.zenit_day_complete_reminder(rid,1,due+interval '1 second')->>'state'<>'obsolete' then raise exception 'Completed invented occurrence'; end if;
  if public.zenit_day_complete_reminder(rid,2,due)->>'state'<>'obsolete' then raise exception 'Completed wrong revision'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('zenit_test.other'),true);
  if public.zenit_day_complete_reminder(rid,1,due)->>'state'<>'obsolete' then raise exception 'Cross-owner completion'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('zenit_test.uid'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('client_id',client)::text,true);
  begin perform public.zenit_day_complete_reminder(rid,1,due); raise exception 'Completed before consent'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{}',true);
  perform public.zenit_day_set_reminder_consent(client,true);
  perform set_config('request.jwt.claims',jsonb_build_object('client_id',client)::text,true);
  if public.zenit_day_complete_reminder(rid,1,due)->>'state'<>'completed' then raise exception 'Completion failed'; end if;
  if public.zenit_day_complete_reminder(rid,1,due)->>'state'<>'completed' then raise exception 'Retry failed'; end if;
  if (select count(*) from public.zenit_day_reminder_completions)<>1 then raise exception 'Duplicate completion'; end if;
  if public.zenit_day_reminder_occurrence_state(rid,1,due)->>'state'<>'completed' then raise exception 'Completion not readable'; end if;
  begin insert into public.zenit_day_reminder_completions values(auth.uid(),rid,1,due+interval '1 hour',now()); raise exception 'Direct table write allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{}',true);
  perform public.zenit_day_set_reminder_consent(client,false);
  perform set_config('request.jwt.claims',jsonb_build_object('client_id',client)::text,true);
  begin perform public.zenit_day_complete_reminder(rid,1,due); raise exception 'Revoked retry accepted'; exception when insufficient_privilege then null; end;
  if (select count(*) from public.zenit_day_reminder_completions)<>0 then raise exception 'Revoked read leaked'; end if;
end $$;
rollback;
select 'Reminder confirmation: legacy options, occurrence boundaries, idempotency, consent and owner isolation passed' as result;
