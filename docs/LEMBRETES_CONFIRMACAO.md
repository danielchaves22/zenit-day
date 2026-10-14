# Lembretes com confirmação pelo WhatsApp

O formulário de lembrete oferece três opções de envio:

- **Requer confirmação**: o aviso do WhatsApp inclui o botão Concluído.
- **Repetir enquanto pendente**: intervalo inteiro de 1 a 10080 minutos. A frequência principal do lembrete continua independente desse intervalo.
- **Respeitar o período de silêncio**: marcado por padrão. Desmarque apenas para permitir avisos desse lembrete durante o silêncio, inclusive de madrugada.

O período global é configurado no WhatsApp com `configurar silêncio`. O Hub pergunta início e fim, mostra o fuso e solicita confirmação. Começa desativado; não há horários presumidos. Exceções são salvas por lembrete no Day. O silêncio bloqueia também o primeiro aviso; ao terminar, somente a ocorrência ainda vigente poderá ser enviada, sem acumular repetições.

O botão Concluído encerra a ocorrência atual; os próximos horários continuam programados. Nova ocorrência substitui a pendência anterior do mesmo lembrete. Lembretes diferentes não cancelam uns aos outros. O Hub interrompe as repetições mesmo se não conseguir registrar imediatamente a conclusão no Day e tenta sincronizar depois.

As opções podem ser alteradas offline no Day e passam a valer após sincronização. Pelo chat, criação/edição pergunta Sim/Não para repetição, solicita os minutos e pergunta sobre silêncio antes da revisão final. A assinatura dos avisos é independente: enviar `ativar lembretes do Day` e confirmar é necessário para receber pelo WhatsApp.

## Contrato e implantação

A migração `reminder_confirmation` adiciona `requires_confirmation`, `repeat_minutes` e `respect_quiet_hours` aos lembretes e `zenit_day_reminder_completions` ao banco. Padrões de registros existentes: `false`, `5`, `true`. O gravador idempotente preserva esses campos quando omitidos por um cliente antigo. Conflitos seguem a revisão existente; nenhuma alteração sobrescreve automaticamente outra revisão.

`zenit_day_reminder_occurrence_state` retorna `pending`, `completed` ou `obsolete`, junto à próxima fronteira de validade. `zenit_day_complete_reminder` aceita ID, revisão e horário canônico da ocorrência. Ambas exigem autenticação, dono da conta e consentimento específico de lembretes para clientes OAuth. A conclusão não modifica a revisão da regra e é idempotente. Não há permissão de escrita direta na tabela de conclusões.

Aplicar a migração do Day antes de publicar o Hub com migração 6. O Hub guarda preferências globais, fila e token vinculado ao remetente; Day guarda regra e conclusão da ocorrência. O modelo Meta `zenit_lembrete_confirmar_v1`, idioma `pt_BR`, deve ter um botão QUICK_REPLY Concluído e estar aprovado. Não exige WhatsApp Flow. Aplicações instaladas precisam ser atualizadas para mostrar os novos campos; versões antigas continuam compatíveis.

Validação local: testes unitários de documentos offline, integração SQL de consentimento/isolamento/ocorrências e E2E de edição/sincronização em desktop e tela estreita. Conectores simulados não comprovam entrega real do WhatsApp.
