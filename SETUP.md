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

- `reseller-api` — API de revenda (`x-api-token` / JWT). **Completa (Fase 4)** — veja o contrato no fim deste arquivo.
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
# => {"ok":true,"data":{"service":"reseller-api","phase":"live","version":"1.0.0",...},"error":null,"code":null}

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
  -d '{"license_key":"LC-XXXX","device_id":"device-123","session_id":null,"heartbeat":true}' \
  https://SEU-PROJETO.supabase.co/functions/v1/validate-license
# Resposta TOP-LEVEL compatível com a extensão (data.valid no topo):
# => {"valid":false,"message":"Validação real disponível na próxima fase.",
#     "reason":"stub","session_id":null,"user_name":null,"expires_at":null,
#     "activated_at":null,"status":"stub","lifetime":false,"online_count":0,"phase":"stub"}
```


Endpoints ainda não implementados respondem **501** com
`{"code":"NOT_IMPLEMENTED"}` — comportamento esperado nesta fase.

---

## Contrato da `reseller-api` (Fase 4 — final)

Base: `POST https://SEU-PROJETO.supabase.co/functions/v1/reseller-api/<endpoint>`

Autenticação (uma das duas):

- `x-api-token: rsl_...` — integrações externas de revenda.
- `Authorization: Bearer <jwt>` — usuários logados do painel (admin/revendedor).

Resposta padrão: `{"ok":true,"data":{...},"error":null,"code":null}` ou
`{"ok":false,"data":null,"error":"mensagem","code":"CODIGO"}`.

### Padrão das chaves

| Tipo | Prefixo | Exemplo |
|------|---------|---------|
| Licença normal/vitalícia | `LC-` | `LC-ABCDE-FGHJK-LMNPQ-RSTUV` |
| Licença de teste | `TRIAL-` | `TRIAL-ABCDE-FGHJK-LMNPQ-RSTUV` |
| Token de API | `rsl_` | `rsl_<40 chars>` |

> O banco guarda apenas o **hash SHA-256** + prefixo/máscara. A chave completa
> é retornada **uma única vez**, na criação.

### Endpoints de revenda

- **`/status`** — uso/limites da conta (`max_licenses`, `used_licenses`,
  `remaining`, `allow_lifetime`, `trial_max_seconds`, `normal_max_days`,
  `valid_until`, `blocked`).

- **`/generate-trial`** — gera licença de teste (**não consome crédito**).
  Duração aceita em `trial_seconds`, `minutes` e/ou `seconds` (somados em
  segundos). Respeita `trial_max_seconds`. Body: `client_name`,
  `client_email`, `reseller_user_id` (admin).

- **`/generate-license`** — gera licença normal ou vitalícia (**consome 1
  crédito**). Vitalícia via `type:"lifetime"` **ou** `lifetime:true`. Duração
  da normal via objeto `duration:{days,hours,minutes,seconds}` **ou** campos
  diretos `days`/`hours`/`minutes`/`seconds`. Respeita `normal_max_days`,
  `allow_lifetime` e saldo (`NO_CREDITS`).

- **`/list-licenses`** — lista licenças. Parâmetros:
  - `status`: `all` | `active` | `trial` | `expired` | `revoked`
  - `page` (≥1), `per_page` (1–200, padrão 20)
  - `search`: filtra por `masked_key`, `client_name` ou `client_email`
  - Retorno: `{licenses, page, per_page, total, total_pages}`

- **`/reset-hwid`**, **`/revoke-license`**, **`/delete-license`** — aceitam
  `license_id` **ou** `license_key` (a chave é hasheada e localizada por
  `license_key_hash`). `delete-license` só remove licenças `expired`/`revoked`.

- **`/create-token`** — cria token `rsl_`. Admin pode informar
  `user_id`/`reseller_user_id` para criar token de um revendedor específico;
  sem isso, cria para o próprio usuário logado.

- **`/list-tokens`**, **`/revoke-token`** — lista/revoga tokens (`token_id`).

### Endpoints de administração

- **`/admin-list-resellers`** — lista contas de revenda + perfil.
- **`/admin-update-reseller`** — cria/atualiza conta: `company_name`,
  `max_licenses`, `allow_lifetime`, `trial_max_seconds`, `normal_max_days`,
  `valid_until`, `blocked`.
- **`/admin-recalc-usage`** — recalcula `used_licenses` da conta.

### Regras de negócio

- Trial **não** consome limite; licença normal e vitalícia consomem **1
  crédito** cada.
- Contas bloqueadas ou expiradas não geram licenças (`BLOCKED`,
  `ACCOUNT_EXPIRED`).
- Todas as ações sensíveis são registradas em `audit_logs`.

### Códigos de erro comuns

`UNAUTHENTICATED`, `INVALID_API_TOKEN`, `TOKEN_REVOKED`, `NO_ROLE`,
`NO_RESELLER_ACCOUNT`, `BLOCKED`, `ACCOUNT_EXPIRED`, `LIFETIME_NOT_ALLOWED`,
`TRIAL_LIMIT`, `DURATION_LIMIT`, `NO_CREDITS`, `NOT_FOUND`, `FORBIDDEN`,
`NOT_DELETABLE`, `ADMIN_ONLY`, `MISSING_ID`, `DB_ERROR`.

---

## Segurança (resumo)





- A **service role key nunca** vai para o frontend nem para o `.env` do Vite.
- Toda escrita sensível (gerar licença/token, hash, reset HWID, revogação,
  exclusão, auditoria) acontece dentro das Edge Functions com service role.
- O frontend lê dados apenas via RLS com a **anon key**.
- Papéis ficam em `user_roles` + `has_role()` — nunca em `profiles`.
