# Conectar o Zenit Day ao Zenit Hub

O Hub consulta assuntos via Data API usando OAuth e RLS do usuário. Cada aplicação pode usar uma conta diferente. Não há cópia do banco do Day no Hub.

## Preparação

1. Aplique `supabase/migrations/20260930171741_hub_oauth_read_only.sql` após as migrações existentes. A migração acrescenta uma verificação de capacidade e bloqueia escritas com tokens OAuth de terceiros nas tabelas de assuntos/histórico, inclusive através da função de sincronização existente. Sessões normais dos aplicativos continuam podendo gravar. Esta versão trata **todos os clientes OAuth como somente leitura**.
2. Habilite OAuth Server no projeto Supabase e mantenha registro dinâmico desabilitado para este piloto.
3. Registre um cliente confidencial chamado Zenit Hub, com `client_secret_basic`, authorization code/refresh token e callback exato `https://SEU_HUB/oauth/day/callback`.
4. Publique a aplicação web do Day em HTTPS com fallback de SPA para `/oauth/consent`. Configure a Site URL do Auth para essa origem e Authorization Path como `/oauth/consent`. Não confunda essa URL com os callbacks de outros provedores de login.
5. Configure os valores públicos `VITE_HUB_CLIENT_ID` e `VITE_HUB_PUBLIC_URL` antes de gerar o frontend. O secret OAuth fica apenas no backend Hub (`DAY_CLIENT_SECRET`).
6. Configure a origem do projeto, chave publicável e cliente no Hub. Nunca copie chave administrativa para frontend ou Hub.

O login da página de consentimento usa uma sessão separada, mantida só em memória. Não reutiliza nem substitui os tokens protegidos no aplicativo Tauri. A página aceita apenas o cliente Hub configurado e o callback exato `/oauth/day/callback`; o SDK não redireciona antes dessa verificação. A senha vai diretamente ao Auth do Day, sem passar pelo Hub. Use HTTPS e cabeçalho `Referrer-Policy: no-referrer` na hospedagem.

## Experiência

Envie `conectar Day` ao Hub → abra o link → entre no Day → autorize → volte ao WhatsApp e confirme a conta. O Hub só salva a conexão utilizável depois dessa confirmação.

As consultas incluem título, situação, próximo passo, grupo, retomada e prazo. Dados ainda offline não aparecem. A retomada é independente do prazo. Nesta versão o Hub não conclui nem altera assuntos.

## Testes

```powershell
npm run typecheck
npm run test:app -- src/hub-authorization.test.ts
npm run test:database:embedded
npx playwright test tests/e2e/hub-consent.spec.ts
```

SQL é validado em PGlite com Auth simulado, incluindo leitura do proprietário, isolamento de outra conta e bloqueio de escrita OAuth. O teste de navegador simula o provedor. A ativação OAuth, publicação da página, migração hospedada e teste com conta real são etapas operacionais separadas.

O comando `supabase db advisors --local --type security` requer o stack Supabase local ativo. A validação PGlite não substitui os advisors no ambiente em que a migração for aplicada.

## Ativação em 30/09/2026

A migração de proteção foi aplicada ao projeto hospedado `zenit-day` (`zwtbbitzsfapsjfjabqi`) como `20260930171741_hub_oauth_read_only`. O arquivo local foi renomeado para corresponder ao histórico remoto; o conteúdo funcional permanece o mesmo da preparação anterior (`20260929162635`). Não aplique novamente a versão antiga.

O teste `tests/hub-readonly.integration.sql` passou também no PostgreSQL hospedado, em transação com rollback: leitura da própria conta, isolamento entre contas, rejeição de escrita OAuth e preservação da escrita normal. Nenhuma tarefa real foi alterada. Typecheck, teste de redirecionamento, testes SQL embarcados e os dois testes Playwright da página de consentimento passaram.

Os advisors não apresentaram novos avisos após a migração. Permanecem os avisos anteriores sobre a tabela privada de recibos sem políticas (acesso direto bloqueado), a RPC de sincronização `SECURITY DEFINER` (escrita intencional, com validação da conta e agora bloqueio OAuth por trigger) e a proteção de senhas vazadas desativada. Referências: [recibos privados](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [RPC autenticada](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

A página de autorização está publicada em `https://zenit-day.onrender.com/oauth/consent`, no Static Site `zenit-day` do Render (`srv-dauke459fdbs739acepg`). O build usa `npm ci --include=dev && npm run build`, saída `dist`, Node 22 e as quatro variáveis públicas descritas acima. O site tem auto-deploy desabilitado, rewrite de `/oauth/consent` para `/index.html` e `Referrer-Policy: no-referrer` em `/*`. A rota respondeu HTTP 200 com o cabeçalho esperado.

O OAuth Server foi habilitado com Site URL `https://zenit-day.onrender.com`, Authorization Path `/oauth/consent` e registro dinâmico desabilitado. O cliente `Zenit Hub` é confidencial, usa `client_secret_basic` e aceita somente `https://zenit-hub.onrender.com/oauth/day/callback`. O segredo foi configurado no backend Hub; somente o identificador público vai para o frontend do Day.

Uma solicitação OAuth de teste, sem login nem autorização de usuário, redirecionou corretamente para o formulário publicado. A conexão pessoal e a consulta via WhatsApp ainda aguardam o teste do usuário.

Referências: [OAuth Server](https://supabase.com/docs/guides/auth/oauth-server/getting-started), [Token security](https://supabase.com/docs/guides/auth/oauth-server/token-security).

## Lembretes em 02/10/2026

O acesso a assuntos continua somente para leitura. A migração hospedada `20261002111335_hub_reminder_consent` acrescenta autorização específica e revogável para lembretes, sem ampliar autorizações antigas. O cliente OAuth existente foi cadastrado na lista privada de clientes permitidos; nenhum consentimento de usuário foi criado durante a implantação.

A página `https://zenit-day.onrender.com/hub/reminders` usa login direto do Day, sem sessão persistida no navegador, para conceder ou revogar esse acesso. O Static Site recebeu uma regra adicional **rewrite `/hub/reminders` → `/index.html`**, preservando a regra de OAuth. A rota respondeu HTTP 200 e exibiu o formulário após a publicação. Novas instalações devem configurar ambas as regras, conforme a [documentação de rewrites do Render](https://render.com/docs/redirects-rewrites).

Depois dessa autorização, a assinatura de envio deve ser confirmada separadamente no WhatsApp. O Hub também depende de templates aprovados na Meta. Veja [Lembretes](LEMBRETES.md) para recorrência e limites de entrega.
