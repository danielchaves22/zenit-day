# Validação — Zenit Day 0.1.3

## Aplicativo e interface

- 33 testes Vitest aprovados, incluindo ordenação, validação do checklist, snapshots independentes na fila, confirmação remota durante edição local, recuperação de conflito e compatibilidade com cópias antigas.
- 6 testes Node do verificador de conexão aprovados.
- TypeScript e build Vite de produção aprovados.
- Quatro cenários Playwright aprovados entre a execução da regressão e a execução final do novo cenário: fluxo geral, metas, conclusão rápida e checklist. Os testes usam serviço simulado.
- Novo cenário: criar, editar, remover, marcar/desmarcar; todos os itens marcados sem concluir automaticamente o assunto; assuntos recentes acima dos antigos com meta; posição preservada após alterações.
- Checklist salvo offline, fila reaberta após recarga, confirmação e leitura no segundo dispositivo; proteção contra sobrescrita por formulário obsoleto; comparação dos itens de ambas as versões em conflito.
- Layout em 1280×900 e 360×800, texto longo com quebra de linha, sem rolagem horizontal; itens e controles de toque com alvo de pelo menos 44 px. Capturas dos detalhes e editor inspecionadas visualmente.
- Dois ajustes nos seletores do novo teste: selecionar Status por papel de combobox e aguardar o estado do checkbox depois da gravação local assíncrona. O cenário final passou em 16,4 segundos.

## Banco de dados

- Migrações executadas em PostgreSQL embarcado (PGlite), inclusive aplicação repetida das migrações aditivas; testes anteriores e de checklist aprovados.
- Migração `20260929040145_subject_checklists.sql` aplicada diretamente ao projeto `zenit-day` via plugin Supabase em 29/09/2026.
- Suíte `tests/checklists.integration.sql` aprovada também no projeto real: criar/editar/marcar/limpar, preservação por clientes antigos, reenvio idempotente, conflito de revisão, limites e tipos, RLS entre duas identidades, bloqueio anônimo e de escrita direta.
- Contas e registros da suíte real foram criados dentro de uma transação revertida ao final. Oito assuntos existentes preservados; fingerprint dos campos anteriores igual antes/depois. Os oito receberam checklist vazio.
- Nenhuma senha ou chave administrativa incorporada ao aplicativo. Contrato de conexão mantém versão 1 e anuncia revisão 3 com suporte a checklist.

### Revisão de permissões

Os avisos do assessor de segurança foram comparados antes/depois, sem novos avisos. Mantidos os dois comportamentos deliberados do contrato: [recibos privados sem políticas de leitura](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) e [RPC de escrita SECURITY DEFINER autenticado](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), necessário para gravar atomicamente assunto/histórico/recibo, com `auth.uid()` obrigatório, proprietário imposto no servidor, search_path vazio e execução anônima revogada. A [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) já estava desativada; configurações de autenticação não foram alteradas nesta entrega.

## Limites

As interações foram verificadas em navegadores com dimensões desktop/mobile. A suíte SQL real simula identidades dentro da transação e não realiza login do usuário pela Data API. Não houve teste desta versão no aparelho Android pessoal ou na sessão real do aplicativo Windows.

## Windows

- Build release via função `buildZD` (alias `zdbuild`) concluído; versão 0.1.3.
- Executável copiado para `C:\dev\apps\zenit-day\zenit-day.exe`, com 11.160.064 bytes.
- SHA-256 do build e da cópia instalada iguais: `9A9113BCE582AC87DD0991572722B109884071131CEEB081501FFD1F52FFD904`.
- Formatação Prettier dos arquivos alterados e verificação de espaços Git aprovadas.

## Android

- Build ARM64 concluído, usando a alternativa Gradle do script do projeto após a restrição de links simbólicos do Windows.
- Pacote `br.com.equinox.zenitday`, versão 0.1.3, versionCode 1003, target SDK 36, somente ABI arm64-v8a.
- Assinatura v2 validada, mantendo o certificado SHA-256 `96e29a95a40c1830a6ca3ca7cba0a01cdb51c2fe721c5a02ea51f7d420061509` das versões anteriores.
- Alinhamento de 16 KB aprovado por zipalign.
- APK com 31.060.982 bytes e SHA-256 `697A49FD07FB503FB3DFA161252D48C290D35116FB9A1613EAB88DDA4AB968FB`.
- [APK 0.1.3 no Google Drive](https://drive.google.com/file/d/10Bgx-VotHTRzGBODptj3SIjmq1KqTSCX/view?usp=drivesdk).
