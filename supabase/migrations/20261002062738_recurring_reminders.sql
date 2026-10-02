begin;

create or replace function public.zenit_day_validate_reminder_schedule(s jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare k text; start_at timestamptz; end_at timestamptz; n integer;
begin
  if jsonb_typeof(s) is distinct from 'object' or not (s ?& array['kind','timeZone','startAt','endAt','times','weekDays','monthDay','intervalMinutes','windowStart','windowEnd']) then
    raise exception 'invalid_schedule' using errcode='22023';
  end if;
  for k in select jsonb_object_keys(s) loop
    if not k=any(array['kind','timeZone','startAt','endAt','times','weekDays','monthDay','intervalMinutes','windowStart','windowEnd']) then raise exception 'unknown_schedule_field' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(s->'kind') <> 'string' or s->>'kind' not in ('daily','weekly','monthly','interval') or
    jsonb_typeof(s->'timeZone') <> 'string' or not exists(select 1 from pg_catalog.pg_timezone_names where name=s->>'timeZone') then raise exception 'invalid_frequency_or_timezone' using errcode='22023'; end if;
  if jsonb_typeof(s->'startAt') <> 'string' or (s->>'startAt') !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' or jsonb_typeof(s->'endAt') not in ('string','null') then raise exception 'invalid_schedule_dates' using errcode='22023'; end if;
  start_at := (s->>'startAt')::timestamptz; end_at := (s->>'endAt')::timestamptz;
  if not isfinite(start_at) or (end_at is not null and (not isfinite(end_at) or end_at <= start_at)) then raise exception 'invalid_schedule_dates' using errcode='22023'; end if;
  if jsonb_typeof(s->'times') <> 'array' or jsonb_typeof(s->'weekDays') <> 'array' then raise exception 'invalid_schedule_lists' using errcode='22023'; end if;
  if jsonb_array_length(s->'times') > 24 or exists(select 1 from jsonb_array_elements(s->'times') t where jsonb_typeof(t) <> 'string' or (t#>>'{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') or
     (select count(distinct t) from jsonb_array_elements(s->'times') t) <> jsonb_array_length(s->'times') then raise exception 'invalid_times' using errcode='22023'; end if;
  if jsonb_array_length(s->'weekDays') > 7 or exists(select 1 from jsonb_array_elements(s->'weekDays') d where jsonb_typeof(d) <> 'number' or (d#>>'{}') !~ '^[0-6]$') or
     (select count(distinct d) from jsonb_array_elements(s->'weekDays') d) <> jsonb_array_length(s->'weekDays') then raise exception 'invalid_weekdays' using errcode='22023'; end if;
  if s->>'kind' <> 'interval' and jsonb_array_length(s->'times') = 0 then raise exception 'time_required' using errcode='22023'; end if;
  if s->>'kind' = 'weekly' and jsonb_array_length(s->'weekDays') = 0 then raise exception 'weekday_required' using errcode='22023'; end if;
  foreach k in array array['monthDay','intervalMinutes'] loop
    if jsonb_typeof(s->k) <> 'null' then
      if jsonb_typeof(s->k) <> 'number' or (s->>k) !~ '^\d+$' then raise exception 'invalid_schedule_number' using errcode='22023'; end if;
      n := (s->>k)::integer;
      if n < 1 or n > (case when k='monthDay' then 31 else 10080 end) then raise exception 'invalid_schedule_number' using errcode='22023'; end if;
    end if;
  end loop;
  if (s->>'kind'='monthly' and s->>'monthDay' is null) or (s->>'kind'='interval' and s->>'intervalMinutes' is null) then raise exception 'schedule_number_required' using errcode='22023'; end if;
  if jsonb_typeof(s->'windowStart') not in ('string','null') or jsonb_typeof(s->'windowEnd') not in ('string','null') or
    ((s->>'windowStart' is null) <> (s->>'windowEnd' is null)) or (s->>'windowStart' is not null and
    ((s->>'windowStart') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (s->>'windowEnd') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or s->>'windowStart' >= s->>'windowEnd')) then raise exception 'invalid_daily_window' using errcode='22023'; end if;
end $$;
revoke all on function public.zenit_day_validate_reminder_schedule(jsonb) from public, anon;
grant execute on function public.zenit_day_validate_reminder_schedule(jsonb) to authenticated;

-- Canonical recurrence calculation. Monthly dates clamp to the end of each month;
-- interval schedules use the original anchor, never the previous delivery time.
create or replace function public.zenit_day_next_reminder(s jsonb, p_after timestamptz) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare start_at timestamptz; end_at timestamptz; anchor timestamptz; candidate timestamptz;
  zone text; day date; base date; i integer; step_minutes integer; slot text; minute_of_day integer; last_minute integer;
begin
  perform public.zenit_day_validate_reminder_schedule(s);
  if p_after is null or not isfinite(p_after) then raise exception 'invalid_after' using errcode='22023'; end if;
  start_at := (s->>'startAt')::timestamptz; end_at := (s->>'endAt')::timestamptz; zone := s->>'timeZone';
  if end_at <= p_after then return null; end if;
  anchor := greatest(p_after, start_at - interval '1 microsecond');
  step_minutes := (s->>'intervalMinutes')::integer;
  if s->>'kind'='interval' and s->>'windowStart' is null then
    candidate := start_at + greatest(0, floor(extract(epoch from (p_after-start_at))/(step_minutes*60))+1) * (step_minutes * interval '1 minute');
    return case when end_at is null or candidate < end_at then candidate else null end;
  end if;
  base := (anchor at time zone zone)::date;
  for i in 0..370 loop
    day := base+i;
    if s->>'kind'='weekly' and not (s->'weekDays' @> to_jsonb(extract(dow from day)::integer)) then continue; end if;
    if s->>'kind'='monthly' and extract(day from day)::integer <> least((s->>'monthDay')::integer,extract(day from (date_trunc('month',day)+interval '1 month - 1 day'))::integer) then continue; end if;
    if s->>'kind'='interval' then
      minute_of_day := extract(hour from (s->>'windowStart')::time)::integer*60+extract(minute from (s->>'windowStart')::time)::integer;
      last_minute := extract(hour from (s->>'windowEnd')::time)::integer*60+extract(minute from (s->>'windowEnd')::time)::integer;
      while minute_of_day <= last_minute loop
        candidate := (day::timestamp + minute_of_day * interval '1 minute') at time zone zone;
        if candidate > p_after and candidate >= start_at then return case when end_at is null or candidate < end_at then candidate else null end; end if;
        minute_of_day := minute_of_day + step_minutes;
      end loop;
    else
      for slot in select value from jsonb_array_elements_text(s->'times') order by value loop
        candidate := (day+slot::time) at time zone zone;
        if candidate > p_after and candidate >= start_at then return case when end_at is null or candidate < end_at then candidate else null end; end if;
      end loop;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.zenit_day_next_reminder(jsonb,timestamptz) from public, anon;
grant execute on function public.zenit_day_next_reminder(jsonb,timestamptz) to authenticated;

create table public.zenit_day_reminders (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 500),
  subject_id uuid,
  enabled boolean not null,
  deleted boolean not null default false,
  schedule jsonb not null,
  revision integer not null check(revision > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key(user_id,id),
  foreign key(user_id,subject_id) references public.zenit_day_subjects(user_id,id),
  check(not deleted or not enabled)
);
create index zenit_day_reminders_subject on public.zenit_day_reminders(user_id,subject_id) where subject_id is not null;
alter table public.zenit_day_reminders enable row level security;
revoke all on public.zenit_day_reminders from public,anon,authenticated;
grant select on public.zenit_day_reminders to authenticated;
create policy reminders_owned_read on public.zenit_day_reminders for select to authenticated using ((select auth.uid())=user_id and
  (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id') is null);
create trigger reminders_oauth_read_only before insert or update or delete on public.zenit_day_reminders for each row execute function zenit_day_private.reject_oauth_write();

-- Keep privileged implementation out of the exposed schema. The public RPC is
-- an invoker wrapper; direct sessions only until dedicated Hub consent is added.
create function zenit_day_private.save_reminder(p_operation_id uuid,p_reminder_id uuid,p_expected_revision integer,p_reminder jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); old_row public.zenit_day_reminders%rowtype; new_row public.zenit_day_reminders%rowtype;
  receipt zenit_day_private.operation_receipts%rowtype; request jsonb; response jsonb; k text; now_at timestamptz := clock_timestamp();
begin
  if uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id') is not null then raise exception 'oauth_read_only' using errcode='42501'; end if;
  if p_operation_id is null or p_reminder_id is null or p_expected_revision is null or p_expected_revision < 0 then raise exception 'invalid_operation' using errcode='22023'; end if;
  if jsonb_typeof(p_reminder) is distinct from 'object' or not (p_reminder ?& array['title','subject_id','enabled','deleted','schedule']) then raise exception 'invalid_reminder' using errcode='22023'; end if;
  for k in select jsonb_object_keys(p_reminder) loop
    if not k=any(array['title','subject_id','enabled','deleted','schedule']) then raise exception 'unknown_reminder_field' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(p_reminder->'title') <> 'string' or jsonb_typeof(p_reminder->'enabled') <> 'boolean' or jsonb_typeof(p_reminder->'deleted') <> 'boolean' or jsonb_typeof(p_reminder->'subject_id') not in ('string','null') then raise exception 'invalid_reminder_types' using errcode='22023'; end if;
  perform public.zenit_day_validate_reminder_schedule(p_reminder->'schedule');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));
  request := jsonb_build_object('kind','reminder','id',p_reminder_id,'revision',p_expected_revision,'doc',p_reminder);
  select * into receipt from zenit_day_private.operation_receipts where user_id=uid and operation_id=p_operation_id;
  if found then
    if receipt.request <> request then raise exception 'operation_id_reused_with_different_content' using errcode='22023'; end if;
    return receipt.response;
  end if;
  select * into old_row from public.zenit_day_reminders where user_id=uid and id=p_reminder_id for update;
  if coalesce(old_row.revision,0) <> p_expected_revision then return jsonb_build_object('result','conflict','reminder',case when old_row.id is null then null else to_jsonb(old_row) end); end if;
  new_row := row(uid,p_reminder_id,btrim(p_reminder->>'title'),(p_reminder->>'subject_id')::uuid,(p_reminder->>'enabled')::boolean,(p_reminder->>'deleted')::boolean,p_reminder->'schedule',p_expected_revision+1,coalesce(old_row.created_at,now_at),now_at);
  insert into public.zenit_day_reminders select (new_row).* on conflict(user_id,id) do update set
    title=excluded.title,subject_id=excluded.subject_id,enabled=excluded.enabled,deleted=excluded.deleted,schedule=excluded.schedule,revision=excluded.revision,updated_at=excluded.updated_at;
  response := jsonb_build_object('result','saved','reminder',to_jsonb(new_row));
  insert into zenit_day_private.operation_receipts(user_id,operation_id,request,response) values(uid,p_operation_id,request,response);
  return response;
end $$;
revoke all on function zenit_day_private.save_reminder(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant usage on schema zenit_day_private to authenticated;
grant execute on function zenit_day_private.save_reminder(uuid,uuid,integer,jsonb) to authenticated;
create function public.zenit_day_save_reminder(p_operation_id uuid,p_reminder_id uuid,p_expected_revision integer,p_reminder jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select zenit_day_private.save_reminder(p_operation_id,p_reminder_id,p_expected_revision,p_reminder) $$;
revoke all on function public.zenit_day_save_reminder(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.zenit_day_save_reminder(uuid,uuid,integer,jsonb) to authenticated;

create or replace function public.zenit_day_connection_check() returns jsonb
language plpgsql security invoker set search_path = '' as $$ begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='28000'; end if;
  return jsonb_build_object('application','zenit-day','schema_version',1,'schema_revision',6,'daily_goals',true,'checklist',true,'groups',true,'priorities',true,'reminders',true,'authenticated',true);
end $$;
revoke all on function public.zenit_day_connection_check() from public,anon;
grant execute on function public.zenit_day_connection_check() to authenticated;
notify pgrst, 'reload schema';
commit;
