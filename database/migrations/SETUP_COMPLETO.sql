-- ============================================================================
-- LovConnect — SETUP COMPLETO (rode este arquivo UMA vez no SQL Editor do Supabase)
-- Cria todo o schema + funções + libera acesso, e torna jean.gomes@outlook.com ADMIN.
-- Seguro para rodar mais de uma vez (idempotente).
-- ============================================================================

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
-- license_devices (device bindings — only a hash of device_id is stored)
-- ---------------------------------------------------------------------------
create table if not exists public.license_devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_id_hash text not null,
  device_name text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (license_id, device_id_hash)
);

grant select on public.license_devices to authenticated;
grant all on public.license_devices to service_role;

-- ---------------------------------------------------------------------------
-- license_sessions (online tracking / heartbeats — only a hash of device_id)
-- ---------------------------------------------------------------------------
create table if not exists public.license_sessions (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_id_hash text,
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


-- ============================================================================
-- LovConnect License Hub — 0002 Functions & triggers
--   - set_updated_at(): keeps updated_at fresh
--   - handle_new_user(): first signup becomes admin, others become reseller
-- ============================================================================

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_reseller_accounts_updated_at on public.reseller_accounts;
create trigger trg_reseller_accounts_updated_at
  before update on public.reseller_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_licenses_updated_at on public.licenses;
create trigger trg_licenses_updated_at
  before update on public.licenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- handle_new_user(): create profile + assign role on signup
--   First user ever -> admin. Everyone else -> reseller (+ reseller_accounts).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first_user boolean;
begin
  -- profile
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;

  -- is there any admin yet?
  select not exists (
    select 1 from public.user_roles where role = 'admin'
  ) into is_first_user;

  if is_first_user then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  else
    insert into public.user_roles (user_id, role)
    values (new.id, 'reseller')
    on conflict (user_id, role) do nothing;

    insert into public.reseller_accounts (user_id, company_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- LovConnect License Hub — 0003 Approval workflow
--   - profiles.status: pending | approved | rejected
--   - New (non-first) signups stay 'pending' with NO role until an admin
--     approves them. First signup becomes admin and is auto-approved.
--   - approve_user() / reject_user(): admin-only RPCs used by the panel.
--   - Backfill: ensures profiles exist for current auth.users and promotes
--     the oldest existing user to admin when no admin exists yet.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles.status
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists status text not null default 'pending';

-- normalize any unexpected values
update public.profiles
  set status = 'pending'
  where status not in ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- handle_new_user(): first user -> admin (approved); others -> pending, no role
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first_user boolean;
begin
  select not exists (
    select 1 from public.user_roles where role = 'admin'
  ) into is_first_user;

  insert into public.profiles (id, email, full_name, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    case when is_first_user then 'approved' else 'pending' end
  )
  on conflict (id) do nothing;

  if is_first_user then
    -- First account ever becomes the admin.
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;
  -- Everyone else stays pending with NO role until an admin approves them.

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- approve_user(): admin grants reseller access + creates reseller account
-- ---------------------------------------------------------------------------
create or replace function public.approve_user(_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only admins can approve users';
  end if;

  update public.profiles set status = 'approved' where id = _user_id;

  insert into public.user_roles (user_id, role)
  values (_user_id, 'reseller')
  on conflict (user_id, role) do nothing;

  insert into public.reseller_accounts (user_id, company_name)
  select _user_id, coalesce(p.full_name, p.email)
  from public.profiles p
  where p.id = _user_id
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.approve_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- reject_user(): admin revokes reseller access
-- ---------------------------------------------------------------------------
create or replace function public.reject_user(_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only admins can reject users';
  end if;

  update public.profiles set status = 'rejected' where id = _user_id;
  delete from public.user_roles where user_id = _user_id and role = 'reseller';
  delete from public.reseller_accounts where user_id = _user_id;
end;
$$;

grant execute on function public.reject_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill existing auth.users (e.g. accounts created before migrations ran)
-- ---------------------------------------------------------------------------
insert into public.profiles (id, email, full_name, status)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  'pending'
from auth.users u
on conflict (id) do nothing;

-- If there is no admin yet, promote the oldest existing user.
do $$
declare
  first_uid uuid;
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    select id into first_uid from auth.users order by created_at asc limit 1;
    if first_uid is not null then
      insert into public.user_roles (user_id, role)
      values (first_uid, 'admin')
      on conflict (user_id, role) do nothing;

      update public.profiles set status = 'approved' where id = first_uid;
    end if;
  end if;
end$$;


-- ============================================================================
-- LovConnect License Hub — 0004 Disable approval workflow (for now)
--   - Every new signup is auto-approved as a 'reseller' (first user = admin).
--   - No more 'pending' gating: existing pending users are promoted to reseller.
--   - approve_user/reject_user RPCs are kept so the flow can be re-enabled later.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- handle_new_user(): first user -> admin, everyone else -> approved reseller
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first_user boolean;
begin
  select not exists (
    select 1 from public.user_roles where role = 'admin'
  ) into is_first_user;

  insert into public.profiles (id, email, full_name, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    'approved'
  )
  on conflict (id) do update set status = 'approved';

  if is_first_user then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  else
    -- Approval disabled: grant reseller access immediately.
    insert into public.user_roles (user_id, role)
    values (new.id, 'reseller')
    on conflict (user_id, role) do nothing;

    insert into public.reseller_accounts (user_id, company_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: promote every currently-pending user to approved reseller
-- ---------------------------------------------------------------------------
-- Approve all profiles.
update public.profiles set status = 'approved' where status <> 'approved';

-- Give reseller role to anyone who has no role yet.
insert into public.user_roles (user_id, role)
select u.id, 'reseller'
from auth.users u
where not exists (
  select 1 from public.user_roles r where r.user_id = u.id
)
on conflict (user_id, role) do nothing;

-- Make sure each reseller has a reseller_accounts row.
insert into public.reseller_accounts (user_id, company_name)
select r.user_id, coalesce(p.full_name, p.email)
from public.user_roles r
join public.profiles p on p.id = r.user_id
where r.role = 'reseller'
on conflict (user_id) do nothing;


-- ============================================================================
-- Garante que jean.gomes@outlook.com seja ADMIN aprovado
-- ============================================================================
do $$
declare
  uid uuid;
begin
  select id into uid from auth.users where email = 'jean.gomes@outlook.com';
  if uid is null then
    raise notice 'jean.gomes@outlook.com ainda nao tem conta criada — cadastre-se primeiro.';
  else
    insert into public.profiles (id, email, status)
    values (uid, 'jean.gomes@outlook.com', 'approved')
    on conflict (id) do update set status = 'approved';

    insert into public.user_roles (user_id, role)
    values (uid, 'admin')
    on conflict (user_id, role) do nothing;
  end if;
end$$;
