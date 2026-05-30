-- ============================================================================
-- LovConnect License Hub — 0001 Initial schema
-- Tables, GRANTs, has_role(), and Row Level Security.
--
-- Portable migration for an EXTERNAL Supabase project.
-- To use with the Supabase CLI, copy this file into `supabase/migrations/`
-- (see SETUP.md), or run it directly in the SQL editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enum: application roles
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'reseller');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- profiles (no role here — roles live in user_roles)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

-- ---------------------------------------------------------------------------
-- reseller_accounts
-- ---------------------------------------------------------------------------
create table if not exists public.reseller_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  company_name text,
  max_licenses integer not null default 0,
  allow_lifetime boolean not null default false,
  trial_max_seconds integer not null default 0,
  normal_max_days integer not null default 0,
  valid_until timestamptz,
  blocked boolean not null default false,
  used_licenses integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.reseller_accounts to authenticated;
grant all on public.reseller_accounts to service_role;

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_days integer not null default 0,
  is_lifetime boolean not null default false,
  price numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.plans to authenticated;
grant all on public.plans to service_role;

-- ---------------------------------------------------------------------------
-- api_tokens (only hash + prefix stored)
-- ---------------------------------------------------------------------------
create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  token_prefix text not null,
  token_hash text not null,
  last_used_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

grant select on public.api_tokens to authenticated;
grant all on public.api_tokens to service_role;

-- ---------------------------------------------------------------------------
-- licenses (only hash + masked value stored)
-- ---------------------------------------------------------------------------
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_key_prefix text not null,
  license_key_hash text not null unique,
  masked_key text not null,
  client_name text,
  client_email text,
  type text not null default 'normal',        -- normal | trial | lifetime
  status text not null default 'active',       -- active | trial | expired | revoked
  lifetime boolean not null default false,     -- convenience flag for API/extension
  plan_id uuid references public.plans(id) on delete set null,
  reseller_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  notes text,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.licenses to authenticated;
grant all on public.licenses to service_role;

-- ---------------------------------------------------------------------------
-- license_devices (HWID bindings)
-- ---------------------------------------------------------------------------
create table if not exists public.license_devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  hwid text not null,
  device_name text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (license_id, hwid)
);

grant select on public.license_devices to authenticated;
grant all on public.license_devices to service_role;

-- ---------------------------------------------------------------------------
-- license_sessions (online tracking / heartbeats)
-- ---------------------------------------------------------------------------
create table if not exists public.license_sessions (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  hwid text,
  ip text,
  user_agent text,
  online boolean not null default true,
  started_at timestamptz not null default now(),
  last_heartbeat timestamptz not null default now()
);

grant select on public.license_sessions to authenticated;
grant all on public.license_sessions to service_role;

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

-- ---------------------------------------------------------------------------
-- notifications (consumed by the extension)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  type text not null default 'info',   -- info | warning | critical
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- ---------------------------------------------------------------------------
-- extension_versions
-- ---------------------------------------------------------------------------
create table if not exists public.extension_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  changelog text,
  download_url text,
  is_active boolean not null default true,
  force_update boolean not null default false,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.extension_versions to authenticated;
grant all on public.extension_versions to service_role;

-- ===========================================================================
-- has_role(): security definer to avoid recursive RLS
-- ===========================================================================
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- ===========================================================================
-- Enable RLS
-- ===========================================================================
alter table public.profiles            enable row level security;
alter table public.user_roles          enable row level security;
alter table public.reseller_accounts   enable row level security;
alter table public.plans               enable row level security;
alter table public.api_tokens          enable row level security;
alter table public.licenses            enable row level security;
alter table public.license_devices     enable row level security;
alter table public.license_sessions    enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.notifications       enable row level security;
alter table public.extension_versions  enable row level security;

-- ===========================================================================
-- Policies
-- ===========================================================================

-- profiles -----------------------------------------------------------------
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- user_roles ---------------------------------------------------------------
create policy "user_roles_select_own_or_admin" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- reseller_accounts --------------------------------------------------------
create policy "reseller_accounts_select" on public.reseller_accounts
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "reseller_accounts_admin_insert" on public.reseller_accounts
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "reseller_accounts_admin_update" on public.reseller_accounts
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "reseller_accounts_admin_delete" on public.reseller_accounts
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- plans --------------------------------------------------------------------
create policy "plans_select_all_auth" on public.plans
  for select to authenticated using (true);

create policy "plans_admin_insert" on public.plans
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));

create policy "plans_admin_update" on public.plans
  for update to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "plans_admin_delete" on public.plans
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- api_tokens (read-only from UI; writes via Edge Functions / service role) --
create policy "api_tokens_select_own_or_admin" on public.api_tokens
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- licenses (read-only from UI; writes via Edge Functions / service role) ----
create policy "licenses_select_own_or_admin" on public.licenses
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or reseller_id = auth.uid()
    or created_by = auth.uid()
  );

-- license_devices ----------------------------------------------------------
create policy "license_devices_select" on public.license_devices
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.licenses l
      where l.id = license_devices.license_id
        and (l.reseller_id = auth.uid() or l.created_by = auth.uid())
    )
  );

-- license_sessions ---------------------------------------------------------
create policy "license_sessions_select" on public.license_sessions
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.licenses l
      where l.id = license_sessions.license_id
        and (l.reseller_id = auth.uid() or l.created_by = auth.uid())
    )
  );

-- audit_logs (admin only) --------------------------------------------------
create policy "audit_logs_select_admin" on public.audit_logs
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- notifications ------------------------------------------------------------
create policy "notifications_select_all_auth" on public.notifications
  for select to authenticated using (true);

create policy "notifications_admin_insert" on public.notifications
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));

create policy "notifications_admin_update" on public.notifications
  for update to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "notifications_admin_delete" on public.notifications
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- extension_versions -------------------------------------------------------
create policy "extension_versions_select_all_auth" on public.extension_versions
  for select to authenticated using (true);

create policy "extension_versions_admin_insert" on public.extension_versions
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));

create policy "extension_versions_admin_update" on public.extension_versions
  for update to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "extension_versions_admin_delete" on public.extension_versions
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));
