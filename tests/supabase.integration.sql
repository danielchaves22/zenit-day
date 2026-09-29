-- Executado somente no PostgreSQL descartável criado pelo teste local.
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$
declare
  doc jsonb := '{"title":"Validar integração","status":"doing","responsible_is_self":false,"responsible_name":"Marina","archived":false,"review_on":"2026-09-25","due_on":"2026-09-28"}';
  sid uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  op uuid := '00000000-0000-4000-8000-000000000001';
  res jsonb;
begin
  res := public.zenit_day_connection_check();
  if res->>'schema_version'<>'1' then raise exception 'wrong version'; end if;
  res := public.zenit_day_save_subject(op,sid,0,doc);
  if res->>'result'<>'saved' or res#>>'{subject,revision}'<>'1' then raise exception 'create failed'; end if;
  res := public.zenit_day_save_subject(op,sid,0,doc);
  if res#>>'{subject,revision}'<>'1' or (select count(*) from public.zenit_day_updates)<>1 then raise exception 'retry duplicated data'; end if;
  begin
    perform public.zenit_day_save_subject(op,sid,0,doc||'{"title":"wrong reuse"}');
    raise exception 'operation reuse accepted';
  exception when sqlstate '22023' then null; end;

  doc := doc||'{"review_on":"2026-09-26","situation":"Validação prevista para segunda.","next_action":"Verificar resultado"}';
  res := public.zenit_day_save_subject('00000000-0000-4000-8000-000000000002',sid,1,doc,'Conversei com Marina.');
  if res#>>'{subject,status}'<>'doing' or res#>>'{subject,due_on}'<>'2026-09-28' then raise exception 'follow-up changed status/deadline'; end if;
  res := public.zenit_day_save_subject('00000000-0000-4000-8000-000000000003',sid,1,doc||'{"title":"stale change"}');
  if res->>'result'<>'conflict' or res#>>'{subject,revision}'<>'2' then raise exception 'stale revision accepted'; end if;
  if (select title from public.zenit_day_subjects where id=sid)<>'Validar integração' then raise exception 'conflict overwrote subject'; end if;
  if (select count(*) from public.zenit_day_updates)<>2 then raise exception 'conflict wrote history'; end if;
  res := public.zenit_day_save_subject('00000000-0000-4000-8000-000000000004',sid,2,doc||'{"status":"done"}');
  if res#>>'{subject,completed_at}' is null then raise exception 'completion missing timestamp'; end if;
  res := public.zenit_day_save_subject('00000000-0000-4000-8000-000000000005',sid,3,doc);
  if res#>>'{subject,completed_at}' is not null then raise exception 'reopen failed'; end if;
  begin
    insert into public.zenit_day_subjects(user_id,id,title,status,revision,created_at,updated_at)
      values('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'direct','todo',1,now(),now());
    raise exception 'direct insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.zenit_day_subjects set title='bypass';
    raise exception 'direct update allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.zenit_day_save_subject(gen_random_uuid(),sid,4,doc||'{"user_id":"22222222-2222-4222-8222-222222222222"}');
    raise exception 'owner injection accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.zenit_day_save_subject(gen_random_uuid(),sid,4,doc||'{"due_on":"2026-02-30"}');
    raise exception 'impossible date accepted';
  exception when datetime_field_overflow then null; end;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
declare res jsonb;
begin
  if (select count(*) from public.zenit_day_subjects)<>0 or (select count(*) from public.zenit_day_updates)<>0 then raise exception 'RLS exposed another account'; end if;
  res := public.zenit_day_save_subject(gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',4,'{"title":"Other user","status":"todo","responsible_is_self":true,"archived":false}');
  if res->>'result'<>'conflict' or res->'subject'<>'null'::jsonb then raise exception 'conflict leaked another account'; end if;
  res := public.zenit_day_save_subject(gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,'{"title":"Other user","status":"todo","responsible_is_self":true,"archived":false}');
  if res->>'result'<>'saved' then raise exception 'second user cannot create'; end if;
end;
$$;
reset role;

set role anon;
set request.jwt.claim.sub='';
do $$
begin
  begin
    perform * from public.zenit_day_subjects;
    raise exception 'anonymous read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.zenit_day_connection_check();
    raise exception 'anonymous function execution allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select 'RLS, idempotência, conflitos, histórico e datas validados.' as resultado;

