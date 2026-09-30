# Contrato de conexão e sincronização — versão 1

## Identidade e configuração

O nome aprovado é Zenit Day; o projeto local está em `C:\dev\equinox\zenit-day`. Plataformas iniciais: Windows e Android. Servidor: Supabase gerenciado em conta do usuário.

O cliente receberá `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no build. Senha do banco e chaves administrativas não entram no cliente. Uma conta Supabase Auth, identificada por UUID, possui os assuntos nos dois dispositivos. Os nomes de responsáveis não representam contas compartilhadas.

## Gravação

`public.zenit_day_save_subject(p_operation_id uuid, p_subject_id uuid, p_expected_revision integer, p_subject jsonb, p_note text default null)` recebe um **documento completo**. A primeira gravação usa revisão esperada 0; as seguintes usam a última revisão confirmada pelo servidor.

Exemplo de documento, sem valores de conexão:

```json
{
  "title": "Verificar liberação da integração",
  "responsible_is_self": false,
  "responsible_name": "Marina",
  "project": "Trabalho",
  "subgroup": "Cliente A",
  "status": "doing",
  "situation": "Aguardando o resultado da validação.",
  "next_action": "Conferir o resultado com a responsável",
  "review_on": "2026-09-28",
  "due_on": "2026-09-30",
  "archived": false
}
```

Status: `todo`, `doing`, `waiting`, `blocked`, `done`. Datas civis usam `YYYY-MM-DD` ou null. Campos opcionais ausentes são normalizados para vazio/null; por isso o cliente deve enviar o documento completo, nunca um patch parcial. O usuário não informa `user_id`, revisão resultante ou timestamps: o servidor calcula esses valores.

Respostas:

- `{"result":"saved","subject":{...}}`: gravação confirmada; a revisão resultante é a esperada + 1.
- `{"result":"conflict","subject":{...}}`: nenhuma gravação efetuada; subject contém a versão atual da mesma conta, ou null se o registro não existe nela.

O identificador da operação permanece o mesmo nos reenvios do mesmo conteúdo. Se a primeira resposta se perder, o servidor devolve a confirmação original. Reutilizar o identificador com outro documento é um erro. A gravação, o histórico e o recibo são confirmados na mesma transação.

Uma nota de andamento não muda automaticamente o status nem o prazo. Esses campos pertencem ao documento completo. O cliente deve exigir ação explícita para concluir um assunto, preservar o prazo ao reagendar e registrar as transições adequadas.

## Leitura

### Extensões compatíveis do documento

Desde 0.1.1, `daily_goal` e `daily_goal_on` são enviados juntos; a ausência dos dois preserva a meta existente em operações de clientes anteriores.

Desde 0.1.3, `checklist` é um array JSONB de `{ "id": "UUID", "text": "Texto do item", "done": false }`, com até 100 itens, identificadores distintos e texto não vazio de até 500 caracteres. A ordem do array é a ordem apresentada. Ausência do campo preserva o checklist existente; `[]` remove todos os itens. Não há conclusão automática nem mudança de datas ao marcar itens.

O checklist usa a mesma revisão do assunto. Alterações concorrentes em dispositivos diferentes exigem comparação explícita das duas versões; não existe mesclagem automática. Documentos antigos e operações já enfileiradas conservam a ausência do campo para que recibos anteriores permaneçam válidos.

Desde 0.1.4, `project` representa o nome do **grupo**; o nome técnico foi mantido para preservar documentos, backups, recibos e clientes anteriores. `subgroup` é texto opcional de até 200 caracteres, ou null. Um subgrupo exige grupo preenchido; o caminho completo identifica sua associação, permitindo nomes iguais de subgrupo em grupos diferentes. Os nomes disponíveis são derivados dos assuntos da conta, inclusive concluídos e arquivados; não existe catálogo separado de grupos vazios. A interface reúne nomes equivalentes após trim, normalização NFC e comparação sem distinguir maiúsculas/minúsculas em português.

O envio explícito de `subgroup: null` remove o subgrupo. Sua ausência em um cliente antigo preserva o subgrupo quando `project` não mudou; se esse cliente mudar o grupo, o servidor limpa o subgrupo anterior. Operações antigas mantêm o payload original para reenvio idempotente. Grupo e subgrupo compartilham a revisão e a fila offline do assunto e aparecem na comparação de conflitos. O cliente 0.1.4 aguarda a capacidade `groups=true` antes de transmitir documentos com o novo campo.

O RPC de conexão mantém `schema_version=1`, com `schema_revision=4`, `daily_goals=true`, `checklist=true` e `groups=true`.

As tabelas `zenit_day_subjects` e `zenit_day_updates` concedem apenas SELECT ao papel authenticated, com RLS por `auth.uid()`. O cliente não deve escrever nelas diretamente.

A primeira implementação poderá buscar o conjunto da conta em páginas ordenadas por ID estável. Para um pequeno conjunto pessoal, uma reconciliação completa evita depender de relógios de dispositivos. Não usar somente `updated_at > último horário local` como cursor de sincronização: empates e transações concorrentes podem omitir alterações.

Não há exclusão física pelo aplicativo nesta versão. `archived` preserva o registro para reconciliação. Concluídos e arquivados não devem ser omitidos da leitura de sincronização, mesmo que fiquem ocultos em determinada visão da interface.

## Comportamentos do cliente implementado

- SQLite local e outbox são atualizados no mesmo snapshot transacional, com versão local que impede sobrescrita por outra janela.
- Particionar dados e operações por conta/projeto; uma troca de conta não mistura registros.
- Reenviar com o mesmo operation_id e preservar alterações locais mais recentes quando chegar a confirmação de uma operação antiga.
- Não sobrescrever alterações locais pendentes com uma leitura remota; comparar a revisão-base e tratar conflito.
- Ao resolver conflito, enviar uma nova operação baseada na revisão mais recente, preservando a alternativa até a confirmação.
- Guardar a sessão em armazenamento protegido apropriado a cada plataforma; não persistir a senha em arquivo de configuração.
- Renovar a sessão para uso online, preservar o trabalho offline e solicitar novo login quando necessário.
- A exportação contém o snapshot completo sem sessão; a restauração importa os documentos dos assuntos como novos registros e preserva os existentes. O histórico original permanece no arquivo exportado.
- Grupo/subgrupo sincronizam como parte do assunto. A abertura dos painéis é uma preferência local, particionada por serviço, conta e visão, sem sincronização entre dispositivos. Hoje começa aberto; as outras visões começam recolhidas. A busca revela resultados sem alterar essa preferência, e salvar um assunto abre seu painel de destino.

## Prioridade (0.1.8)

`priority` aceita `low`, `normal`, `important` ou `urgent`; a coluna é obrigatória, com padrão `normal`. A RPC aceita a ausência do campo para preservar o contrato antigo: novas inclusões recebem Normal e atualizações antigas conservam a prioridade existente. Solicitações que enviam um valor nulo, desconhecido ou de outro tipo são rejeitadas.

O cliente mantém a ausência do campo em filas e backups antigos para preservar os recibos de idempotência. O endpoint de verificação mantém `schema_version=1` e acrescenta `priorities=true` e `schema_revision=5`. Clientes novos retêm solicitações com prioridade na fila local até o serviço confirmar esse suporte.

A migração `20260930023730_subject_priorities.sql` e a suíte SQL foram executadas no projeto real. Os 12 assuntos existentes receberam Normal e o checksum dos demais campos permaneceu igual. Fixtures de teste foram revertidas. Veja [Validação 0.1.8](VALIDACAO_0.1.8.md).

## Limite da validação atual

O contrato SQL foi testado localmente em PostgreSQL 14, incluindo duas identidades, bloqueio anônimo, gravações diretas negadas, reenvios, conflitos e datas. O usuário confirmou a conclusão dos passos de configuração do Supabase. Testes do cliente usam contas e respostas simuladas; o teste autenticado final com a conta real e os dispositivos do usuário continua necessário. Veja `PRIMEIRO_USO.md`.

Em 29/09/2026, a migração de checklist foi aplicada ao projeto real pelo plugin Supabase. A suíte SQL de checklist também passou nesse banco, com identidades temporárias e transação revertida ao final. Os registros existentes foram comparados antes/depois e preservados. Isso valida SQL, privilégios e RLS no serviço real, mas não equivale a um login de usuário pela Data API ou a um teste no aparelho pessoal.

Na mesma data, a migração `20260929043137_subject_groups.sql` e a suíte de grupos foram executadas no projeto real. A suíte foi revertida ao final, e os dez assuntos existentes conservaram os campos anteriores. Veja `VALIDACAO_0.1.4.md`.
