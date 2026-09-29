# Validação — Zenit Day 0.1.2

## Comportamento

- 25 testes Vitest aprovados: inclui os quatro status anteriores, ausência de operações duplicadas, desfazer após confirmação remota, bloqueio de reversão obsoleta e proteção de assuntos arquivados ou em conflito.
- 6 testes Node do verificador de conexão aprovados.
- TypeScript, build de produção, formatação e verificação de espaços Git aprovados.
- 3 cenários Playwright aprovados, com serviço simulado: fluxo geral, metas diárias e conclusão rápida. O cenário novo foi executado novamente após ajustar seu seletor de histórico.
- Conclusão em um toque sem mudar a visão atual ou abrir os detalhes; Desfazer recupera o status Aguardando e preserva prazo, retomada, próxima ação e meta.
- Persistência da sequência offline concluir/desfazer/concluir após recarregar o cliente; envio e leitura pelo segundo dispositivo; histórico preservado.
- Layout verificado por coordenadas em 1280×900 e 360×800, com seletor próximo ao label e Concluir alinhado à direita na mesma linha. Alvo de toque de pelo menos 44 px no celular e ausência de rolagem horizontal.
- Capturas desktop/mobile inspecionadas visualmente.

## Windows

- Build de release gerado com o alias zdbuild, sem instalador.
- Executável 0.1.2 copiado para C:\dev\apps\zenit-day\zenit-day.exe.
- A cópia instalada corresponde ao build por SHA-256: C60D3583077ABBE50D85879EE9A96FC65B57155C72ABD361EA97912120D6514D.

## Android

- APK ARM64 gerado pelo script Android do projeto, com empacotamento Gradle após a alternativa já existente para links simbólicos no Windows.
- Pacote br.com.equinox.zenitday, versão 0.1.2, versionCode 1002 e target SDK 36; ABI arm64-v8a.
- Assinatura v2 válida, com o mesmo certificado SHA-256 da versão 0.1.1: 96e29a95a40c1830a6ca3ca7cba0a01cdb51c2fe721c5a02ea51f7d420061509.
- Alinhamento de 16 KB verificado com zipalign.
- Tamanho: 31.059.066 bytes. SHA-256: 4072EDB4AAC694605A6729D25F47D009B28DAAC190704DD2FB54D90C550174C0.

## Limites

As verificações de interação e sincronização desta alteração usaram navegadores desktop/mobile e um serviço simulado. Não foi realizado um novo teste com login na conta real ou no aparelho Android do usuário. Nenhum SQL ou dado do Supabase foi alterado nesta entrega. Esta atualização reutiliza o contrato da versão 0.1.1.
