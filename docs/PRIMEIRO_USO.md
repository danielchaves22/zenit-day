# Zenit Day — primeiro uso

Esta primeira versão usa o projeto Supabase configurado no manual. Os instaladores recebem a URL e a chave publicável durante a compilação. Você só informa o e-mail e a senha da sua conta do aplicativo na tela de login.

## Windows

1. Execute o instalador `Zenit-Day_0.1.0_windows-x64-setup.exe`.
2. Abra **Zenit Day** no menu Iniciar.
3. Entre com a conta que você criou em **Authentication > Users** no Supabase.
4. Aguarde a indicação **Tudo sincronizado**.

O instalador desta versão pessoal ainda não tem assinatura digital de distribuição. O Windows pode identificar o editor como desconhecido.

## Android

1. Copie `Zenit-Day_0.1.0_android-arm64-debug.apk` para o telefone.
2. Abra o arquivo e, se solicitado, permita que o aplicativo usado para abrir o arquivo instale esse APK.
3. Abra **Zenit Day** e use a mesma conta do Windows.

Este APK é de teste, para aparelhos ARM64 com Android 8 ou superior. Ele não é uma publicação na Play Store. Não desinstale para atualizar: instale a nova versão por cima, com a mesma assinatura, para preservar os dados locais. Desinstalar ou limpar os dados do aplicativo apaga o trabalho local ainda não enviado.

## Um teste rápido antes do uso diário

1. No Windows, crie um assunto chamado **Teste entre dispositivos**. Informe uma próxima ação e um prazo final.
2. Confira se ele aparece no Android. Toque no indicador de sincronização para atualizar imediatamente, se necessário.
3. No Android, desligue a internet e registre um andamento. Confira a indicação de alteração pendente.
4. Feche e reabra o aplicativo ainda sem internet. O assunto e o andamento devem continuar disponíveis.
5. Reative a internet e aguarde a sincronização. Confira o andamento no Windows e confirme que o prazo final continua igual.
6. Em **Ajustes > Exportar cópia**, guarde um arquivo JSON. A cópia contém assuntos, histórico, fila local e alternativas preservadas, sem tokens ou senha.
7. Para testar a restauração, use **Restaurar assuntos** e selecione a cópia. A importação exige a mesma conta e projeto e cria **novos assuntos**, preservando os existentes. O histórico anterior permanece no arquivo exportado; as cópias começam com um registro de restauração.
8. Arquive os assuntos de teste.

## O que cada ação faz

- **Hoje:** assuntos abertos com retomada ou prazo final para hoje ou uma data anterior.
- **Acompanhamentos:** todos os assuntos abertos, inclusive os sem data de retomada.
- **Responsável:** a pessoa que executa a tarefa. Informar um nome não compartilha o assunto com essa pessoa.
- **Registrar andamento:** registra uma nota e atualiza a situação. O status só muda se você escolher outro; o prazo final é preservado.
- **Reagendar:** muda apenas a data em que você pretende voltar a olhar o assunto.
- **Concluir:** encerra o assunto; **Reabrir** permite retomá-lo.
- **Arquivar:** guarda o assunto sem apagá-lo. Ele continua disponível em Arquivados.

## Internet, sessão e duas versões

O primeiro login precisa de internet. Depois, o aplicativo nativo guarda a sessão protegida pelo Windows ou Android e os assuntos em SQLite. As alterações são salvas no dispositivo antes de serem enviadas. A sincronização acontece com o aplicativo aberto, após edições, ao voltar para ele e periodicamente. Não há serviço de sincronização em segundo plano com o aplicativo encerrado.

Se a sessão expirar ou for revogada, entre novamente para sincronizar. O trabalho local continua preservado. Ao sair da conta, os dados locais ficam separados até você entrar novamente naquela mesma conta.

Se o mesmo assunto mudar em dois dispositivos, o Zenit Day pede que você compare as versões. A versão local anterior fica preservada em **Ajustes > Versões locais preservadas**. Selecioná-la permite criar um novo assunto com seu conteúdo.

## Limites desta primeira versão

- A sincronização com a sua conta real precisa passar pelo teste acima, nos seus dispositivos.
- A restauração adiciona cópias dos assuntos; não substitui integralmente o banco nem reproduz o histórico antigo como eventos novos.
- Ainda não há recuperação de senha por e-mail, notificações agendadas, compartilhamento de assuntos ou atualização automática do aplicativo.
- No navegador de desenvolvimento, os dados de teste usam IndexedDB e a sessão não persiste após recarregar. O uso diário previsto é nos aplicativos nativos.

Se algo falhar, mantenha o aplicativo instalado e exporte uma cópia, se possível. Informe a ação e a mensagem exibida, sem enviar sua senha.
