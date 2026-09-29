# Zenit Day 0.1.1 — Meta de hoje

A atualização vale para Windows e Android. Instale as novas versões por cima das anteriores, mantendo o aplicativo e seus dados. Entre com a mesma conta nos dois dispositivos.

## 1. Atualizar o Supabase uma única vez

Esta versão acrescenta a meta e sua data ao assunto. A atualização do banco é necessária para sincronizar as metas. Ela preserva assuntos, histórico, contas e regras de acesso. O aplicativo 0.1.0 continua compatível com o banco atualizado.

1. Abra o projeto **Zenit Day** no painel do Supabase.
2. Entre em **SQL Editor** e abra uma nova consulta.
3. Abra o arquivo `202609280001_daily_goals.sql` enviado junto desta atualização e copie todo o conteúdo para a consulta.
4. Clique em **Run**. A execução deve terminar com sucesso, sem linhas de resultado. O script é transacional e pode ser repetido.

Use somente o SQL desta atualização. Não execute novamente o script de criação inicial do banco.

Não é necessário mudar a URL, a chave publicável ou a conta. O agente validou este SQL em PostgreSQL embarcado com contas simuladas; a execução no seu Supabase precisa ser confirmada por você.

## 2. Instalar os aplicativos atualizados

- **Android:** baixe `Zenit-Day_0.1.1_android-arm64-debug.apk`, abra e escolha atualizar. Preserve a instalação existente; não desinstale nem limpe os dados.
- **Windows:** execute `Zenit-Day_0.1.1_windows-x64-setup.exe`. Feche o Zenit Day antes de instalar.

O APK continua sendo uma versão de teste, compatível com Android 8 ou superior em ARM64. O Windows continua sem assinatura de distribuição.

## 3. Usar a Meta de hoje

Na lista ou nos detalhes de um assunto aberto, escolha:

- **Iniciar:** dar o primeiro passo.
- **Avançar:** produzir algum progresso.
- **Finalizar:** tentar encerrar o assunto hoje.
- **Acompanhar:** verificar, cobrar retorno ou ajudar a resolver uma pendência.
- **Não hoje:** reduzir o destaque daquele assunto durante o dia.
- **Sem meta:** remover a intenção definida para hoje.

A seleção é opcional e fica salva imediatamente no dispositivo. O status, a próxima ação escrita, a retomada e o prazo final permanecem iguais. Para encerrar o assunto, use **Concluir assunto**.

Assuntos com uma meta para o dia aparecem em **Hoje**, mesmo que a retomada esteja para depois. As metas de ação aparecem primeiro; **Não hoje** fica no fim da lista, mantendo os alertas de prazo.

Na virada do dia, a meta anterior deixa de valer. Ela permanece no histórico; o detalhe mostra a última meta quando houver. O assunto continua em **Hoje** se a retomada ou o prazo exigirem atenção.

## 4. Conferir em dois dispositivos

1. Escolha **Finalizar** em um assunto no Android. Confira que o status não mudou.
2. Sincronize no Windows e confira a mesma meta.
3. No Android, fique sem internet e escolha **Acompanhar**. Feche e reabra o aplicativo; a escolha deve permanecer.
4. Reconecte, sincronize e confira no Windows.
5. Experimente **Não hoje** em um assunto com prazo para hoje: ele deve continuar visível com o alerta de prazo.

Se aparecer a mensagem de atualização pendente do Supabase, conclua o passo 1 e toque em **Sincronizar agora**. As alterações locais continuam preservadas.
