# LovConnect License Hub — Setup (Supabase Externo)

Este projeto é **portável** e usa um **Supabase externo oficial** (criado em
[supabase.com](https://supabase.com)) como backend. A Lovable cuida apenas do
frontend. Banco, Auth, RLS, Edge Functions, Storage e secrets ficam no **seu**
Supabase.

> Resumo: crie o projeto no Supabase → preencha `.env` → rode as migrations →
> configure os secrets → faça deploy das functions → teste health/CORS.

---

## 1. Criar o projeto no Supabase

1. Acesse <https://supabase.com/dashboard> e clique em **New project**.
2. Escolha a organização, dê um nome (ex.: `lovconnect-license-hub`), defina a
   **senha do banco** e a **região** mais próxima dos seus usuários.
3. Aguarde o provisionamento (~2 min).
4. Em **Project Settings → API**, copie:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → usada só nas functions (passo 4). **Nunca** no frontend.

---

## 2. Preencher o `.env`

Copie o exemplo e preencha:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Reinicie o dev server depois de editar o `.env`.

---

## 3. Rodar as migrations

As migrations versionadas estão em **`database/migrations/`**:

- `0001_init_schema.sql` — enum, tabelas, GRANTs, `has_role()` e RLS.
- `0002_functions_triggers.sql` — `updated_at`, `handle_new_user()` (primeiro
  cadastro vira **admin**, os demais viram **reseller**).

### Opção A — Supabase CLI (recomendado)

```bash
# Instale o CLI: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref SEU_PROJECT_REF

# Copie as migrations para a pasta padrão do CLI
mkdir -p supabase/migrations
cp database/migrations/*.sql supabase/migrations/

supabase db push
```

### Opção B — SQL Editor (manual)

No Dashboard → **SQL Editor**, cole e execute o conteúdo de
`0001_init_schema.sql` e depois `0002_functions_triggers.sql`, nessa ordem.

> O **primeiro usuário** que se cadastrar no painel se torna **admin**
> automaticamente. Cadastre-se primeiro.

---

## 4. Configurar os secrets das Edge Functions

`SUPABASE_URL` e `SUPABASE_ANON_KEY` já existem no ambiente das functions.
Você só precisa definir a **service role key**:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...service_role...
```

Confirme:

```bash
supabase secrets list
```

---

## 5. Deploy das Edge Functions

As functions estão em `supabase/functions/`:

- `reseller-api` — API de revenda (`x-api-token`). Stub agora, completa na Fase 4.
- `validate-license` — validação para a extensão. Stub agora, completa na Fase 5.

```bash
supabase functions deploy reseller-api
supabase functions deploy validate-license
```

> `supabase/config.toml` já define `verify_jwt = false` para ambas, pois elas
> usam autenticação própria (token de API / chamada direta da extensão).

---

## 6. Testar CORS e health check

Substitua `SEU-PROJETO` pela sua URL.

### Health check (GET)

```bash
curl -s https://SEU-PROJETO.supabase.co/functions/v1/reseller-api/health
# => {"ok":true,"data":{"service":"reseller-api","phase":"stub",...},"error":null,"code":null}

curl -s https://SEU-PROJETO.supabase.co/functions/v1/validate-license/health
# => {"ok":true,"data":{"service":"validate-license","phase":"stub",...}}
```

### Preflight CORS (OPTIONS)

```bash
curl -i -X OPTIONS \
  -H "Origin: https://exemplo.com" \
  -H "Access-Control-Request-Method: POST" \
  https://SEU-PROJETO.supabase.co/functions/v1/validate-license
# Deve retornar 204 com Access-Control-Allow-Origin: *
```

### validate-license (POST, stub)

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"license_key":"LC-XXXX","hwid":"device-123"}' \
  https://SEU-PROJETO.supabase.co/functions/v1/validate-license
# => {"ok":true,"code":"STUB_RESPONSE","data":{"phase":"stub","valid":false,...}}
```

Endpoints ainda não implementados respondem **501** com
`{"code":"NOT_IMPLEMENTED"}` — comportamento esperado nesta fase.

---

## Segurança (resumo)

- A **service role key nunca** vai para o frontend nem para o `.env` do Vite.
- Toda escrita sensível (gerar licença/token, hash, reset HWID, revogação,
  exclusão, auditoria) acontece dentro das Edge Functions com service role.
- O frontend lê dados apenas via RLS com a **anon key**.
- Papéis ficam em `user_roles` + `has_role()` — nunca em `profiles`.
