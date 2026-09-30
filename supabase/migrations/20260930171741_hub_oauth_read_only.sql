-- Version aligned with the migration applied to the hosted Day project.
begin;

-- OAuth clients are read-only in this release. Enforce at the table boundary,
-- including writes through the existing SECURITY DEFINER synchronization RPC.
create or replace function zenit_day_private.reject_oauth_write() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'client_id') is not null then
    raise exception 'oauth_read_only' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function zenit_day_private.reject_oauth_write() from public, anon, authenticated;

drop trigger if exists subjects_oauth_read_only on public.zenit_day_subjects;
create trigger subjects_oauth_read_only before insert or update or delete on public.zenit_day_subjects
for each row execute function zenit_day_private.reject_oauth_write();
drop trigger if exists updates_oauth_read_only on public.zenit_day_updates;
create trigger updates_oauth_read_only before insert or update or delete on public.zenit_day_updates
for each row execute function zenit_day_private.reject_oauth_write();

create or replace function public.zenit_day_hub_connection_check() returns jsonb
language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'client_id') is null then
    raise exception 'oauth_required' using errcode = '42501';
  end if;
  return jsonb_build_object('application', 'zenit-day', 'hub_read_only', true);
end;
$$;
revoke all on function public.zenit_day_hub_connection_check() from public, anon;
grant execute on function public.zenit_day_hub_connection_check() to authenticated;
notify pgrst, 'reload schema';
commit;
