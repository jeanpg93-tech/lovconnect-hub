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
