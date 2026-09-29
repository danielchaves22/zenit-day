# Zenit Day 0.1.2

O seletor fica junto ao label **Meta de hoje** e o botão **Concluir** fica à direita do cartão. A conclusão acontece em um toque, mantém você na lista atual e oferece **Desfazer** por 12 segundos. Desfazer restaura o status anterior (A fazer, Em andamento, Aguardando ou Bloqueado), sem mudar a meta, o prazo, a retomada ou a próxima ação.

As ações ficam salvas localmente e são sincronizadas pela fila existente. Se houver conflito entre dispositivos ou uma nova alteração depois da conclusão, confira o assunto antes de reabri-lo. Após o aviso desaparecer, ainda é possível usar **Reabrir assunto** nos detalhes de Concluídos.

## Windows

O executável de uso fica em `C:\dev\apps\zenit-day\zenit-day.exe`. Feche o aplicativo antes de atualizar o arquivo. No Git Bash, `zdopen` abre a versão instalada; `zdbuild` recompila o projeto e copia o novo executável para esse destino. Se os aliases ainda não estiverem carregados, execute `bu`.

## Android

Instale o APK 0.1.2 por cima da versão anterior, sem desinstalar. O pacote continua `br.com.equinox.zenitday`, com a mesma assinatura usada nos APKs anteriores e a arquitetura ARM64.

## Supabase

Esta versão não precisa de uma nova migração SQL. Ela utiliza o contrato existente, incluindo a atualização das metas diárias da versão 0.1.1.
