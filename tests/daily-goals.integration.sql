-- Runs after the original integration suite and after applying the additive migration twice.
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$
declare
  sid uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  original_doc jsonb := '{"title":"Validar integração","status":"doing","responsible_is_self":false,"responsible_name":"Marina","archived":false,"review_on":"2026-09-25","due_on":"2026-09-28"}';
  doc jsonb;
  before_row public.zenit_day_subjects%rowtype;
  res jsonb;
  revision integer;
  goal text;
  op uuid;
begin
  if public.zenit_day_connection_check()->>'daily_goals' <> 'true' then raise exception 'goal capability missing'; end if;
  select * into before_row from public.zenit_day_subjects where id=sid;
  revision := before_row.revision;
  -- A receipt created before the upgrade must remain exactly replayable.
  res := public.zenit_day_save_subject('00000000-0000-4000-8000-000000000001',sid,0,original_doc);
  if res#>>'{subject,revision}' <> '1' then raise exception 'legacy replay broken'; end if;
  doc := to_jsonb(before_row) - array['user_id','id','revision','created_at','updated_at','completed_at','daily_goal','daily_goal_on'];
  foreach goal in array array['start','advance','finish','follow_up','not_today'] loop
    op := gen_random_uuid();
    res := public.zenit_day_save_subject(op,sid,revision,doc||jsonb_build_object('daily_goal',goal,'daily_goal_on','2026-09-28'), 'Meta do dia');
    if res->>'result'<>'saved' or res#>>'{subject,daily_goal}'<>goal or res#>>'{subject,daily_goal_on}'<>'2026-09-28' then raise exception 'goal not saved'; end if;
    if res#>>'{subject,status}'<>before_row.status or res#>>'{subject,due_on}'<>before_row.due_on::text or res#>>'{subject,review_on}'<>before_row.review_on::text or res#>>'{subject,next_action}'<>before_row.next_action then raise exception 'goal changed other subject fields'; end if;
    revision := revision+1;
    res := public.zenit_day_save_subject(op,sid,revision-1,doc||jsonb_build_object('daily_goal',goal,'daily_goal_on','2026-09-28'),'Meta do dia');
    if (res#>>'{subject,revision}')::integer<>revision then raise exception 'goal replay failed'; end if;
  end loop;
  -- 0.1.0 clients can edit ordinary fields without knowing about goals.
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,revision,doc||'{"title":"Edição no cliente antigo"}');
  revision := revision+1;
  if res#>>'{subject,daily_goal}'<>'not_today' or res#>>'{subject,daily_goal_on}'<>'2026-09-28' then raise exception 'old client erased goal'; end if;
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,revision-1,doc||'{"daily_goal":"finish","daily_goal_on":"2026-09-28"}');
  if res->>'result'<>'conflict' or res#>>'{subject,daily_goal}'<>'not_today' then raise exception 'goal conflict lost remote version'; end if;
  begin
    perform public.zenit_day_save_subject(gen_random_uuid(),sid,revision,doc||'{"daily_goal":"finish"}');
    raise exception 'unpaired goal accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.zenit_day_save_subject(gen_random_uuid(),sid,revision,doc||'{"daily_goal":"bad","daily_goal_on":"2026-09-28"}');
    raise exception 'invalid goal accepted';
  exception when check_violation then null; end;
  begin
    perform public.zenit_day_save_subject(gen_random_uuid(),sid,revision,doc||'{"daily_goal":"finish","daily_goal_on":null}');
    raise exception 'undated goal accepted';
  exception when check_violation then null; end;
  begin
    perform public.zenit_day_save_subject(gen_random_uuid(),sid,revision,doc||'{"daily_goal":"finish","daily_goal_on":"2026-02-30"}');
    raise exception 'invalid goal date accepted';
  exception when datetime_field_overflow then null; end;
  res := public.zenit_day_save_subject(gen_random_uuid(),sid,revision,doc||'{"daily_goal":null,"daily_goal_on":null}');
  if res#>>'{subject,daily_goal}' is not null or res#>>'{subject,daily_goal_on}' is not null then raise exception 'goal not cleared'; end if;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$ begin
  if exists(select 1 from public.zenit_day_subjects where user_id <> auth.uid()) then raise exception 'goal migration changed isolation'; end if;
end $$;
reset role;
select 'Metas: migração repetível, legado, idempotência, conflitos, datas e isolamento validados.' as resultado;
