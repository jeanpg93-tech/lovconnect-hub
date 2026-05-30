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
