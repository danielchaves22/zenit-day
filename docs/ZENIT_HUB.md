# Conectar o Zenit Day ao Zenit Hub

O Hub consulta assuntos via Data API usando OAuth e RLS do usuário. Cada aplicação pode usar uma conta diferente. Não há cópia do banco do Day no Hub.

## Preparação

1. Aplique `supabase/migrations/20260929162635_hub_oauth_read_only.sql` após as migrações existentes. A migração acrescenta uma verificação de capacidade e bloqueia escritas com tokens OAuth de terceiros nas tabelas de assuntos/histórico, inclusive através da função de sincronização existente. Sessões normais dos aplicativos continuam podendo gravar. Esta versão trata **todos os clientes OAuth como somente leitura**.
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

Referências: [OAuth Server](https://supabase.com/docs/guides/auth/oauth-server/getting-started), [Token security](https://supabase.com/docs/guides/auth/oauth-server/token-security).
