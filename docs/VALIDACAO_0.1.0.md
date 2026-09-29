# Validação da primeira versão

Registro da implementação iniciada após a confirmação do usuário de que todos os passos do manual Supabase passaram.

## Verificações concluídas

- Configuração pública local: validada sem imprimir URL, chave ou credenciais.
- Verificador do serviço: 6 testes Node, com respostas HTTP simuladas.
- Cliente: 11 testes Vitest para fila persistente, falha de disco, isolamento entre contas, resposta perdida após gravação, edições durante envio, conflitos, preservação de prazo/status, cópia dos dados e renovação/encerramento de sessão.
- SQLite e proteção Windows: 2 testes Rust, incluindo rejeição de gravação local baseada em versão antiga e ida/volta da sessão protegida por DPAPI.
- Interface: teste Playwright em duas sessões e tamanhos desktop/mobile, com serviço simulado. Inclui criação, outro responsável, andamento offline, reabertura da página, sincronização, comparação de versões, exportação, importação como cópias e troca para outra conta. Sem dados de demonstração enviados ao Supabase real.
- Windows nativo: compilação release, instalador NSIS e abertura do executável; leitura do SQLite e gravação/leitura/remoção de uma sessão sintética protegida pelo sistema via IPC.
- Android nativo: compilação x86_64 e execução no emulador Android 16.1; gravação de sessão sintética protegida pelo Android Keystore, verificação de que o arquivo persistido não contém o token em texto e confirmação de que sessão e fila SQLite continuam disponíveis após encerrar e reabrir o aplicativo.
- Pacote Android ARM64: compilação concluída, identificação `br.com.equinox.zenitday`, versão `0.1.0`/`1000`, Android mínimo 26 e alvo 36, somente `arm64-v8a`; assinatura de teste verificada com `apksigner`, alinhamento do APK com `zipalign -P 16` e segmentos nativos com alinhamento de 16 KB.
- Conferência visual: telas de login Windows e Android e lista/detalhe nos tamanhos desktop e mobile.

## Limites da evidência

A confirmação de preparação do serviço foi fornecida pelo usuário. Os testes automatizados de autenticação e sincronização usam contas sintéticas. Não foi efetuado login na conta real do usuário pelo agente. O teste entre Windows e telefone Android com a conta real deve seguir `PRIMEIRO_USO.md`.

A importação de backup restaura os documentos dos assuntos como novos registros; o histórico original fica no arquivo exportado. Não é uma substituição integral do banco.

A primeira abertura no emulador ocorreu durante forte carga de inicialização e apresentou um aviso de aplicativo sem resposta. Após a inicialização do sistema, o teste nativo completo passou, incluindo duas aberturas. O teste em um telefone ARM64 real permanece pendente.
