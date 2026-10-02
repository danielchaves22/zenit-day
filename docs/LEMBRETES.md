# Lembretes — gestão no Day e entrega pelo Hub

## Entrega 0.1.9

O sino no cabeçalho abre os lembretes independentes ou vinculados a um assunto. Criar, editar, pausar, retomar e excluir usam a persistência local, fila idempotente e sincronização entre dispositivos. Conflitos exigem escolher uma versão. A exclusão mantém um marcador para sincronizar a remoção. A cópia de segurança inclui lembretes; a restauração cria novas cópias pausadas, preservando vínculos com assuntos também restaurados.

O Day implementa a gestão e o cálculo da recorrência. Não envia avisos locais do sistema operacional nem se conecta diretamente à Meta: a entrega pelo WhatsApp é feita pelo Hub, após autorização no Day e assinatura no canal. Não há criação automática de eventos no Calendar nem alteração do estado de conclusão de assuntos.

Migração: `supabase/migrations/20261002062738_recurring_reminders.sql`, já aplicada ao projeto Supabase do Day. O nome local acompanha a versão registrada no serviço. Clientes antigos continuam funcionando; o novo cliente preserva alterações locais se outro banco ainda não anunciar a capacidade `reminders`.

## Recorrência

- `daily`: um ou mais horários no fuso armazenado.
- `weekly`: dias da semana (0=domingo) e horários.
- `monthly`: dia 1–31 e horários. Cada mês calcula `min(dia solicitado, último dia do mês)`, preservando o dia solicitado nos meses seguintes.
- `interval`: minutos exatos desde `startAt`; sem faixa, continua à noite. Com `windowStart`/`windowEnd`, reinicia no começo da faixa de cada dia e inclui o fim quando coincide com o intervalo.
- `startAt` é inclusivo; `endAt` é exclusivo. A cada 12 horas por sete dias, incluindo o início, produz 14 ocorrências.
- `zenit_day_next_reminder(schedule, after)` retorna a primeira ocorrência estritamente posterior a `after`. Atrasos na entrega não mudam a âncora.
- Horários de calendário seguem as regras de fuso do PostgreSQL; intervalos contínuos representam tempo decorrido. O formulário rejeita horários locais inexistentes na mudança de horário de verão.

## Persistência e acesso

`zenit_day_reminders` pertence ao usuário autenticado e guarda texto, vínculo opcional, estado, regra, revisão e datas de auditoria. O vínculo usa chave composta para impedir associação a assunto de outra conta. A escrita passa por RPC com versão esperada e recibo por operação. A implementação privilegiada fica no schema privado, com identidade do usuário verificada; o endpoint público usa `SECURITY INVOKER`.

As autorizações OAuth antigas permanecem sem acesso aos novos lembretes. A integração exige consentimento revogável específico antes de permitir leitura agendada ou mutações pelo chat. As permissões dos assuntos continuam somente leitura.

## Integração Hub

A migração `hub_reminder_consent` e a página `/hub/reminders` acrescentam autorização específica para o cliente OAuth do Hub consultar e gerenciar lembretes. A sessão direta do Day deve conceder o acesso; tokens do Hub não podem fazê-lo. A autorização pode ser revogada na mesma página. O cliente OAuth deve ser cadastrado pelo administrador na tabela privada `reminder_clients` em cada ambiente. Não há acesso anônimo, acesso entre contas ou ampliação das permissões de escrita de assuntos.

O endpoint `zenit_day_reminder_occurrences` calcula ocorrências em janela de no máximo cinco minutos, com RLS e verificação do consentimento. Retorna no máximo 500 ocorrências e sinaliza truncamento. Desconsidera ocorrências anteriores à última alteração da regra. A entrega continua pertencendo ao Hub e exige assinatura independente e template aprovado na Meta.

## Fluxo para notificações

Assinaturas fixas pertencem ao Hub. O comando “notificações” mostra o catálogo; “quero o resumo diário às 7h” prepara uma confirmação com horário, fuso e fontes. O botão de confirmação registra a autorização e ativa a assinatura. O usuário pode consultar, alterar horário/fontes, pausar, cancelar e reassinar. Conectar uma aplicação não assina notificações automaticamente.

Lembretes personalizados pertencem ao Day. O Hub consulta as ocorrências devidas periodicamente com a autorização delegada do usuário. A chave de entrega inclui remetente, lembrete e ocorrência; a fila persistente impede novo envio por uma nova consulta ou reinício. Antes de enviar, o Hub revalida autorização, assinatura e estado/revisão do lembrete. Casos de resultado incerto da API não devem gerar reenvio automático que duplique o aviso.

O Day não precisa conhecer número de WhatsApp nem credenciais da Meta; basta estar sincronizado na nuvem. O Hub guarda canal, consentimento, preferências e entrega. Pausar um lembrete afeta sua regra; cancelar o canal WhatsApp preserva o lembrete no Day. Adiar uma ocorrência, quando implementado, não altera a série. Não reenviar uma fila de avisos obsoletos após indisponibilidade.

A implementação atual do Hub usa templates aprovados em todos os disparos proativos, inclusive quando a janela de atendimento estiver aberta. A assinatura não substitui a configuração/aprovação dos templates. O código do Hub fornece catálogo, assinaturas, agendador, resumo diário e gestão pelo chat; o envio depende da configuração/aprovação dos templates e do consentimento do usuário. Adiamento de ocorrências permanece para uma etapa posterior. A IA interpreta pedidos de configuração; não é necessária em cada disparo de lembrete.

Referências verificadas em 02/10/2026: [política WhatsApp](https://whatsappbusiness.com/policy/), [OAuth e RLS Supabase](https://supabase.com/docs/guides/auth/oauth-server/token-security).

## Validação

Testes de modelo/sincronização cobrem persistência offline, resposta perdida, conflito, conta trocada, pausa, retomada, exclusão, backup e banco antigo. PostgreSQL embarcado cobre recorrência, meses curtos/bissextos, intervalos, isolamento de conta, vínculo, acesso anônimo e OAuth. Playwright verifica gestão offline, sincronização e edição em 320 px. Uma sessão real do Supabase e um dispositivo Android são verificações distintas dessas simulações.
