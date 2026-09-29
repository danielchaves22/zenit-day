-- Zenit Day 0.1.1 | Metas diarias | Atualizacao aditiva e transacional
-- Aplicar no projeto existente. Preserva assuntos, historico, contas e permissoes.
begin;
alter table public.zenit_day_subjects
  add column if not exists daily_goal text,
  add column if not exists daily_goal_on date;
do $$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.zenit_day_subjects'::regclass and conname='zenit_day_daily_goal_valid') then
    alter table public.zenit_day_subjects add constraint zenit_day_daily_goal_valid check (
      (daily_goal is null and daily_goal_on is null) or
      (daily_goal is not null and daily_goal_on is not null and daily_goal in ('start','advance','finish','follow_up','not_today'))
    );
  end if;
end $$;
create or replace function public.zenit_day_save_subject(
  p_operation_id uuid,
  p_subject_id uuid,
  p_expected_revision integer,
  p_subject jsonb,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.zenit_day_subjects%rowtype;
  v_new public.zenit_day_subjects%rowtype;
  v_receipt zenit_day_private.operation_receipts%rowtype;
  v_request jsonb;
  v_response jsonb;
  v_exists boolean;
  v_field text;
  v_note text := nullif(btrim(p_note),'');
  v_now timestamptz := clock_timestamp();
  v_kind text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_operation_id is null or p_subject_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid_operation' using errcode = '22023';
  end if;
  if jsonb_typeof(p_subject) is distinct from 'object' then
    raise exception 'subject_must_be_an_object' using errcode = '22023';
  end if;
  if not (p_subject ?& array['title','status','responsible_is_self','archived']) then
    raise exception 'required_fields_missing' using errcode = '22023';
  end if;
  for v_field in select jsonb_object_keys(p_subject) loop
    if not (v_field = any(array['title','responsible_is_self','responsible_name','project','status','situation','next_action','review_on','due_on','archived','daily_goal','daily_goal_on'])) then
      raise exception 'unknown_subject_field' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_subject->'title') is distinct from 'string'
     or jsonb_typeof(p_subject->'status') is distinct from 'string'
     or jsonb_typeof(p_subject->'responsible_is_self') is distinct from 'boolean'
     or jsonb_typeof(p_subject->'archived') is distinct from 'boolean' then
    raise exception 'invalid_field_type' using errcode = '22023';
  end if;
  foreach v_field in array array['responsible_name','project','situation','next_action','review_on','due_on','daily_goal','daily_goal_on'] loop
    if p_subject ? v_field and jsonb_typeof(p_subject->v_field) not in ('string','null') then
      raise exception 'invalid_field_type' using errcode = '22023';
    end if;
  end loop;
  foreach v_field in array array['review_on','due_on','daily_goal_on'] loop
    if nullif(p_subject->>v_field,'') is not null and (p_subject->>v_field) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'date_must_be_yyyy_mm_dd' using errcode = '22023';
    end if;
  end loop;
  if (p_subject ? 'daily_goal') <> (p_subject ? 'daily_goal_on') then
    raise exception 'daily_goal_and_date_required_together' using errcode='22023';
  end if;
  if length(v_note) > 8000 then raise exception 'note_too_long' using errcode = '22023'; end if;

  -- Serializa as pequenas alterações da mesma conta, inclusive reenvios.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,0));
  v_request := jsonb_build_object('id',p_subject_id,'revision',p_expected_revision,'subject',p_subject,'note',v_note);
  select * into v_receipt from zenit_day_private.operation_receipts
    where user_id=v_uid and operation_id=p_operation_id;
  if found then
    if v_receipt.request <> v_request then raise exception 'operation_id_reused_with_different_content' using errcode='22023'; end if;
    return v_receipt.response;
  end if;

  select * into v_old from public.zenit_day_subjects where user_id=v_uid and id=p_subject_id for update;
  v_exists := found;
  if (v_exists and v_old.revision <> p_expected_revision) or (not v_exists and p_expected_revision <> 0) then
    return jsonb_build_object('result','conflict','subject',case when v_exists then to_jsonb(v_old) else null end);
  end if;

  v_new.user_id := v_uid;
  v_new.id := p_subject_id;
  v_new.title := btrim(p_subject->>'title');
  v_new.responsible_is_self := (p_subject->>'responsible_is_self')::boolean;
  v_new.responsible_name := nullif(btrim(p_subject->>'responsible_name'),'');
  v_new.project := nullif(btrim(p_subject->>'project'),'');
  v_new.status := p_subject->>'status';
  v_new.situation := coalesce(p_subject->>'situation','');
  v_new.next_action := coalesce(p_subject->>'next_action','');
  v_new.review_on := nullif(p_subject->>'review_on','')::date;
  v_new.due_on := nullif(p_subject->>'due_on','')::date;
  -- Older clients omit these fields. Preserve the existing goal in that case.
  v_new.daily_goal := case when p_subject ? 'daily_goal' then p_subject->>'daily_goal' else v_old.daily_goal end;
  v_new.daily_goal_on := case when p_subject ? 'daily_goal_on' then (p_subject->>'daily_goal_on')::date else v_old.daily_goal_on end;
  v_new.archived := (p_subject->>'archived')::boolean;
  v_new.revision := p_expected_revision+1;
  v_new.created_at := case when v_exists then v_old.created_at else v_now end;
  v_new.updated_at := v_now;
  v_new.completed_at := case when v_new.status='done' then coalesce(v_old.completed_at,v_now) else null end;

  insert into public.zenit_day_subjects select (v_new).*
    on conflict (user_id,id) do update set
      title=excluded.title, responsible_is_self=excluded.responsible_is_self,
      responsible_name=excluded.responsible_name, project=excluded.project,
      status=excluded.status, situation=excluded.situation, next_action=excluded.next_action,
      review_on=excluded.review_on, due_on=excluded.due_on, archived=excluded.archived,
      daily_goal=excluded.daily_goal, daily_goal_on=excluded.daily_goal_on,
      revision=excluded.revision, updated_at=excluded.updated_at, completed_at=excluded.completed_at;
  v_kind := case
    when not v_exists then 'created'
    when v_new.archived and not v_old.archived then 'archived'
    when not v_new.archived and v_old.archived then 'restored'
    when v_new.status='done' and v_old.status<>'done' then 'completed'
    when v_new.status<>'done' and v_old.status='done' then 'reopened'
    when v_note is not null then 'progress' else 'updated' end;
  insert into public.zenit_day_updates(user_id,id,subject_id,subject_revision,kind,note,created_at)
    values(v_uid,p_operation_id,p_subject_id,v_new.revision,v_kind,v_note,v_now);
  v_response := jsonb_build_object('result','saved','subject',to_jsonb(v_new));
  insert into zenit_day_private.operation_receipts(user_id,operation_id,request,response)
    values(v_uid,p_operation_id,v_request,v_response);
  return v_response;
end;
$$;


create or replace function public.zenit_day_connection_check() returns jsonb
language plpgsql security invoker set search_path = ''
as $$ begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='28000'; end if;
  -- Keep schema_version=1 so installed 0.1.0 clients continue to work.
  return jsonb_build_object('application','zenit-day','schema_version',1,'schema_revision',2,'daily_goals',true,'authenticated',true);
end $$;
revoke all on function public.zenit_day_save_subject(uuid,uuid,integer,jsonb,text) from public, anon;
revoke all on function public.zenit_day_connection_check() from public, anon;
grant execute on function public.zenit_day_save_subject(uuid,uuid,integer,jsonb,text) to authenticated;
grant execute on function public.zenit_day_connection_check() to authenticated;
notify pgrst, 'reload schema';
commit;
