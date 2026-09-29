# Zenit Day 0.1.3 — Ordem dos assuntos e checklist

## O que mudou

- Assuntos mais recentes no topo, pela data de criação. Editar ou marcar itens não muda a posição. Na visão Hoje, Não hoje continua no final.
- Checklist opcional em Novo assunto e Editar: adicionar, editar e remover itens, com texto e marcação de conclusão. Até 100 itens de 500 caracteres por assunto.
- Marcar/desmarcar diretamente nos detalhes; cartões mostram apenas o progresso, por exemplo 2 de 5 itens.
- Completar o checklist não conclui o assunto. Concluir continua sendo uma ação explícita, mesmo que existam itens pendentes.
- Itens sincronizam junto ao assunto, funcionam offline, são incluídos nas cópias de segurança e na comparação de versões em conflito.

## Supabase

A migração `supabase/migrations/20260929040145_subject_checklists.sql` foi aplicada ao projeto Zenit Day pelo plugin em 29/09/2026. Não é necessário executar SQL novamente nesse projeto.

Para outra instalação: aplicar primeiro as migrações inicial e de metas diárias, depois a de checklist. Ela é transacional, repetível e preserva os dados existentes. Clientes anteriores podem continuar alterando assuntos sem apagar o checklist que desconhecem. Filas antigas conservam os payloads originais para reenvio idempotente.

## Atualizar os aplicativos

- Windows: fechar a versão em uso e abrir a cópia atualizada com `zdopen` após o build. O executável fica em `C:\dev\apps\zenit-day\zenit-day.exe`.
- Android: instalar o APK 0.1.3 sobre a versão anterior, sem desinstalar. A assinatura permanece a mesma.
- Atualizar os dois dispositivos para que ambos exibam o checklist.
