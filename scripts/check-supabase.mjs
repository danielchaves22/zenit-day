import { fileURLToPath } from 'node:url';
import { loadConfig,checkConnection } from './supabase-connection.mjs';

try {
  const config=await loadConfig(fileURLToPath(new URL('../.env.local',import.meta.url)));
  if(process.argv.includes('--config-only')) {
    console.log('Configuração pública válida. Nenhuma conexão foi realizada.');
  } else {
    if(process.stdin.isTTY) throw new Error('Execute scripts/check-supabase.ps1 para informar a senha sem exibi-la.');
    let input='';
    for await (const chunk of process.stdin) {
      input+=chunk.toString('utf8');
      if(input.length>16000) throw new Error('Entrada de autenticação inválida.');
    }
    let credentials;
    try {credentials=JSON.parse(input.replace(/^\uFEFF/,''));} catch {throw new Error('Entrada de autenticação inválida. Use o verificador PowerShell.');}
    input='';
    await checkConnection(config,credentials,{onStep:message=>console.log(message)});
    credentials.password='';
    console.log('Supabase pronto para o contrato inicial do Zenit Day. Nenhum assunto foi criado ou alterado.');
  }
} catch(error) {
  console.error(error instanceof Error?error.message:'Falha na verificação.');
  process.exitCode=1;
}

