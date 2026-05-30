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
