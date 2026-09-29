# Validação — Zenit Day 0.1.5

## Interface e comportamento

- TypeScript aprovado; 39 testes Vitest aprovados.
- Seis cenários Playwright aprovados entre a execução da suíte e a repetição focada do fluxo de backup. O teste de backup foi ajustado para abrir o painel ao entrar em Acompanhamentos, conforme o novo comportamento.
- Sem grupo verificado no topo, com contagem, aberto inicialmente em Hoje e recolhido inicialmente em Acompanhamentos.
- Recolher, buscar um assunto e limpar a busca preservam a preferência anterior. A preferência continua após recarga e é independente da visão e do dispositivo.
- Captura rápida com o painel recolhido revela o assunto salvo. Remover o grupo de um assunto mantém o cartão acessível em Sem grupo.
- Preferências usam uma chave própria, distinta de um grupo cujo nome seja literalmente “Sem grupo”.
- Capturas desktop de 1280 px e mobile de 360 px inspecionadas; cabeçalho com alvo de toque mínimo de 44 px e cartões preservados.
- Regressões aprovadas para checklist, metas diárias, conclusão/desfazer, persistência offline, sincronização, conflitos, backup e isolamento de contas.

## Escopo e limites

Mudança visual e de preferência local; nenhuma migração SQL, alteração de contrato ou acesso ao banco real foi necessário nesta versão. Os testes de interface usam navegador e serviço simulado. Não houve teste na sessão nativa do usuário nem no aparelho Android físico.

## Windows

- Build release via `buildZD`/`zdbuild` concluído, incluindo TypeScript e Vite de produção.
- Executável 0.1.5 instalado em `C:\dev\apps\zenit-day\zenit-day.exe`, com 11.161.600 bytes.
- SHA-256 do build e da cópia instalada iguais: `514827CAE2908280AEAFB91AAD56DF34C1EAF2A44BDFA4D22A3349FB6D7C0ACB`.
- Formatação Prettier e `git diff --check` aprovados; arquivos preexistentes não rastreados preservados, sem novo commit.

## Android

- Build ARM64 concluído com a alternativa Gradle do script existente, após a restrição de links simbólicos do Windows.
- Pacote `br.com.equinox.zenitday`, versão 0.1.5, versionCode 1005, target SDK 36 e ABI arm64-v8a.
- Assinatura v2 válida com o mesmo certificado SHA-256 das versões anteriores: `96e29a95a40c1830a6ca3ca7cba0a01cdb51c2fe721c5a02ea51f7d420061509`.
- Alinhamento de 16 KB aprovado por zipalign.
- APK com 31.062.822 bytes e SHA-256 `FEC8A6AB6A31674CAC648811D2A6AB5597793F0FC52EC50933CEAC198265424F`.
- [APK 0.1.5 no Google Drive](https://drive.google.com/file/d/19v5s8592vf-1ChjBbqnvejziid1f7fJO/view?usp=drivesdk), com tamanho conferido após o envio.
