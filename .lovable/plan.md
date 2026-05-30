# LovConnect License Hub — Plano (Supabase Externo, Portável)

Plataforma SaaS administrativa para gerenciar licenças da extensão Chrome LovConnect, revendedores e tokens de API. Frontend na Lovable (TanStack Start); **todo o backend roda em um Supabase externo oficial**. Visual premium dark/vermelho.

## Decisões confirmadas
- **Sem Lovable Cloud.** Banco, Auth, RLS, Edge Functions, Storage e secrets no **Supabase externo**.
- **Scaffold com placeholders**: `.env.example`, migrations SQL, cliente Supabase, Edge Functions e `SETUP.md`. Você preenche `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` depois.
- **Toda a lógica sensível nas Edge Functions** (gerar licença/token, hash, validação HWID, reset, revogação, exclusão, auditoria, saldo). Frontend só chama functions e lê dados via RLS.
- **Papéis** em `user_roles` + `has_role()`. **Login** email/senha. **Primeiro cadastro = admin**, demais = revendedor.
- **Edge Functions já existem como STUBS funcionais na Fase 1 + 2** (ver abaixo).

> Esta rodada entrega **FASE 1 + FASE 2** (com stubs das functions). Paro ao final antes das fases 3–7.

---

## Estrutura de arquivos (portabilidade)
```text
.env.example
supabase/
  config.toml
  migrations/
    0001_init_schema.sql
    0002_functions_triggers.sql
  functions/
    _shared/
      cors.ts                # headers CORS + helper de resposta
      json.ts                # respostas JSON padronizadas {ok,data,error,code}
      supabase-admin.ts      # client service role (lê SUPABASE_SERVICE_ROLE_KEY)
    reseller-api/index.ts    # STUB funcional: CORS, roteamento, envs, JSON
    validate-license/index.ts# STUB funcional: CORS, envs, JSON
src/integrations/supabase/client.ts
SETUP.md
```

---

## Edge Functions como stubs funcionais (Fase 1 + 2)
Mesmo com a lógica completa nas fases 4/5, as duas functions já serão criadas e implantáveis agora:
- **CORS completo**: handler `OPTIONS` (preflight) + headers em toda resposta (inclusive erro).
- **Roteamento**: `reseller-api` lê o sub-endpoint (`/status`, `/generate-trial`, etc.) via path/body e despacha.
- **Leitura de env/secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (com erro claro se faltarem).
- **Respostas JSON padronizadas**: envelope `{ ok, data, error, code }` com status corretos.
- **Health check**: `GET .../reseller-api/health` e `GET .../validate-license/health` retornam `{ ok: true, phase, version }`.
- **Endpoints ainda não implementados** retornam `501` + `{ ok:false, code:"NOT_IMPLEMENTED", error:"Disponível na próxima fase" }` (não quebram nada).
- **`validate-license`** stub: valida formato do payload, responde estrutura compatível com a extensão marcada como `phase: "stub"`.

### Comportamento dos botões do painel admin
Cada ação que depende de Edge Function:
1. **Chama a function** via `supabase.functions.invoke(...)` (ou fetch para `/functions/v1/...`).
2. Se a function responder `200` → executa normalmente.
3. Se responder `501 NOT_IMPLEMENTED` (ou env ausente) → exibe toast claro **“Função disponível na próxima fase”** sem quebrar a UI.
4. Sem credenciais configuradas → estado tratado com mensagem amigável.

---

## Fase 1 — Banco, Auth e conexão externa
1. **Cliente Supabase externo**: `@supabase/supabase-js` lendo `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Sem service role no frontend; aviso se env faltar.
2. **`.env.example`**.
3. **Migrations SQL**:
   - enum `app_role ('admin','reseller')`.
   - Tabelas: `profiles` (sem role), `user_roles`, `reseller_accounts`, `api_tokens`, `licenses`, `license_devices`, `license_sessions`, `plans`, `audit_logs`, `notifications`, `extension_versions`.
   - **GRANTs** explícitos + **RLS** em todas.
   - `has_role()` security definer; trigger `handle_new_user` (1º usuário→admin; demais→reseller).
   - Políticas: admin gerencia tudo; revendedor vê só os próprios; escritas sensíveis reservadas às Edge Functions (service role).
4. **Auth UI**: login/cadastro email+senha, guarda `_authenticated`, `onAuthStateChange`.

## Fase 2 — Painel Admin
Dark com sidebar (shadcn). Páginas:
1. **Dashboard**: cards (total, ativas, testes, vitalícias, expiradas, revogadas, sessões online, revendedores ativos, criadas hoje) + gráfico (recharts), via RLS.
2. **Licenças**: busca/filtros, vencimento, dispositivo, ações resetar/revogar/excluir (→ Edge Function, com fallback “próxima fase”), modal + histórico.
3. **Criar Licença**: form completo; chama Edge Function que (na fase 4) gera a chave e retorna **uma vez** (copiar) depois mascarada — no stub mostra mensagem de próxima fase.
4. **Revendedores**: listar/criar, limites, bloquear/desbloquear, uso used/max/remaining.
5. **Tokens de API**: listar/revogar, último uso.
6. **Notificações**: CRUD.
7. **Versões**: cadastrar versão, changelog, arquivo opcional (Storage externo), alerta.

### Geração de chaves/tokens (nas Edge Functions — fase 4/5)
Formatos: licença `LC-` (20), teste `TRIAL-` (16), token `rsl_` (24), CSPRNG. Banco guarda só hash sha256 + prefixo. Ações gravam `audit_logs`.

---

## SETUP.md (instruções de portabilidade)
Passo a passo claro:
1. **Criar projeto** no supabase.com (region, senha do DB, pegar URL + anon key).
2. **Preencher `.env`** (copiar de `.env.example`).
3. **Rodar migrations**: `supabase link` + `supabase db push` (ou aplicar SQL manualmente).
4. **Configurar secrets** das functions: `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...` (e demais).
5. **Deploy das functions**: `supabase functions deploy reseller-api` e `validate-license`.
6. **Testar CORS e health check**: exemplos `curl -X OPTIONS ...` e `curl .../functions/v1/reseller-api/health` esperando `{ ok:true }`.

---

## Identidade visual
Tokens em `src/styles.css` (oklch): vermelho `#FF1A1A`/glow `#FF3131`/escuro `#8B0000`, pretos `#050505`/`#111111`, grafite `#1C1C1E`, chumbo `#2B2B2F`, cinza `#BFC0C2`, branco `#F5F5F5`, sucesso `#22C55E`, aviso `#F59E0B`, erro `#EF4444`. Dark por padrão, glow vermelho sutil. Sem roxo.

---

## Fases seguintes (após revisão)
- **Fase 3**: painel revendedor.
- **Fase 4**: `reseller-api` completa (status, generate-trial, generate-license, list-licenses, reset-hwid, revoke-license, delete-license; auth `x-api-token` por hash; `last_used_at`; códigos 400/401/403/404/429/500).
- **Fase 5**: `validate-license` completa (HWID/sessão/heartbeat/online_count).
- **Fase 6**: documentação interna (exemplos JS/Python).
- **Fase 7**: polimento (loading, toasts, confirmações, copiar, mascaramento, contador, responsivo).

---

## Detalhes técnicos
- **Frontend**: TanStack Start (React 19) + Tailwind v4 + shadcn/ui + `@supabase/supabase-js`.
- **Backend**: 100% Supabase externo. Nada sensível depende do servidor interno da Lovable; sem `createServerFn` para lógica sensível — só client→Edge Functions e leituras RLS.
- **Env**: `VITE_*` no frontend; `SUPABASE_SERVICE_ROLE_KEY` só nas functions. Nunca expor service role.
- **Edge Functions**: Deno, padrão Supabase CLI, CORS, validação de input, service role para escritas.
- **Roles**: sempre `user_roles` + `has_role()`.
- **Migrations** versionadas; chaves/tokens só como hash.

Ao concluir Fase 1 + 2, paro e apresento o resultado.