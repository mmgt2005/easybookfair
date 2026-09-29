-- Lets an org (via /join, and later on its own dashboard) record where
-- physical inventory should be shipped for its fairs — nothing tracked
-- this today; allocation/receiving assumed an admin already knew the
-- address out of band. Mirrors org_signups' existing "stage on the
-- signup, copy onto organizations on approval" pattern used for
-- org_name/contact_name/contact_email/is_school.
alter table public.org_signups
  add column shipping_contact_name text,
  add column shipping_contact_phone text,
  add column shipping_address_line1 text,
  add column shipping_address_line2 text,
  add column shipping_city text,
  add column shipping_state text,
  add column shipping_postal_code text,
  add column shipping_country text not null default 'US';

alter table public.organizations
  add column shipping_contact_name text,
  add column shipping_contact_phone text,
  add column shipping_address_line1 text,
  add column shipping_address_line2 text,
  add column shipping_city text,
  add column shipping_state text,
  add column shipping_postal_code text,
  add column shipping_country text not null default 'US';

-- organizations_admin_write (migration 0005) is the only write policy on
-- this table — org staff can already SELECT their own org (organizations_
-- select) but can't UPDATE it directly. Rather than open a broader write
-- policy, add a narrow security definer RPC scoped to just the shipping
-- fields, mirroring set_fundraiser_goal()'s exact reasoning (migration
-- 0063) for the same "fairs has no org-staff UPDATE policy" situation.
--
-- app.can_operate_org() generalizes app.can_operate_fair() (migration
-- 0046) one level up: true for a platform admin, or an authenticated org
-- member of this specific org (any role — this is contact info, not a
-- money or staff-role change, so it doesn't need the org_admin-only bar
-- the staff-invite flow uses).
create or replace function app.can_operate_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app.is_platform_admin()
    or p_org_id in (select app.current_org_ids());
$$;

grant execute on function app.can_operate_org(uuid) to authenticated;

create or replace function public.update_org_shipping_address(
  p_org_id uuid,
  p_shipping_contact_name text,
  p_shipping_contact_phone text,
  p_shipping_address_line1 text,
  p_shipping_address_line2 text,
  p_shipping_city text,
  p_shipping_state text,
  p_shipping_postal_code text,
  p_shipping_country text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app.can_operate_org(p_org_id) then
    raise exception 'not authorized';
  end if;

  update public.organizations
  set
    shipping_contact_name = p_shipping_contact_name,
    shipping_contact_phone = p_shipping_contact_phone,
    shipping_address_line1 = p_shipping_address_line1,
    shipping_address_line2 = p_shipping_address_line2,
    shipping_city = p_shipping_city,
    shipping_state = p_shipping_state,
    shipping_postal_code = p_shipping_postal_code,
    shipping_country = coalesce(nullif(trim(p_shipping_country), ''), 'US')
  where id = p_org_id;
end;
$$;

revoke execute on function public.update_org_shipping_address(
  uuid, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.update_org_shipping_address(
  uuid, text, text, text, text, text, text, text, text
) to authenticated;
