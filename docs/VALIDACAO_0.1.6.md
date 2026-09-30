# Validação — Zenit Day 0.1.6

## Aplicativo

- TypeScript aprovado; 44 testes Vitest aprovados, incluindo os testes existentes do trabalho local do Zenit Hub.
- Dois testes Rust aprovados: sessão protegida pelo Windows e gravação atômica do workspace com isolamento de contas e rejeição de versões antigas.
- Novos casos da captura: gravação concorrente com edição na janela principal, reenvio do mesmo identificador, recarga da fila offline, falha de disco sem confirmação indevida, rejeição de conta diferente e proteção contra sobrescrita em uma tentativa com outro texto.
- Oito cenários Playwright aprovados entre a suíte e a repetição focada do checklist. O checkbox inicial do teste passou a aguardar a gravação assíncrona, seguindo o mesmo helper já usado nos demais itens.
- Regressão inclui desktop/mobile, grupos, checklist, metas, conclusão/desfazer, fila offline, conflitos, backup, separação de contas e os cenários preexistentes do Hub.

## Windows nativo

Instalação isolada com identificador `br.com.equinox.zenitday.traytest20260929`, produto `Zenit Day Tray Test 20260929`, conta e serviço simulados. O script recusa um executável com o identificador real antes de consultar ou alterar sessão/assuntos. O banco de teste é separado do banco do usuário.

- Captura em segundo WebView, gravação no SQLite pela janela principal e fechamento após confirmação local.
- Gravação offline seguida de sincronização; repetição com o mesmo identificador sem duplicar o assunto ou a operação.
- Janela de captura impedida de acessar sessão protegida e workspace diretamente.
- Rascunho preservado ao fechar e reabrir; rascunhos de Alice não apresentados na conta Bob.
- Segunda execução restaura a instância existente; entrada `--today` leva à visão Hoje e `--capture` abre a captura.
- Inicialização automática ativada, consultada e desativada somente para o produto isolado de teste. Nenhuma preferência de inicialização do Zenit Day real foi alterada.
- Fechamento pelo X conferido pela interface Windows com Computer Use: com a opção ligada, a janela ficou invisível e o processo continuou ativo.
- Capturas nativas da janela pequena e dos ajustes inspecionadas visualmente. O campo de título recebeu o mesmo estilo de bordas e espaçamento do aplicativo após essa inspeção.

## Limites

Não houve login na conta real do usuário. Os cliques diretamente no ícone e nos itens do menu da área de notificação não foram automatizados; abertura, captura e Hoje foram exercitados pelo mesmo despachante usado pelo menu. Não foi simulado um novo login do Windows para disparar a inicialização automática, mas o registro foi habilitado, consultado e removido no teste isolado.

O trabalho local preexistente do Zenit Hub foi preservado. Nenhuma migração remota foi executada nesta entrega.

## Artefatos de distribuição

- Windows: build de produção concluído pelo `buildZD`, instalado em `C:\dev\apps\zenit-day\zenit-day.exe`. Versão 0.1.6, 11.940.352 bytes, SHA-256 idêntico entre o build e a cópia instalada: `DCDF763C0D9F98E0905B0B0E54DCA928A35FC24A4716962DBFD4920D4876ECD8`.
- O bundle de distribuição contém a URL normal de produção e não contém a URL do serviço simulado usado nos testes.
- Android: compilação Rust e empacotamento Gradle aprovados pelo `scripts/android.ps1`, usando a alternativa existente para a restrição de links simbólicos no Windows. Pacote `br.com.equinox.zenitday`, versão 0.1.6 / código 1006, `arm64-v8a`, target SDK 36.
- APK: 31.144.714 bytes; assinatura v2 válida e certificado preservado (`96e29a95a40c1830a6ca3ca7cba0a01cdb51c2fe721c5a02ea51f7d420061509`); alinhamento de 16 KB conferido com `zipalign`. SHA-256: `BED97B143EE755636097018E98A793074723B64EFA362FD2DCEE7CCCF82EE633`.
- [APK no Google Drive](https://drive.google.com/file/d/1ju_Q6N2IxlK6g-6L70hkYUPd09PNAdey/view?usp=drivesdk). O executável Windows foi mantido apenas localmente.

O APK não foi instalado em um aparelho nesta rodada. A regressão visual/mobile foi exercitada no Playwright; a bandeja e suas preferências são exclusivas do Windows.

## Referências técnicas

Implementação baseada nas APIs oficiais do Tauri para [bandeja](https://v2.tauri.app/learn/system-tray/), [inicialização automática](https://v2.tauri.app/plugin/autostart/) e [instância única](https://v2.tauri.app/plugin/single-instance/).

## Reproduzir o teste nativo

Crie uma configuração temporária em `test-results/tray-native.config.json`, copiando `src-tauri/tauri.conf.json` e substituindo somente `identifier` por `br.com.equinox.zenitday.traytest20260929`, `productName` por `Zenit Day Tray Test 20260929` e o título da janela principal por `Zenit Day - teste da bandeja`.

No processo de teste, defina `VITE_SUPABASE_URL=https://zenit-day-test.supabase.co` e `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic_e2e`. Execute o CLI diretamente: `node_modules\.bin\tauri.cmd build --debug --no-bundle --config test-results/tray-native.config.json`; depois, `node scripts/test-native-tray.cjs`.

O teste usa um perfil WebView próprio, CDP local na porta 9336 e limpa sua entrada de inicialização automática ao terminar. O executável de teste não deve ser instalado no diretório do `zdopen`. O build de distribuição usa a configuração normal e os valores normais de `.env.local`.
