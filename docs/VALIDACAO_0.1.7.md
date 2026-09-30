# Validação — Zenit Day 0.1.7

## Escopo

No Windows, o fechamento da janela principal e da captura sempre recolhe a janela. O item **Sair do aplicativo** continua chamando o encerramento explícito do Tauri. A preferência antiga de fechamento deixou de ser consultada; iniciar com o Windows continua sendo uma preferência independente.

A alteração não modifica armazenamento de assuntos, sincronização ou comportamento Android. O trabalho local preexistente do Zenit Hub foi preservado.

## Resultados

- TypeScript e build nativo de teste aprovados.
- Fechamento nativo antes e depois do login: a janela ficou invisível e o processo permaneceu ativo.
- Reabertura restaurou a instância existente, inclusive com o painel de Ajustes aberto.
- Captura com a janela principal recolhida: gravação local offline e sincronização posterior aprovadas, sem duplicação ao repetir o identificador.
- Fechamento nativo da captura preservou o rascunho para a próxima abertura; a troca de conta manteve os rascunhos separados.
- Encerramento explícito finalizou o processo com código zero.
- Ajustes conferidos: a opção de fechamento foi removida, a explicação ficou visível e iniciar com o Windows continuou disponível. Captura de tela inspecionada.

A primeira execução identificou um argumento incorreto no próprio teste de encerramento (`exitCode` em vez de `code`). O script foi corrigido conforme a API local do Tauri, e a repetição completa passou. Não foi necessário alterar o encerramento de produção.

## Distribuição Windows

Build de produção concluído pelo `buildZD` e copiado para `C:\dev\apps\zenit-day\zenit-day.exe`. A versão instalada é 0.1.7, produto Zenit Day, com 11.906.560 bytes. SHA-256 idêntico entre o build e a cópia instalada: `CBE54B3E59F7DBA7D0825540035B222329107F545C8284F154ABF82171E64FEC`.

O bundle usa a URL normal de produção, não contém a URL simulada e as capacidades geradas não incluem `native-test`. Formatação e `git diff --check` aprovados. Nenhum processo de teste ficou aberto.

Não foi gerado outro APK nesta atualização, cujo ajuste de fechamento é exclusivo do Windows.

## Teste nativo isolado

O script `scripts/test-native-tray.cjs` usa o identificador `br.com.equinox.zenitday.traytest20260929`, conta e API simuladas, banco separado e um perfil WebView próprio. Ele verifica o identificador antes de alterar dados e limpa apenas a entrada de inicialização automática do produto de teste.

Para reproduzir, copie `src-tauri/tauri.conf.json` para `test-results/tray-native.config.json` e substitua:

- `identifier`: `br.com.equinox.zenitday.traytest20260929`.
- `productName`: `Zenit Day Tray Test 20260929`.
- Título da janela principal: `Zenit Day - teste da bandeja`.
- `app.security.capabilities`: `["main", "capture", {"identifier":"native-test","windows":["main"],"permissions":["core:window:allow-close","core:app:allow-exit"]}]`.

Somente no processo de build do teste, defina `VITE_SUPABASE_URL=https://zenit-day-test.supabase.co` e `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic_e2e`. Execute `node_modules\.bin\tauri.cmd build --debug --no-bundle --config test-results/tray-native.config.json` e depois `node scripts/test-native-tray.cjs`.

As permissões extras existem apenas na configuração temporária de teste: permitem disparar o evento nativo de fechamento e o encerramento explícito sem controlar mouse ou teclado. O fechamento passa pelo mesmo `CloseRequested` disparado pelo X. O encerramento usa `AppHandle::exit`, também utilizado pelo item Sair da bandeja; o clique no menu em si não é automatizado.
