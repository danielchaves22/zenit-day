# Zenit Day

Acompanhamento pessoal de assuntos em Windows e Android. Reúne próximas ações, prazos, retomadas, responsáveis, checklist e lembretes, com persistência local e sincronização entre dispositivos.

## Uso

Comece pelo [primeiro uso](docs/PRIMEIRO_USO.md) ou pelos [guias públicos](https://zenitapp.net/docs/help/zenit-day/getting-started/). O responsável de um assunto é informação de acompanhamento; preenchê-lo não compartilha os dados com outra pessoa.

A versão declarada em package.json é 0.1.9. Hoje, Acompanhamentos, Concluídos e Arquivados organizam os assuntos; Meta de hoje, grupo/subgrupo e prioridade acrescentam contexto sem substituir status, prazo ou retomada. A gestão de lembretes fica no sino do cabeçalho. O Hub pode entregar esses lembretes no WhatsApp após autorização e assinatura separadas.

## Desenvolvimento

Requer Node.js 22.14 ou superior. Para o aplicativo nativo, instale também Rust e as ferramentas da plataforma exigidas pelo Tauri.

```powershell
npm ci
Copy-Item .env.example .env.local
# Configure somente URL e chave publicável do projeto.
npm run dev
```

No navegador de desenvolvimento, os dados usam IndexedDB e a sessão fica em memória. O aplicativo nativo usa SQLite; tokens são protegidos por DPAPI no Windows e Android Keystore no Android. Senhas não são persistidas.

```powershell
npm run tauri dev
npm run tauri build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android.ps1
```

O script Android configura JDK/SDK/NDK somente no processo. URL e chave publicável são incorporadas pelo Vite durante o build; trocar o projeto exige recompilar. Nunca use chave administrativa no cliente. A preparação do banco e as migrações estão no [manual Supabase](docs/SUPABASE_PASSO_A_PASSO.md) e nos guias de atualização.

## Validação

```powershell
npm run typecheck
npm test
npm run test:app
npm run test:e2e
npm run test:database:embedded
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

npm run test:database usa PostgreSQL em container descartável; a variante embedded usa PGlite em memória. Ambas simulam Auth. Testes de navegador também simulam serviços. Login hospedado, sincronização real, Android físico, instaladores e entrega via WhatsApp são verificações separadas, registradas com data nos relatórios.

## Referências técnicas

- [Índice da documentação](docs/README.md)
- [Contrato de persistência e sincronização](docs/SUPABASE_CONTRATO.md)
- [OAuth e integração com o Hub](docs/ZENIT_HUB.md)
- [Recorrência, consentimento e notificações](docs/LEMBRETES.md)

As notas ATUALIZACAO*\* e VALIDACAO*\* preservam o histórico das versões. Elas não substituem a conferência da versão atual no código nem comprovam o estado presente dos serviços.
