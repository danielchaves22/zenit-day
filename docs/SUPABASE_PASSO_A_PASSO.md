# Zenit Day — configurar o Supabase e conectar a aplicação

Manual 1.2 · 26 de setembro de 2026 · Windows e Android

## Antes de começar

Este manual prepara **um projeto Supabase seu**, com uma conta pessoal e um banco exclusivo para o Zenit Day. O aplicativo usará a mesma conta no Windows e no Android.

Para usar o aplicativo **0.1.1**, conclua a preparação inicial abaixo e aplique também a atualização de [Meta de hoje](ATUALIZACAO_0.1.1.md). Se o banco já estiver configurado, siga somente esse guia de atualização, preservando a instalação existente.

**Os passos 1 a 7 preparam e verificam o serviço.** O projeto em `C:\dev\equinox\zenit-day` agora inclui o cliente React/Tauri, armazenamento local e sincronização. O passo 8 explica como a configuração chega aos aplicativos; o passo 9 valida o funcionamento nos seus dispositivos. Consulte também [Primeiro uso](PRIMEIRO_USO.md).

O SQL foi validado em PostgreSQL local com duas identidades simuladas. Nenhum projeto foi criado ou alterado na sua conta Supabase durante a preparação deste pacote. A conexão com o seu projeto será validada pelo passo 7.

### O que você precisa

- Navegador, acesso à internet e uma conta no [painel do Supabase](https://supabase.com/dashboard).
- PowerShell e Node.js 22.14 ou superior para o verificador local. Nesta máquina, Node.js 22.14 já foi encontrado.
- Os arquivos deste pacote na pasta `C:\dev\equinox\zenit-day`.
- Um gerenciador de senhas para guardar as credenciais que você criar.

O verificador usa apenas recursos do Node.js. Não é necessário instalar dependências, Docker, Supabase CLI ou o SDK Android para seguir este manual.

### Quatro informações diferentes

| Informação | Para que serve | Onde usar |
|---|---|---|
| Conta do painel Supabase | Administrar o serviço e o projeto | Navegador, no painel Supabase |
| Senha do banco PostgreSQL | Administração e conexões diretas ao banco | Guardar para uso administrativo; não entra no aplicativo |
| Project URL + Publishable key | Identificar o projeto que o app acessa | Arquivo `.env.local`; serão incorporadas às versões Windows e Android |
| E-mail + senha do usuário do Zenit Day | Identificar você e autorizar acesso aos seus assuntos | Verificador local e, depois, login do aplicativo |

A conta de usuário do Zenit Day será criada dentro de **Authentication > Users**. Ela não surge automaticamente porque você criou uma conta no painel. Você pode usar o mesmo endereço de e-mail, mas são cadastros distintos.

## 1. Criar o projeto

1. Entre no [painel do Supabase](https://supabase.com/dashboard).
2. Crie ou selecione uma organização pessoal no plano **Free**. Se já tiver organizações, confira o plano da escolhida antes de criar o projeto.
3. Clique em **New project**.
4. Use o nome **zenit-day**.
5. Gere uma senha forte para o banco e guarde-a no gerenciador de senhas.
6. Para uso no Brasil, selecione a região específica **South America (São Paulo)**, código `sa-east-1`, se disponível. A seleção geral **Americas** pode apontar para outra região.
7. Mantenha a **Data API** habilitada se essa opção aparecer no formulário.
8. Confirme a criação e aguarde o projeto ficar disponível.

**Resultado esperado:** o projeto `zenit-day` abre normalmente e seus menus Database, SQL Editor e Authentication estão acessíveis.

Use um projeto dedicado, sem tabelas de outros aplicativos. Esse cuidado facilita a instalação inicial e os backups. A região de São Paulo é uma opção oficial do serviço. [Regiões disponíveis](https://supabase.com/docs/guides/platform/regions)

## 2. Criar seu usuário do aplicativo

### 2.1. Criar a conta pessoal

1. Dentro do projeto, abra **Authentication > Users**.
2. Clique em **Add user** e escolha **Create new user**.
3. Informe seu e-mail.
4. Defina uma senha própria para entrar no Zenit Day. Guarde-a; ela não é a senha do banco.
5. Marque **Auto confirm user?** para esta conta pessoal criada por você.
6. Clique em **Create user**.
7. Confira se o novo usuário aparece na lista.

Esse formulário cria a conta sem enviar confirmação por e-mail. A confirmação manual vale para o usuário que você está criando; não exige desativar a confirmação de e-mail global do projeto. [Formulário oficial do painel](https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/Auth/Users/CreateUserModal.tsx)

### 2.2. Fechar o cadastro público

1. Abra **Authentication > Sign In / Providers**. Dependendo da versão do painel, a seção pode aparecer como **Providers**.
2. Confira se o provedor **Email** está habilitado.
3. Nas opções gerais de autenticação, desative **Allow new users to sign up**.
4. Mantenha **Allow anonymous sign-ins** desativado.
5. Mantenha **Confirm Email** ativado nas configurações de Email. Sua conta já foi confirmada na etapa anterior.
6. Salve as alterações.

**Resultado esperado:** sua conta pode entrar com e-mail e senha; o aplicativo não permite que qualquer pessoa faça um novo cadastro público. [Configurações de autenticação](https://supabase.com/docs/guides/auth/general-configuration)

### 2.3. E-mails e recuperação de senha

O login inicial deste manual não depende de envio de e-mail. O serviço padrão de e-mails do Supabase tem restrições de destinatário e de volume; não vamos usá-lo como premissa para o aplicativo funcionar.

Se posteriormente habilitarmos recuperação de senha por e-mail, configuraremos SMTP próprio e o retorno do link ao aplicativo. Essa etapa não faz parte deste caminho inicial. Para trocar uma senha esquecida enquanto isso, use os controles administrativos da conta no painel; não exclua o usuário para recriá-lo, pois a exclusão remove seus dados vinculados.

[Envio de e-mails pelo Supabase](https://supabase.com/docs/guides/auth/auth-smtp)

## 3. Instalar a estrutura do Zenit Day no banco

1. Abra o arquivo abaixo no seu computador:

   `C:\dev\equinox\zenit-day\supabase\migrations\202609250001_zenit_day.sql`

   No pacote: [abrir SQL inicial](../supabase/migrations/202609250001_zenit_day.sql).

2. Copie o conteúdo inteiro.
3. No projeto `zenit-day`, abra **SQL Editor** e crie uma consulta.
4. Cole o SQL.
5. Confira novamente o nome do projeto no painel.
6. Execute com **Run**.
7. Aguarde a indicação de execução bem-sucedida. Consultas de criação podem terminar sem retornar linhas.

Execute a instalação **uma vez**. O arquivo usa uma transação: se a primeira execução falhar, as alterações dessa execução são revertidas. Se aparecer `relation already exists`, confira o passo 4 antes de tentar novamente. Não apague tabelas para resolver essa mensagem.

### O que esse SQL cria

| Objeto | Finalidade |
|---|---|
| `public.zenit_day_subjects` | Assuntos, responsáveis, situação, próxima ação, retomada e prazo |
| `public.zenit_day_updates` | Histórico dos andamentos e alterações |
| `zenit_day_private.operation_receipts` | Controle interno para reenvios não duplicarem operações |
| `zenit_day_connection_check()` | Verificação autenticada da versão do banco |
| `zenit_day_save_subject(...)` | Gravação transacional com controle de versão e retorno de conflitos |

O arquivo também instala as permissões por conta. O app lê somente os registros do usuário autenticado; gravações passam pela função de controle de versão. Nenhum assunto de exemplo é inserido.

Os responsáveis por tarefas são nomes de referência. Informar outra pessoa não cria uma conta para ela, não envia mensagens e não compartilha os assuntos. A proteção do banco usa a identidade de quem está conectado. [Controle de acesso por linha](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 4. Conferir a instalação e a Data API

### 4.1. Executar a conferência SQL

1. Abra [verify-setup.sql](../supabase/checks/verify-setup.sql), em:

   `C:\dev\equinox\zenit-day\supabase\checks\verify-setup.sql`

2. Copie o conteúdo para uma nova consulta no **SQL Editor**.
3. Execute com **Run**.
4. Confira as 14 linhas: todas devem mostrar **true**, ou `t`, na coluna `configurado`.

O teste verifica existência dos objetos, RLS e permissões. Uma tabela vazia é normal. O SQL Editor usa acesso administrativo; por isso esta conferência será complementada pelo login real do passo 7.

### 4.2. Conferir a API de dados

1. Abra **Integrations > Data API**. Se o painel agrupar as opções de outro modo, procure a seção identificada como **Data API**.
2. Confira se a API está habilitada.
3. Confira se o esquema **public** está exposto.
4. Mantenha **zenit_day_private** fora dos esquemas expostos.

A migração já concede acesso aos objetos necessários. Não crie uma política de leitura pública nem libere escrita direta nas tabelas. Os tutoriais genéricos com tabelas públicas de demonstração não correspondem ao modelo privado deste aplicativo. [Data API no guia oficial de React](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs)

## 5. Obter os dois valores públicos de conexão

**Connect é um botão no cabeçalho superior do projeto, fora do menu lateral.** Uma captura que mostra apenas a barra lateral não inclui esse botão. [Localização no painel, na documentação oficial](https://supabase.com/docs/guides/database/connecting-to-postgres)

1. Clique em **Project Overview**, no menu lateral. Em seguida, procure o botão **Connect** na barra superior da página e clique nele.
2. Selecione a opção de conexão para aplicativo ou framework, como React, quando houver essa escolha.
3. Copie a **Project URL**. Ela tem este formato:

   `https://SEU_PROJECT_REF.supabase.co`

4. Copie a **Publishable key**, cujo início é `sb_publishable_`.
5. Para obter a chave por outro caminho, clique em **Project Settings** (engrenagem no fim do menu lateral) e depois em **API Keys**. Localize ou crie uma chave publicável, iniciada por `sb_publishable_`.

Se o painel Connect abrir em **Connection String**, mude para a opção de aplicativo/framework, como React. Para este passo, precisamos da URL HTTPS do projeto e da chave publicável.

Use a URL do projeto, sem acrescentar `/rest/v1`. Não use a URL do dashboard nem a string de conexão PostgreSQL.

**Não coloque `sb_secret_`, `service_role`, senha do banco ou senha do usuário no arquivo de configuração.** A chave publicável identifica o aplicativo; seu login e as políticas do banco controlam o acesso aos assuntos. [Tipos e localização das chaves](https://supabase.com/docs/guides/getting-started/api-keys)

## 6. Configurar o projeto local

1. Abra o PowerShell.
2. Entre na pasta do projeto:

   ```powershell
   Set-Location 'C:\dev\equinox\zenit-day'
   ```

3. Crie `.env.local` a partir do modelo, sem sobrescrever um arquivo que já exista:

   ```powershell
   if (-not (Test-Path -LiteralPath '.env.local')) {
       Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
   }
   notepad .env.local
   ```

4. Substitua os dois exemplos pelos valores do seu projeto:

   ```dotenv
   VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
   ```

5. Salve e feche o editor. Confira se o nome é `.env.local`, sem `.txt` no final.
6. Confira a sintaxe localmente:

   ```powershell
   node scripts/check-supabase.mjs --config-only
   ```

**Resultado esperado:** `Configuração pública válida. Nenhuma conexão foi realizada.`

Esse primeiro teste só verifica o formato dos valores. A confirmação de que a chave pertence ao projeto ocorre no próximo passo. `.env.local` já está na lista de arquivos ignorados pelo Git.

## 7. Validar a conexão e o login

Na mesma pasta, execute:

```powershell
.\scripts\check-supabase.ps1
```

O script pedirá:

1. E-mail da conta criada em **Authentication > Users**.
2. Senha dessa conta, com entrada protegida pelo PowerShell.

Digite a senha somente no prompt local. O verificador a envia ao endpoint de autenticação do seu projeto por HTTPS; não a grava em arquivo, não a passa como argumento da linha de comando e não imprime tokens.

Se o Windows bloquear a execução do arquivo por política de scripts, você pode executar apenas esse arquivo em um processo separado, sem alterar a política permanente:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-supabase.ps1
```

### Resultado esperado

```text
Configuração pública válida. Nenhuma conexão foi realizada.
Autenticação validada.
Contrato do banco validado: versão 1.
Leitura autenticada disponível e leitura sem login bloqueada.
Supabase pronto para o contrato inicial do Zenit Day. Nenhum assunto foi criado ou alterado.
```

O verificador realiza login, chama a função de diagnóstico, verifica a leitura das duas tabelas e confirma que uma consulta sem login é bloqueada. Ao terminar, tenta revogar apenas a sessão temporária que ele próprio abriu.

**Este resultado comprova a conexão com o banco preparado.** Ainda não comprova instalação no Android, persistência offline, envio de alterações ou sincronização entre dispositivos. Esses testes estão no passo 9.

## 8. Como os aplicativos usarão essa configuração

O cliente já tem tela de login, armazenamento local e fila de sincronização. Os pacotes nativos são gerados a partir deste projeto. A primeira versão deve passar pelo teste entre seus dispositivos antes do uso diário.

### No desenvolvimento

O cliente React/Tauri lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` de `.env.local`. Os dois valores públicos são incorporados no momento de gerar o executável e o APK.

Isso significa que, depois de preencher o arquivo, será necessário reiniciar o processo de desenvolvimento ou gerar uma nova versão para aplicar mudanças. Copiar `.env.local` para perto de um executável já compilado não modifica a configuração daquele executável.

### No Windows

1. A versão será gerada a partir deste projeto, com seu Supabase já configurado.
2. Você instalará ou abrirá o aplicativo.
3. No primeiro acesso com internet, entrará com o e-mail e a senha do passo 2.
4. O app carregará os assuntos da conta e manterá uma cópia local.

### No Android

1. O APK será gerado apontando para o mesmo projeto Supabase.
2. Você instalará a versão entregue.
3. No primeiro acesso com internet, entrará com **a mesma conta** usada no Windows.
4. Os assuntos dessa conta serão carregados e passarão a ser mantidos localmente também no celular.

Não será necessário colocar a senha do banco no telefone nem copiar `.env.local` para o Android. A autenticação por e-mail e senha usa o serviço Auth do Supabase. [Login por senha](https://supabase.com/docs/guides/auth/passwords)

### Retomada de conexão

A aplicação salva cada alteração localmente antes de enviá-la. Com o aplicativo aberto, ao reconectar, envia a fila pendente e consulta as novidades do servidor. A fila usa identificadores de operação e versões esperadas para evitar duplicação e sobrescrita silenciosa. O cliente inclui renovação de sessão e comparação visual de conflitos.

Se a sessão expirar ou for revogada, o login poderá ser solicitado novamente para sincronizar. As alterações locais pendentes continuam preservadas. A sincronização não roda como serviço de fundo com o aplicativo encerrado.

## 9. Teste final entre Windows e Android

Execute esta sequência **depois que as duas versões forem entregues**:

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | Entre com a mesma conta nos dois dispositivos | Ambos carregam os assuntos da mesma conta |
| 2 | Crie no Windows um assunto chamado “Teste de sincronização” | O assunto aparece no Android após a sincronização |
| 3 | Deixe o Android sem rede e registre um andamento | A alteração é salva localmente e fica pendente de envio |
| 4 | Feche e reabra o aplicativo Android ainda offline | O andamento continua disponível |
| 5 | Reconecte o Android e abra o app | O andamento chega ao Windows uma única vez |
| 6 | Altere a data de retomada | O prazo final continua igual |
| 7 | Faça edições incompatíveis no mesmo assunto, offline, em ambos | O app preserva as duas versões e solicita resolução |
| 8 | Conclua o assunto e depois reabra-o | Status e histórico ficam consistentes nos dois dispositivos |

Se alguma etapa falhar, registre o dispositivo, a ação e a mensagem exibida. O teste de conexão do passo 7 e este teste de sincronização verificam partes diferentes da solução.

## 10. Problemas comuns

| Mensagem ou situação | O que conferir |
|---|---|
| Não encontro Connect no menu lateral | Clique em Project Overview e procure o botão Connect no cabeçalho superior da página. Para a chave, também há Project Settings > API Keys |
| `.env.local` não encontrado | Abra o PowerShell na pasta do projeto; confirme o nome do arquivo e a ausência de `.txt` |
| Configuração pública inválida | Substitua os exemplos; use HTTPS e chave iniciada por `sb_publishable_` |
| Login recusado | Use a conta de Authentication > Users; confira a senha do aplicativo, a URL e se a chave é do mesmo projeto |
| E-mail não confirmado | Confira a confirmação da conta pessoal no painel; não abra o cadastro público como solução |
| Banco ainda não está pronto | Execute a migração, confirme as 14 verificações e confira Data API/public |
| `relation already exists` ao instalar o SQL | Rode somente o verificador SQL; se estiver tudo correto, a instalação já ocorreu |
| `permission denied` tentando editar tabelas pela API | O aplicativo deve gravar pela função `zenit_day_save_subject`, com login válido |
| Leitura sem login não foi bloqueada | Confira as permissões SQL; não prossiga adicionando assuntos reais até corrigir o acesso |
| Projeto pausado | Abra o painel Supabase e retome o projeto; depois repita a verificação |
| Usuário entra, mas a lista está vazia | Confirme se é o mesmo projeto e a mesma conta. Em uma conta nova, lista vazia é normal |
| Chave administrativa copiada por engano | Remova-a da configuração, revogue/substitua a chave exposta no painel e use a publicável |
| Um app aponta para outro projeto | Corrija `.env.local` e gere uma nova versão; reinstalar o mesmo arquivo antigo não muda o destino |

## 11. Plano gratuito e cópias dos dados

Na consulta feita em 25/09/2026, o plano gratuito oferece banco de 500 MB, pausa projetos após uma semana de inatividade e não inclui backup automático. O Pro começa em US$ 25/mês. Confira o plano antes de contratar qualquer recurso pago. [Preços oficiais](https://supabase.com/pricing)

Sincronização replica alterações; uma exclusão sincronizada também pode chegar aos outros dispositivos. Por isso, uma cópia local não substitui um backup independente.

O aplicativo permite exportar uma cópia JSON dos assuntos, histórico e alterações locais em Ajustes. A restauração adiciona cópias dos assuntos, preservando os registros existentes; o histórico original continua no arquivo exportado. Teste o procedimento em [Primeiro uso](PRIMEIRO_USO.md) antes de depender dele. Para backup administrativo do serviço, o Supabase orienta projetos gratuitos a fazer exportações periódicas com a CLI e guardá-las fora do projeto. [Orientação de backup](https://supabase.com/docs/guides/platform/backups)

## 12. Checklist de preparação

- [ ] Projeto `zenit-day` criado na organização e no plano desejados.
- [ ] Senha do banco guardada separadamente.
- [ ] Conta pessoal criada em Authentication > Users e confirmada.
- [ ] Cadastro público e login anônimo desativados.
- [ ] Migração SQL executada uma vez.
- [ ] As 14 verificações SQL retornaram verdadeiro.
- [ ] Data API habilitada e esquema public acessível.
- [ ] `.env.local` contém somente URL e chave publicável.
- [ ] Verificador local passou com a conta pessoal.

Com essa lista concluída, a infraestrutura estará preparada para receber o cliente do Zenit Day. Não é necessário enviar suas senhas, tokens ou chave administrativa na conversa para continuar a implementação.
