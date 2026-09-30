# Validação — Zenit Day 0.1.8

## Escopo e compatibilidade

Prioridade (`low`, `normal`, `important`, `urgent`) foi acrescentada ao modelo, criação/edição, inclusão rápida da lista e captura da bandeja. Normal é o padrão; apenas as demais prioridades recebem etiqueta nos cartões. Detalhes e comparação de conflitos mostram todas as opções. A ordenação existente foi preservada.

Documentos e filas antigos mantêm a ausência do campo, sem alterar solicitações já identificadas. A RPC preserva a prioridade existente em edições antigas. Backups, rascunhos e conflitos mantêm a informação. A captura confirma o armazenamento local antes de fechar e rejeita um reenvio do mesmo identificador com outra prioridade.

## Verificações

- TypeScript aprovado; 48 testes unitários aprovados entre a suíte e a repetição do teste de backup após correção da fixture.
- Nove cenários Playwright aprovados, incluindo prioridade no desktop e no layout mobile de 360 px, criação rápida, edição, sincronização, fila offline, conflito e ordenação. A repetição focada após o ajuste visual também passou, conferindo criação completa, ausência de etiqueta Normal e seletor com altura mínima de 44 px. Capturas desktop/mobile inspecionadas.
- PostgreSQL embarcado: migração repetida, quatro valores, dados inválidos, clientes antigos, reenvios, conflitos e isolamento de contas aprovados. A proteção de escrita OAuth do trabalho preexistente do Hub continuou passando após a nova migração.
- Windows nativo em instalação isolada: prioridade da captura salva offline, preservada no rascunho e no reenvio, sincronizada depois e reiniciada em Normal para outra conta. Fechar para a bandeja, restaurar a instância e encerrar explicitamente continuaram passando.

O teste nativo usa a configuração isolada descrita em [Validação 0.1.7](VALIDACAO_0.1.7.md), com versão 0.1.8, API simulada e permissões temporárias de teste. Ele não acessa a sessão nem os assuntos reais do usuário. Não foi necessário controlar mouse ou teclado.

## Supabase real

Migração aplicada como `20260930023730_subject_priorities.sql`. A suíte `tests/priorities.integration.sql` passou no projeto real; identidades e registros sintéticos foram revertidos ao final. Os 12 assuntos existentes receberam Normal. Checksum dos campos anteriores, antes e depois: `d8f0bef44077230c93bdd41f16451efa`.

RLS permaneceu habilitado. Os avisos dos Advisors são os mesmos observados antes da alteração:

- [Recibos privados sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): a tabela privada é acessada pela RPC, sem acesso direto dos clientes.
- [RPC SECURITY DEFINER para usuários autenticados](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): contrato preexistente com validação de `auth.uid()`, filtro por proprietário, `search_path` vazio e acesso anônimo revogado, preservado nesta migração.
- [Proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection): configuração de autenticação preexistente, não alterada nesta entrega.

O trabalho local preexistente do Hub foi preservado e sua migração não foi aplicada remotamente nesta tarefa. A validação no serviço real é de SQL/RLS; não equivale a login com a conta pessoal nem a um teste no aparelho do usuário.

## Distribuição Windows

Build de produção concluído por `buildZD`, com cópia instalada em `C:\dev\apps\zenit-day\zenit-day.exe`. Versão 0.1.8, 11.909.120 bytes. O SHA-256 do build e da instalação coincidiu: `68044C134291269B2770F28A5F2C1A018FD08C74C73418BAA75039D08052B8E9`.

URL de produção conferida no bundle; a URL simulada e a capacidade `native-test` não estão na configuração de distribuição. O aplicativo que já estava aberto não foi encerrado: é necessário escolher **Sair do aplicativo** e abrir novamente com `zdopen` para carregar a nova versão.

## Distribuição Android

Compilação Rust e empacotamento Gradle aprovados usando a alternativa já existente para a restrição de links simbólicos do Windows. APK `br.com.equinox.zenitday`, versão 0.1.8 / código 1008, target SDK 36, ABI `arm64-v8a`, 31.145.402 bytes. Assinatura v2 e alinhamento de 16 KB conferidos.

O certificado permaneceu `96e29a95a40c1830a6ca3ca7cba0a01cdb51c2fe721c5a02ea51f7d420061509`. SHA-256 do APK: `E8DB44A07684A62BDE669B20B9EB77E6317BBDCC4C81FADC033ECF2573674CA2`.

[APK 0.1.8 no Google Drive](https://drive.google.com/file/d/1-VZ6ofrz3zVQbo5aw0PVzEaX7lctRjSQ/view?usp=drivesdk), com tamanho conferido após o envio. O executável Windows permaneceu apenas localmente. O APK não foi instalado em um aparelho nesta rodada; a interface mobile e a sincronização foram verificadas com Playwright.
