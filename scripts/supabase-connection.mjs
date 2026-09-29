import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

export function validateConfig(values) {
  const rawUrl=values.VITE_SUPABASE_URL?.trim();
  const key=values.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!rawUrl || !key || /SEU_PROJECT_REF|SUBSTITUA/.test(rawUrl+' '+key)) {
    throw new Error('Preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY em .env.local.');
  }
  let url;
  try { url=new URL(rawUrl); } catch { throw new Error('A URL do projeto é inválida. Copie Project URL no painel Connect.'); }
  if(url.protocol!=='https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port || url.pathname!=='/' || url.search || url.hash) {
    throw new Error('Use a Project URL HTTPS padrão do Supabase, sem /rest/v1, parâmetros ou caminho adicional.');
  }
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('Use somente a chave sb_publishable_. Chaves secretas e chaves JWT legadas não são aceitas por este verificador.');
  }
  return {url:url.origin,key};
}

export async function loadConfig(path) {
  let text;
  try { text=await readFile(path,'utf8'); }
  catch { throw new Error('Arquivo .env.local não encontrado. Copie .env.example e preencha os dois valores públicos.'); }
  return validateConfig(parseEnv(text));
}

export async function checkConnection(config,credentials,{fetchImpl=fetch,onStep=()=>{}}={}) {
  if(!credentials?.email?.trim() || !credentials?.password) throw new Error('Informe e-mail e senha da conta criada em Authentication > Users.');
  let token;
  async function readJson(response) {
    try {return await response.json();}
    catch {throw new Error('O Supabase retornou uma resposta inválida. Tente novamente e confira o estado do projeto.');}
  }
  async function request(path,options={}) {
    try {
      return await fetchImpl(config.url+path,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:config.key,'Content-Type':'application/json',...options.headers}});
    } catch { throw new Error('Não foi possível conectar ao Supabase. Confira internet, Project URL e se o projeto está ativo.'); }
  }
  try {
    const login=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:credentials.email.trim(),password:credentials.password})});
    if(!login.ok) {
      let code; try{const response=await login.json();code=response.error_code??response.code;}catch{}
      if(code==='email_not_confirmed') throw new Error('E-mail não confirmado. Confira a conta criada com Auto confirm user no painel.');
      if(login.status===400||login.status===401) throw new Error('Login recusado. Confira o e-mail, a senha do aplicativo e se a chave pertence ao mesmo projeto.');
      throw new Error(`Autenticação indisponível (HTTP ${login.status}). Confira o estado do projeto no painel.`);
    }
    const session=await readJson(login);token=session.access_token;
    if(typeof token!=='string'||!token) throw new Error('O serviço não retornou uma sessão válida.');
    onStep('Autenticação validada.');
    const authorization={Authorization:`Bearer ${token}`};
    const check=await request('/rest/v1/rpc/zenit_day_connection_check',{method:'POST',headers:authorization,body:'{}'});
    if(!check.ok) throw new Error(`Banco ainda não está pronto para o Zenit Day (HTTP ${check.status}). Execute a migração e confira a Data API.`);
    const readiness=await readJson(check);
    if(readiness.application!=='zenit-day'||readiness.schema_version!==1||readiness.authenticated!==true) throw new Error('A versão do banco é incompatível com este pacote de configuração.');
    onStep('Contrato do banco validado: versão 1.');
    for(const table of ['zenit_day_subjects','zenit_day_updates']) {
      const read=await request(`/rest/v1/${table}?select=id&limit=1`,{headers:authorization});
      if(!read.ok) throw new Error(`Leitura autenticada indisponível em ${table}. Confira a verificação SQL.`);
      const rows=await readJson(read);if(!Array.isArray(rows)) throw new Error('A Data API retornou um formato inesperado.');
      const anonymous=await request(`/rest/v1/${table}?select=id&limit=1`);
      if(![401,403].includes(anonymous.status)) throw new Error(`A consulta sem login não foi bloqueada como esperado em ${table}. Confira as permissões SQL.`);
    }
    onStep('Leitura autenticada disponível e leitura sem login bloqueada.');
    return {schemaVersion:1};
  } finally {
    if(token) {
      try {
        const logout=await request('/auth/v1/logout?scope=local',{method:'POST',headers:{Authorization:`Bearer ${token}`}});
        if(!logout.ok) onStep('A sessão temporária não pôde ser revogada; nenhum token foi gravado em arquivo.');
      } catch {onStep('A sessão temporária não pôde ser revogada; nenhum token foi gravado em arquivo.');}
      token=undefined;
    }
  }
}
