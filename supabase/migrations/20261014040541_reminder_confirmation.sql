begin;

alter table public.zenit_day_reminders
  add column requires_confirmation boolean not null default false,
  add column repeat_minutes integer not null default 5 check(repeat_minutes between 1 and 10080),
  add column respect_quiet_hours boolean not null default true;

-- Extend the existing idempotent writer without discarding options when old
-- desktop/mobile clients send documents that predate these fields.
create or replace function zenit_day_private.save_reminder(p_operation_id uuid,p_reminder_id uuid,p_expected_revision integer,p_reminder jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); old_row public.zenit_day_reminders%rowtype; new_row public.zenit_day_reminders%rowtype;
  receipt zenit_day_private.operation_receipts%rowtype; request jsonb; response jsonb; k text; now_at timestamptz := clock_timestamp();
begin
  if uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id') is not null and not zenit_day_private.reminders_allowed() then raise exception 'reminder_consent_required' using errcode='42501'; end if;
  if p_operation_id is null or p_reminder_id is null or p_expected_revision is null or p_expected_revision < 0 then raise exception 'invalid_operation' using errcode='22023'; end if;
  if jsonb_typeof(p_reminder) is distinct from 'object' or not (p_reminder ?& array['title','subject_id','enabled','deleted','schedule']) then raise exception 'invalid_reminder' using errcode='22023'; end if;
  for k in select jsonb_object_keys(p_reminder) loop
    if not k=any(array['title','subject_id','enabled','deleted','schedule','requires_confirmation','repeat_minutes','respect_quiet_hours']) then raise exception 'unknown_reminder_field' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(p_reminder->'title') <> 'string' or jsonb_typeof(p_reminder->'enabled') <> 'boolean' or jsonb_typeof(p_reminder->'deleted') <> 'boolean' or jsonb_typeof(p_reminder->'subject_id') not in ('string','null') then raise exception 'invalid_reminder_types' using errcode='22023'; end if;
  foreach k in array array['requires_confirmation','respect_quiet_hours'] loop
    if p_reminder ? k and jsonb_typeof(p_reminder->k) is distinct from 'boolean' then raise exception 'invalid_reminder_options' using errcode='22023'; end if;
  end loop;
  if p_reminder ? 'repeat_minutes' and (jsonb_typeof(p_reminder->'repeat_minutes') is distinct from 'number' or (p_reminder->>'repeat_minutes') !~ '^[0-9]+$' or (p_reminder->>'repeat_minutes')::numeric not between 1 and 10080) then raise exception 'invalid_repeat_minutes' using errcode='22023'; end if;
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
  insert into public.zenit_day_reminders(user_id,id,title,subject_id,enabled,deleted,schedule,revision,created_at,updated_at,requires_confirmation,repeat_minutes,respect_quiet_hours)
  values(uid,p_reminder_id,btrim(p_reminder->>'title'),(p_reminder->>'subject_id')::uuid,(p_reminder->>'enabled')::boolean,(p_reminder->>'deleted')::boolean,p_reminder->'schedule',p_expected_revision+1,coalesce(old_row.created_at,now_at),now_at,
    coalesce((p_reminder->>'requires_confirmation')::boolean,old_row.requires_confirmation,false),
    coalesce((p_reminder->>'repeat_minutes')::integer,old_row.repeat_minutes,5),
    coalesce((p_reminder->>'respect_quiet_hours')::boolean,old_row.respect_quiet_hours,true))
  on conflict(user_id,id) do update set title=excluded.title,subject_id=excluded.subject_id,enabled=excluded.enabled,deleted=excluded.deleted,
    schedule=excluded.schedule,revision=excluded.revision,updated_at=excluded.updated_at,requires_confirmation=excluded.requires_confirmation,
    repeat_minutes=excluded.repeat_minutes,respect_quiet_hours=excluded.respect_quiet_hours returning * into new_row;
  response := jsonb_build_object('result','saved','reminder',to_jsonb(new_row));
  insert into zenit_day_private.operation_receipts(user_id,operation_id,request,response) values(uid,p_operation_id,request,response);
  return response;
end $$;

create table public.zenit_day_reminder_completions (
  user_id uuid not null, reminder_id uuid not null, revision integer not null,
  due_at timestamptz not null, completed_at timestamptz not null default clock_timestamp(),
  primary key(user_id,reminder_id,revision,due_at),
  foreign key(user_id,reminder_id) references public.zenit_day_reminders(user_id,id) on delete cascade
);
alter table public.zenit_day_reminder_completions enable row level security;
revoke all on public.zenit_day_reminder_completions from public,anon,authenticated;
grant select on public.zenit_day_reminder_completions to authenticated;
create policy reminder_completions_owned_read on public.zenit_day_reminder_completions for select to authenticated using (
  (select auth.uid())=user_id and ((coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id') is null
    or (select zenit_day_private.reminders_allowed()))
);

create function public.zenit_day_reminder_occurrence_state(p_reminder_id uuid,p_revision integer,p_due_at timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.zenit_day_reminders%rowtype; next_at timestamptz; completed timestamptz; until_at timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id') is not null and not zenit_day_private.reminders_allowed() then raise exception 'reminder_consent_required' using errcode='42501'; end if;
  select * into r from public.zenit_day_reminders where user_id=auth.uid() and id=p_reminder_id;
  if not found or r.revision is distinct from p_revision or not r.enabled or r.deleted then return jsonb_build_object('state','obsolete'); end if;
  if p_due_at is null or not isfinite(p_due_at) or p_due_at>clock_timestamp() or p_due_at<r.updated_at-interval '1 millisecond'
    or public.zenit_day_next_reminder(r.schedule,p_due_at-interval '1 millisecond') is distinct from p_due_at then return jsonb_build_object('state','obsolete'); end if;
  next_at := public.zenit_day_next_reminder(r.schedule,p_due_at);
  until_at := least(next_at,(r.schedule->>'endAt')::timestamptz);
  if until_at <= clock_timestamp() then return jsonb_build_object('state','obsolete'); end if;
  select completed_at into completed from public.zenit_day_reminder_completions where user_id=auth.uid() and reminder_id=r.id and revision=p_revision and due_at=p_due_at;
  return jsonb_build_object('state',case when completed is null then 'pending' else 'completed' end,'completedAt',completed,'validUntil',until_at,'reminder',to_jsonb(r));
end $$;
revoke all on function public.zenit_day_reminder_occurrence_state(uuid,integer,timestamptz) from public,anon;
grant execute on function public.zenit_day_reminder_occurrence_state(uuid,integer,timestamptz) to authenticated;

create function zenit_day_private.complete_reminder(p_reminder_id uuid,p_revision integer,p_due_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id') is not null and not zenit_day_private.reminders_allowed() then raise exception 'reminder_consent_required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));
  result := public.zenit_day_reminder_occurrence_state(p_reminder_id,p_revision,p_due_at);
  if result->>'state' <> 'pending' then return result; end if;
  if not (result->'reminder'->>'requires_confirmation')::boolean then return jsonb_build_object('state','obsolete'); end if;
  insert into public.zenit_day_reminder_completions(user_id,reminder_id,revision,due_at) values(uid,p_reminder_id,p_revision,p_due_at) on conflict do nothing;
  return jsonb_build_object('state','completed');
end $$;
revoke all on function zenit_day_private.complete_reminder(uuid,integer,timestamptz) from public,anon;
grant execute on function zenit_day_private.complete_reminder(uuid,integer,timestamptz) to authenticated;
create function public.zenit_day_complete_reminder(p_reminder_id uuid,p_revision integer,p_due_at timestamptz) returns jsonb
language sql security invoker set search_path='' as $$ select zenit_day_private.complete_reminder(p_reminder_id,p_revision,p_due_at) $$;
revoke all on function public.zenit_day_complete_reminder(uuid,integer,timestamptz) from public,anon;
grant execute on function public.zenit_day_complete_reminder(uuid,integer,timestamptz) to authenticated;

notify pgrst,'reload schema';
commit;
