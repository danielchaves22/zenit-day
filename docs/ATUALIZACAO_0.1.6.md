# Zenit Day 0.1.6 — Bandeja do Windows

O ícone do Zenit Day aparece na área de notificação enquanto o aplicativo está em execução. Se o Windows o colocar entre os ícones ocultos, abra a seta da bandeja.

- Clique esquerdo: abre/restaura a janela existente, sem iniciar outro processo.
- Clique direito: abre o menu **Novo assunto…**, **Ver Hoje**, **Abrir Zenit Day** e **Sair do aplicativo**.
- O menu Hoje mostra a quantidade de assuntos do dia. O texto ao passar o mouse também informa a situação da sincronização.
- Novo assunto e Ver Hoje ficam disponíveis quando a conta está carregada.

## Captura rápida

**Novo assunto…** abre uma janela pequena. Digite o título e pressione Enter ou **Salvar e fechar**. O assunto entra em Hoje, sem grupo, sob sua responsabilidade, com status A fazer.

A gravação é confirmada no armazenamento local antes de fechar a captura. Ela funciona offline e utiliza a mesma fila de sincronização da janela principal. Repetir uma tentativa cuja resposta se perdeu não cria outro assunto.

Esc, Fechar ou o X recolhem a captura. O rascunho fica guardado para a próxima abertura, separado por conta. A captura não acessa tokens nem grava diretamente no banco local: solicita a gravação à janela principal.

## Preferências

Em **Ajustes → No Windows**:

- **Manter na bandeja ao fechar a janela:** o X da janela principal apenas recolhe o aplicativo. Ele continua disponível e sincronizando quando há conexão. Para encerrar, use **Sair do aplicativo** no menu da bandeja.
- **Iniciar com o Windows:** inicia discretamente na bandeja ao entrar no Windows.
- **Abrir captura rápida:** permite experimentar a janela de captura sem procurar o ícone.

As duas preferências começam desativadas em uma instalação nova. São independentes, locais ao computador e não alteram a conta. Encerrar o aplicativo não equivale a sair da conta; alterações já gravadas localmente continuam na fila para a próxima abertura.

## Atualização

No Windows, feche a versão anterior e use `zdopen` após o build. A cópia instalada fica em `C:\dev\apps\zenit-day\zenit-day.exe`. O alias `zdbuild` continua gerando e copiando o executável.

A bandeja e essas preferências são exclusivas do Windows. A interface Android mantém seu funcionamento normal. Esta entrega não exige migração no Supabase.
