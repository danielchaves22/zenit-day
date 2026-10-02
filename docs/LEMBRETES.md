# Lembretes — gestão no Day e entrega pelo Hub

## Entrega 0.1.9

O sino no cabeçalho abre os lembretes independentes ou vinculados a um assunto. Criar, editar, pausar, retomar e excluir usam a persistência local, fila idempotente e sincronização entre dispositivos. Conflitos exigem escolher uma versão. A exclusão mantém um marcador para sincronizar a remoção. A cópia de segurança inclui lembretes; a restauração cria novas cópias pausadas, preservando vínculos com assuntos também restaurados.

Esta entrega implementa a gestão e o cálculo da recorrência. Ainda não envia avisos locais nem pelo WhatsApp. Não há criação automática de eventos no Calendar nem alteração do estado de conclusão de assuntos.

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

As autorizações OAuth antigas permanecem sem acesso aos novos lembretes. A etapa Hub deverá acrescentar consentimento revogável específico antes de permitir leitura agendada ou mutações pelo chat. As permissões dos assuntos continuam somente leitura.

## Fluxo previsto para notificações (próxima etapa)

Assinaturas fixas pertencem ao Hub. O comando “notificações” mostra o catálogo; “quero o resumo diário às 7h” prepara uma confirmação com horário, fuso e fontes. O botão de confirmação registra a autorização e ativa a assinatura. O usuário pode consultar, alterar horário/fontes, pausar, cancelar e reassinar. Conectar uma aplicação não assina notificações automaticamente.

Lembretes personalizados pertencem ao Day. O Hub consultará as ocorrências devidas periodicamente com a autorização delegada do usuário. A chave de entrega incluirá usuário, lembrete e ocorrência; a fila persistente impedirá novo envio por uma nova consulta ou reinício. Antes de enviar, o Hub revalidará autorização, assinatura e estado/revisão do lembrete. Casos de resultado incerto da API não devem gerar reenvio automático que duplique o aviso.

O Day não precisa conhecer número de WhatsApp nem credenciais da Meta; basta estar sincronizado na nuvem. O Hub guarda canal, consentimento, preferências e entrega. Pausar um lembrete afeta sua regra; cancelar o canal WhatsApp preserva o lembrete no Day. Adiar uma ocorrência, quando implementado, não altera a série. Não reenviar uma fila de avisos obsoletos após indisponibilidade.

Fora da janela de 24 horas, a entrega deverá usar templates aprovados. A assinatura não substitui essa exigência. Templates, autorização específica, agendador, assinaturas, resumo diário e botões de adiamento ainda não fazem parte da gestão 0.1.9. A IA interpretará pedidos de configuração; não será necessária em cada disparo de lembrete.

Referências verificadas em 02/10/2026: [política WhatsApp](https://whatsappbusiness.com/policy/), [OAuth e RLS Supabase](https://supabase.com/docs/guides/auth/oauth-server/token-security).

## Validação

Testes de modelo/sincronização cobrem persistência offline, resposta perdida, conflito, conta trocada, pausa, retomada, exclusão, backup e banco antigo. PostgreSQL embarcado cobre recorrência, meses curtos/bissextos, intervalos, isolamento de conta, vínculo, acesso anônimo e OAuth. Playwright verifica gestão offline, sincronização e edição em 320 px. Uma sessão real do Supabase e um dispositivo Android são verificações distintas dessas simulações.
