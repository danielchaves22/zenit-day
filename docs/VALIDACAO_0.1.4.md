# Validação — Zenit Day 0.1.4

## Aplicativo e interface

- 39 testes Vitest aprovados: agrupamento e ordenação, ausência de duplicação, caminhos independentes para subgrupos homônimos, contagem filtrada, campos opcionais, backups, preferências e compatibilidade da fila com clientes anteriores.
- 6 testes Node do verificador de conexão aprovados; TypeScript aprovado.
- Seis cenários Playwright aprovados entre a regressão completa (cinco cenários) e a execução final dos dois cenários de grupos. O serviço é simulado nesses testes.
- Regressão: fluxo geral, metas diárias, conclusão rápida e checklist.
- Grupos: seleção/criação, cartões soltos, cartões diretos e aninhados, abertura por visão/dispositivo, recarga, busca revelando resultados sem perder preferências, e abertura do destino após salvar.
- Mudança de grupo offline, alteração concorrente no segundo dispositivo, comparação dos dois caminhos e resolução explícita do conflito.
- Tela desktop de 1280 px e celular de 360 px; cabeçalhos com alvo de toque mínimo de 44 px, cartões de mesma largura, retorno dos detalhes restaurando a rolagem da lista.
- Nomes de 200 caracteres sem espaços verificados na lista, detalhes e editor em tela de 360 px, sem rolagem horizontal. Remover o grupo limpa também o subgrupo.
- Capturas da lista desktop/mobile e do editor mobile inspecionadas visualmente.

## Banco de dados

- Migrações e suítes SQL aprovadas em PostgreSQL embarcado (PGlite), incluindo aplicação repetida da migração de grupos.
- Migração `20260929043137_subject_groups.sql` aplicada ao projeto `zenit-day` via plugin Supabase em 29/09/2026.
- Suíte `tests/groups.integration.sql` aprovada também no projeto real: criação e mudança de associação, limpeza, tipos e limites, subgrupo sem grupo rejeitado, preservação por cliente antigo, mudança de grupo por cliente antigo limpando o subgrupo, reenvio idempotente, conflitos, isolamento entre contas e bloqueio anônimo.
- Contas e registros de teste ficaram em transação revertida ao final. Dez assuntos existentes preservados; fingerprint dos campos anteriores igual antes/depois: `89b6bf74c23c405907bef3dd502c027d`.
- RLS permanece ativa. Contrato de conexão mantém versão 1 e anuncia revisão 4 com `groups=true`.
- Nenhuma senha ou chave administrativa incorporada ao aplicativo.

### Revisão de permissões

O assessor de segurança retornou os mesmos avisos antes e depois, sem novos avisos. Permanecem os comportamentos deliberados do contrato: [recibos privados sem políticas de leitura](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) e [RPC de escrita SECURITY DEFINER autenticado](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), usado para gravar assunto/histórico/recibo atomicamente, com `auth.uid()` obrigatório, proprietário imposto pelo servidor, search_path vazio e execução anônima revogada. A [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) já estava desativada; as configurações de autenticação não foram alteradas nesta entrega.

## Limites

As interações foram verificadas em navegadores com dimensões desktop/mobile. A suíte SQL real usa identidades temporárias dentro de uma transação, sem login do usuário pela Data API. Não houve teste desta versão no aparelho Android pessoal ou na sessão real do aplicativo Windows.

## Windows

- Build release via `buildZD` (alias `zdbuild`) concluído, incluindo TypeScript e Vite de produção.
- Versão 0.1.4 instalada em `C:\dev\apps\zenit-day\zenit-day.exe`, com 11.161.088 bytes.
- SHA-256 do executável gerado e da cópia instalada iguais: `3B6E789BBD57B5354826A8964439611ABB5DF8CBB5878C5C32873046D15007A6`.
- Prettier dos arquivos alterados e `git diff --check` aprovados. O repositório ainda contém arquivos não rastreados; nenhum commit foi criado nesta entrega.

## Android

- Build ARM64 concluído com a alternativa Gradle do script existente, após a restrição de links simbólicos do Windows.
- Pacote `br.com.equinox.zenitday`, versão 0.1.4, versionCode 1004, target SDK 36 e ABI arm64-v8a.
- Assinatura v2 válida, com o mesmo certificado SHA-256 das versões anteriores: `96e29a95a40c1830a6ca3ca7cba0a01cdb51c2fe721c5a02ea51f7d420061509`.
- Alinhamento de 16 KB aprovado por zipalign.
- APK com 31.062.354 bytes e SHA-256 `C1DA9E191373C446C17E2FA0464A4E2233444A097293B1F84138F5D92643773A`.
- [APK 0.1.4 no Google Drive](https://drive.google.com/file/d/1j2X-mXj0eqFUgZ2ni1VcIobDDMPB6r2R/view?usp=drivesdk).
