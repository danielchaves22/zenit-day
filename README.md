# Zenit Day

Acompanhamento pessoal de assuntos em Windows e Android, com interface clara e azulada. Inclui o que o usuário executa e aquilo que precisa acompanhar com outras pessoas.

## Estado atual

Este repositório contém o cliente React/Tauri para Windows e Android, armazenamento local em SQLite, sessão protegida pelo sistema operacional e sincronização com Supabase. A fila local e os assuntos são gravados atomicamente, com reenvio idempotente e comparação explícita de conflitos.

O aplicativo oferece captura rápida, Hoje, Acompanhamentos, Concluídos, Arquivados, busca, filtros, andamentos, retomada independente do prazo e cópias dos dados. A importação restaura os assuntos como novos registros; o histórico original permanece no arquivo exportado.

A versão 0.1.1 acrescenta **Meta de hoje**: Iniciar, Avançar, Finalizar, Acompanhar ou Não hoje. A intenção tem uma data própria e sincroniza sem alterar status, retomada ou prazo. Siga [Atualização 0.1.1](docs/ATUALIZACAO_0.1.1.md) para aplicar a migração aditiva ao Supabase antes de atualizar os aplicativos.

Para preparar o serviço, use o [manual do Supabase](docs/SUPABASE_PASSO_A_PASSO.md). Para testar os aplicativos, siga [Primeiro uso](docs/PRIMEIRO_USO.md). O usuário confirmou que a preparação do Supabase foi concluída; o teste autenticado com os aplicativos e os dispositivos reais permanece separado dessa confirmação.

A versão 0.1.2 agrupa o seletor junto ao label **Meta de hoje** e permite **Concluir** diretamente no cartão. **Desfazer** restaura o status anterior por 12 segundos, desde que o assunto não tenha recebido novas alterações. A conclusão e sua reversão usam a fila offline existente e registram o histórico. Não exige outra migração SQL além da atualização 0.1.1.

A versão 0.1.3 ordena os assuntos pela criação, com os mais recentes primeiro; somente **Não hoje** vai para o fim da visão Hoje. Inclui checklist opcional na criação/edição, marcação direta nos detalhes e contagem compacta nos cartões. Todos os itens concluídos não alteram o status do assunto. Veja [Atualização 0.1.3](docs/ATUALIZACAO_0.1.3.md).

A versão 0.1.4 substitui **Projeto ou contexto** por **Grupo** e **Subgrupo**, ambos opcionais. Os cartões mantêm suas ações e aparecem em painéis retráteis, com contagem e preferência de abertura por visão/dispositivo. As associações sincronizam e funcionam offline. A migração já foi aplicada ao projeto Supabase do Zenit Day. Veja [Atualização 0.1.4](docs/ATUALIZACAO_0.1.4.md) e [Validação 0.1.4](docs/VALIDACAO_0.1.4.md).

A versão 0.1.5 torna **Sem grupo** um painel retrátil no topo da lista, seguindo as mesmas preferências dos demais painéis. A busca e o salvamento revelam seus assuntos quando necessário. Não exige nova migração SQL. Veja [Atualização 0.1.5](docs/ATUALIZACAO_0.1.5.md).

A versão 0.1.7 mantém o aplicativo na bandeja ao fechar a janela no Windows. Use **Sair do aplicativo** no menu da bandeja para encerrá-lo. Captura rápida e acesso à visão Hoje continuam disponíveis; iniciar com o Windows permanece opcional. Veja [Atualização 0.1.7](docs/ATUALIZACAO_0.1.7.md).

A versão 0.1.8 acrescenta **Prioridade**: Baixa, Normal, Importante ou Urgente. O campo aparece na criação, edição, inclusão rápida da lista e captura da bandeja. Normal é o padrão, a ordem da lista é preservada e a prioridade sincroniza entre Windows e Android. Veja [Atualização 0.1.8](docs/ATUALIZACAO_0.1.8.md).

## Desenvolvimento

A versão 0.1.9 acrescenta a gestão de **Lembretes**, pelo sino no cabeçalho: criar, editar, pausar, retomar e excluir, com vínculo opcional a um assunto, fila offline e resolução de conflitos. Suporta horários diários, dias da semana, dia do mês (ajustado ao último dia quando necessário), intervalos contínuos ou dentro de uma faixa diária e término opcional. A gestão não dispara notificações por si só; assinaturas e entrega pelo WhatsApp serão implementadas no Hub. Veja [Lembretes e notificações](docs/LEMBRETES.md).

```powershell
npm install
npm run dev
```

No navegador, a sessão fica apenas em memória e os assuntos usam IndexedDB. O uso nativo emprega SQLite e protege os tokens com DPAPI no Windows e Android Keystore no Android. Senhas não são persistidas.

```powershell
# Windows nativo
npm run tauri dev

# Instalador Windows
npm run tauri build

# APK de teste ARM64; configura JDK/SDK/NDK somente no processo
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android.ps1
```

Requer Rust e ferramentas nativas do Tauri. O Android gerado usa compileSdk/targetSdk 36, minSdk 26 e o NDK 28.2.13676358. A assinatura de distribuição, publicação e atualizações automáticas ainda não estão configuradas.

A URL e a chave publicável de `.env.local` são incorporadas pelo Vite. Alterar o destino exige gerar os aplicativos novamente. Não incluir chaves administrativas.

## Arquivos de preparação

- `.env.example`: os dois valores públicos de conexão.
- `supabase/migrations/202609250001_zenit_day.sql`: instalação inicial em um projeto Supabase novo e dedicado.
- `supabase/checks/verify-setup.sql`: conferência estrutural e de privilégios.
- `scripts/check-supabase.ps1`: login local com senha protegida no prompt e verificações sem alterar assuntos.
- `docs/SUPABASE_CONTRATO.md`: contrato utilizado pelo cliente e pela sincronização.

## Verificação local do código

Requer Node.js 22.14 ou superior. O verificador do Supabase usa somente APIs nativas do Node; o aplicativo tem as dependências declaradas em package.json.

```powershell
node --test tests/*.test.mjs
npm run test:app
npm run typecheck
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Teste do SQL em PostgreSQL descartável, requer Docker e a imagem postgres:14-alpine:

```powershell
node scripts/test-supabase-database.mjs
```

O teste cria e remove seu próprio container, sem publicar portas ou utilizar os bancos existentes. A identidade Supabase Auth é simulada; a autenticação e a Data API hospedadas são verificadas separadamente pelo script do manual.

Sem Docker, `npm run test:database:embedded` executa as mesmas migrações e verificações SQL em PostgreSQL embarcado (PGlite), em memória. Isso valida o SQL com Auth simulado, sem acessar o Supabase real.
