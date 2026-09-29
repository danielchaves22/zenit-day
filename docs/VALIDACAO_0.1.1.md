# Validação — Zenit Day 0.1.1

## Funcionalidade

Meta de hoje opcional, por assunto e por data, com Iniciar, Avançar, Finalizar, Acompanhar e Não hoje. A mesma interface React e as mesmas regras atendem Windows e Android. A fila persistente existente sincroniza a meta com o restante do documento, preservando resolução de conflitos e tentativas idempotentes.

Assuntos sem datas para hoje podem entrar em Hoje pela meta. As metas de ação recebem destaque; Não hoje fica ao fim da lista e mantém alertas de prazo. A intenção expira na virada local do dia. A seleção não altera status, retomada, prazo ou próxima ação escrita.

## Verificações executadas

- 18 testes Vitest: autenticação, persistência, fila, sincronização, conflitos, backup e regras de meta diária, incluindo reabertura offline e reenvio após resposta perdida.
- 6 testes Node do verificador Supabase.
- 2 cenários Playwright com sessões desktop/mobile e serviço simulado: fluxo completo existente e metas diárias, persistência offline, sincronização, prazo visível, ordenação, entrada em Hoje por meta e virada do dia. Conferência visual em 1280×900 e 390×844.
- TypeScript e build de produção do frontend aprovados.
- Migração inicial e atualização aplicadas em PostgreSQL embarcado (PGlite), com Auth simulado. A migração nova foi aplicada duas vezes. Verificados preservação dos registros, repetição de operações antigas, gravação por cliente 0.1.0 sem apagar metas, conflitos, validação de valores/datas e isolamento entre contas.
- APK ARM64 compilado; versão 0.1.1/código 1001, Android mínimo 26, alvo 36, identificação br.com.equinox.zenitday. Certificado comparado à versão 0.1.0 para permitir atualização sobre a instalação existente. Alinhamento APK de 16 KB verificado.
- Windows: compilação release x64 concluída e instalador NSIS 0.1.1 gerado, com a mesma identificação e o mesmo frontend incluído no APK e testado nas sessões desktop/mobile. A versão foi conferida nos metadados do executável.

## Limites e etapa externa

O Docker instalado não respondeu; os testes SQL desta atualização utilizaram PGlite, sem alterar containers ou bancos existentes. O acesso ao painel Supabase pela ferramenta de navegador falhou ao iniciar. Por isso, a aplicação do SQL no projeto real foi solicitada ao usuário, com arquivo e manual no Drive.

Os testes autenticados usam contas sintéticas. Não houve login ou gravação de assuntos na conta real do usuário. A execução da migração e a sincronização real entre os dispositivos precisam ser confirmadas após a atualização.

Nenhuma lógica nativa de SQLite, DPAPI ou Keystore foi alterada nesta versão. A execução nativa desses componentes foi validada na versão 0.1.0; os testes desta alteração concentram-se nas regras compartilhadas, no SQL e na geração dos pacotes.
