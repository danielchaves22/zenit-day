-- Somente leitura. Executar no SQL Editor após a migração.
-- Todas as linhas devem retornar configurado = true.
select 'Tabela de assuntos com RLS' as verificacao,
  coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.zenit_day_subjects')),false) as configurado
union all select 'Tabela de andamentos com RLS',
  coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.zenit_day_updates')),false)
union all select 'Leitura autenticada de assuntos',
  coalesce(has_table_privilege('authenticated',to_regclass('public.zenit_day_subjects'),'SELECT'),false)
union all select 'Leitura autenticada de andamentos',
  coalesce(has_table_privilege('authenticated',to_regclass('public.zenit_day_updates'),'SELECT'),false)
union all select 'Sem leitura pública de assuntos',
  not coalesce(has_table_privilege('anon',to_regclass('public.zenit_day_subjects'),'SELECT'),true)
union all select 'Sem escrita direta de assuntos',
  not coalesce(has_table_privilege('authenticated',to_regclass('public.zenit_day_subjects'),'INSERT,UPDATE,DELETE,TRUNCATE'),true)
union all select 'Sem leitura pública de andamentos',
  not coalesce(has_table_privilege('anon',to_regclass('public.zenit_day_updates'),'SELECT'),true)
union all select 'Sem escrita direta de andamentos',
  not coalesce(has_table_privilege('authenticated',to_regclass('public.zenit_day_updates'),'INSERT,UPDATE,DELETE,TRUNCATE'),true)
union all select 'Política de assuntos por usuário',
  exists(select 1 from pg_policies where schemaname='public' and tablename='zenit_day_subjects' and policyname='subjects_owned_read')
union all select 'Política de andamentos por usuário',
  exists(select 1 from pg_policies where schemaname='public' and tablename='zenit_day_updates' and policyname='updates_owned_read')
union all select 'RPC de conexão autenticada',
  coalesce(has_function_privilege('authenticated',to_regprocedure('public.zenit_day_connection_check()'),'EXECUTE'),false)
union all select 'RPC de gravação autenticada',
  coalesce(has_function_privilege('authenticated',to_regprocedure('public.zenit_day_save_subject(uuid,uuid,integer,jsonb,text)'),'EXECUTE'),false)
union all select 'RPC de gravação bloqueada para anônimos',
  not coalesce(has_function_privilege('anon',to_regprocedure('public.zenit_day_save_subject(uuid,uuid,integer,jsonb,text)'),'EXECUTE'),true)
union all select 'Recibos internos sem acesso pelo aplicativo',
  not coalesce(has_schema_privilege('authenticated','zenit_day_private','USAGE'),true);

