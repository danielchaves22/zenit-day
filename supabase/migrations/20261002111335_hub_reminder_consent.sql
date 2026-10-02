begin;

-- Explicit consent is separate from the existing read-only subjects grant.
create table zenit_day_private.reminder_clients (client_id text primary key);
-- Register the existing OAuth client separately for each environment, after migration.
create table zenit_day_private.reminder_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references zenit_day_private.reminder_clients(client_id),
  enabled boolean not null, changed_at timestamptz not null default now(),
  primary key(user_id,client_id)
);
alter table zenit_day_private.reminder_clients enable row level security;
alter table zenit_day_private.reminder_consents enable row level security;
revoke all on zenit_day_private.reminder_clients,zenit_day_private.reminder_consents from public,anon,authenticated;

create function zenit_day_private.reminders_allowed() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from zenit_day_private.reminder_consents c where c.user_id=auth.uid() and c.enabled
    and c.client_id=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id'
  )
$$;
revoke all on function zenit_day_private.reminders_allowed() from public,anon;
grant execute on function zenit_day_private.reminders_allowed() to authenticated;

create function zenit_day_private.set_reminder_consent(p_client_id text,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id') is not null then
    raise exception 'direct_session_required' using errcode='42501';
  end if;
  if p_enabled is null or not exists(select 1 from zenit_day_private.reminder_clients where client_id=p_client_id) then
    raise exception 'unrecognized_client' using errcode='22023';
  end if;
  insert into zenit_day_private.reminder_consents values(auth.uid(),p_client_id,p_enabled,clock_timestamp())
    on conflict(user_id,client_id) do update set enabled=excluded.enabled,changed_at=excluded.changed_at;
  return jsonb_build_object('enabled',p_enabled);
end $$;
revoke all on function zenit_day_private.set_reminder_consent(text,boolean) from public,anon;
grant execute on function zenit_day_private.set_reminder_consent(text,boolean) to authenticated;
create function public.zenit_day_set_reminder_consent(p_client_id text,p_enabled boolean) returns jsonb
language sql security invoker set search_path='' as $$ select zenit_day_private.set_reminder_consent(p_client_id,p_enabled) $$;
revoke all on function public.zenit_day_set_reminder_consent(text,boolean) from public,anon;
grant execute on function public.zenit_day_set_reminder_consent(text,boolean) to authenticated;

create function public.zenit_day_hub_reminders_check() returns jsonb
language sql security invoker set search_path='' as $$
  select jsonb_build_object('authorized',zenit_day_private.reminders_allowed(),'version',1)
$$;
revoke all on function public.zenit_day_hub_reminders_check() from public,anon;
grant execute on function public.zenit_day_hub_reminders_check() to authenticated;

drop policy reminders_owned_read on public.zenit_day_reminders;
create policy reminders_owned_read on public.zenit_day_reminders for select to authenticated using (
  (select auth.uid())=user_id and ((coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id') is null
    or (select zenit_day_private.reminders_allowed()))
);
create function zenit_day_private.guard_reminder_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id') is not null
    and not zenit_day_private.reminders_allowed() then raise exception 'reminder_consent_required' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function zenit_day_private.guard_reminder_write() from public,anon,authenticated;
drop trigger reminders_oauth_read_only on public.zenit_day_reminders;
create trigger reminders_authorized_write before insert or update or delete on public.zenit_day_reminders
for each row execute function zenit_day_private.guard_reminder_write();

-- Preserve the validated idempotent implementation, changing only its OAuth guard.
do $$
declare definition text; old_guard text := 'if (coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb->>''client_id'') is not null then raise exception ''oauth_read_only'' using errcode=''42501''; end if;';
begin
  definition := pg_get_functiondef('zenit_day_private.save_reminder(uuid,uuid,integer,jsonb)'::regprocedure);
  if position(old_guard in definition)=0 then raise exception 'unexpected_reminder_implementation'; end if;
  execute replace(definition,old_guard,'if (coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb->>''client_id'') is not null and not zenit_day_private.reminders_allowed() then raise exception ''reminder_consent_required'' using errcode=''42501''; end if;');
end $$;

-- The Hub polls a bounded interval. Data access remains invoker + RLS.
create function public.zenit_day_reminder_occurrences(p_after timestamptz,p_until timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.zenit_day_reminders%rowtype; due_at timestamptz; items jsonb := '[]';
begin
  if not zenit_day_private.reminders_allowed() then raise exception 'reminder_consent_required' using errcode='42501'; end if;
  if p_after is null or p_until is null or not isfinite(p_after) or not isfinite(p_until) or p_until<p_after or p_until-p_after>interval '5 minutes' then
    raise exception 'invalid_window' using errcode='22023';
  end if;
  for r in select * from public.zenit_day_reminders where enabled and not deleted order by id loop
    due_at := public.zenit_day_next_reminder(r.schedule,greatest(p_after,r.updated_at-interval '1 millisecond'));
    while due_at<=p_until loop
      if jsonb_array_length(items)>=500 then return jsonb_build_object('items',items,'truncated',true); end if;
      items := items || jsonb_build_array(jsonb_build_object('id',r.id,'revision',r.revision,'title',r.title,'dueAt',due_at,'timeZone',r.schedule->>'timeZone'));
      due_at := public.zenit_day_next_reminder(r.schedule,due_at);
    end loop;
  end loop;
  return jsonb_build_object('items',items,'truncated',false);
end $$;
revoke all on function public.zenit_day_reminder_occurrences(timestamptz,timestamptz) from public,anon;
grant execute on function public.zenit_day_reminder_occurrences(timestamptz,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
