import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig,checkConnection } from '../scripts/supabase-connection.mjs';

const config={url:'https://exampleproject.supabase.co',key:'sb_publishable_test_public_value'};
test('configuração aceita apenas URL do projeto e chave publicável',()=>{
  assert.deepEqual(validateConfig({VITE_SUPABASE_URL:config.url,VITE_SUPABASE_PUBLISHABLE_KEY:config.key}),config);
  for(const key of ['sb_secret_admin','eyJhbGciOi...','']) assert.throws(()=>validateConfig({VITE_SUPABASE_URL:config.url,VITE_SUPABASE_PUBLISHABLE_KEY:key}));
  for(const url of ['http://exampleproject.supabase.co','https://exampleproject.supabase.co.attacker.example','https://exampleproject.supabase.co/rest/v1','https://user:pass@exampleproject.supabase.co','https://exampleproject.supabase.co?x=1']) assert.throws(()=>validateConfig({VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:config.key}));
});

function fakeService({publicAccess=false,failContract=false}={}) {
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    assert.equal(options.redirect,'error');
    if(url.includes('/token?')) return Response.json({access_token:'token-only-in-memory'});
    if(url.includes('/logout?')) return new Response(null,{status:204});
    if(url.includes('/rpc/')) return failContract?new Response(null,{status:404}):Response.json({application:'zenit-day',schema_version:1,authenticated:true});
    if(options.headers.Authorization||publicAccess) return Response.json([]);
    return new Response(null,{status:403});
  };
  return {calls,fetchImpl};
}

test('verifica autenticação e leitura, não grava assuntos e encerra apenas sua sessão',async()=>{
  const service=fakeService();const output=[];
  assert.deepEqual(await checkConnection(config,{email:'me@example.com',password:'test-only'},{fetchImpl:service.fetchImpl,onStep:s=>output.push(s)}),{schemaVersion:1});
  assert.equal(service.calls.length,7);
  assert.ok(service.calls.at(-1).url.endsWith('/auth/v1/logout?scope=local'));
  assert.equal(service.calls.filter(c=>c.options.method==='POST').length,3);
  assert.ok(!service.calls.some(c=>c.url.includes('save_subject')));
  assert.ok(!output.join().includes('token-only-in-memory'));
  assert.ok(!output.join().includes('test-only'));
});

test('falha quando leitura anônima está liberada',async()=>{
  const service=fakeService({publicAccess:true});
  await assert.rejects(checkConnection(config,{email:'me@example.com',password:'test-only'},{fetchImpl:service.fetchImpl}),/sem login não foi bloqueada/);
  assert.ok(service.calls.at(-1).url.includes('/logout?scope=local'));
});

test('falha sem migração e ainda revoga a sessão temporária',async()=>{
  const service=fakeService({failContract:true});
  await assert.rejects(checkConnection(config,{email:'me@example.com',password:'test-only'},{fetchImpl:service.fetchImpl}),/Banco ainda não está pronto/);
  assert.ok(service.calls.at(-1).url.includes('/logout?scope=local'));
});

test('erros de login não reproduzem corpos com dados sensíveis',async()=>{
  const fetchImpl=async()=>Response.json({error_code:'invalid_credentials',message:'secret-from-server'},{status:400});
  await assert.rejects(checkConnection(config,{email:'me@example.com',password:'test-only'},{fetchImpl}),error=>error.message.includes('Login recusado')&&!error.message.includes('secret-from-server'));
});

test('JSON malformado não reproduz o corpo da autenticação',async()=>{
  const fetchImpl=async()=>new Response('sensitive-value-not-json',{status:200});
  await assert.rejects(checkConnection(config,{email:'me@example.com',password:'test-only'},{fetchImpl}),error=>error.message.includes('resposta inválida')&&!error.message.includes('sensitive-value'));
});
