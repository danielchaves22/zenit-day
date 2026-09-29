# Zenit Day 0.1.4 — Grupos e subgrupos

## Organizar um assunto

Em **Novo assunto** ou **Editar assunto**, escolha **Grupo** e, se quiser, **Subgrupo**. Cada campo oferece os nomes já usados e a opção **Criar grupo…** ou **Criar subgrupo…**. O novo nome passa a existir ao salvar o assunto.

- **Sem grupo**: o cartão continua solto na lista.
- **Grupo, sem subgrupo**: o cartão aparece diretamente no painel desse grupo.
- **Grupo e subgrupo**: o cartão aparece dentro do painel do subgrupo, uma única vez. Para escolher um subgrupo, primeiro escolha seu grupo.

O campo **Projeto ou contexto** foi substituído. Seus valores existentes são reconhecidos como grupos, preservando as associações. Ao mudar de grupo, escolha novamente um subgrupo; ao selecionar **Sem grupo**, ambas as associações são removidas.

Os nomes disponíveis vêm dos assuntos da sua conta, inclusive concluídos e arquivados. Esta versão não mantém grupos vazios nem oferece renomeação coletiva: mudar a seleção no editor altera somente aquele assunto. Nomes iguais, variando apenas maiúsculas/minúsculas, aparecem no mesmo painel. Um subgrupo com o mesmo nome em outro grupo permanece separado.

## Painéis e celular

- Assuntos sem grupo aparecem primeiro; depois, grupos e subgrupos em ordem alfabética.
- Dentro de cada bloco, os assuntos mais novos continuam no topo. A meta **Não hoje** continua levando o assunto ao fim do seu bloco na visão Hoje.
- Toque em qualquer parte do cabeçalho para abrir/recolher. A contagem considera os assuntos que passam pela visão, busca e filtro atuais; grupos sem resultados ficam ocultos.
- Hoje começa com painéis abertos. As outras visões começam recolhidas. Depois, cada visão lembra suas escolhas naquele dispositivo e conta.
- A busca encontra também nomes de grupos/subgrupos e abre os painéis dos resultados. Limpar a busca restaura a preferência anterior.
- Salvar um assunto abre seu grupo/subgrupo de destino. No celular, voltar dos detalhes recupera a posição da lista; após salvar, revela o assunto salvo.
- Os cartões mantêm sua largura e as ações atuais, incluindo checklist, Meta de hoje e Concluir.

## Sincronização e atualização

Grupo e subgrupo funcionam offline, sincronizam entre Windows e Android e fazem parte dos backups e da comparação de conflitos. A abertura dos painéis permanece como preferência de cada dispositivo.

A migração `supabase/migrations/20260929043137_subject_groups.sql` já foi aplicada ao projeto Zenit Day pelo plugin em 29/09/2026. **Não é necessário executar SQL novamente.** Os dez assuntos existentes foram preservados.

Para outra instalação, aplique as migrações na ordem: inicial, metas diárias, checklist e grupos. Clientes antigos continuam compatíveis: preservam o subgrupo enquanto o grupo não mudar; ao mudar o grupo em um cliente antigo, o subgrupo anterior é limpo.

- **Windows:** feche a versão em uso e execute `zdopen`. O build atualiza `C:\dev\apps\zenit-day\zenit-day.exe`.
- **Android:** instale o APK 0.1.4 sobre a versão anterior, sem desinstalar. A assinatura permanece a mesma.
- Atualize os dois dispositivos para exibir os painéis e os novos campos em ambos.
