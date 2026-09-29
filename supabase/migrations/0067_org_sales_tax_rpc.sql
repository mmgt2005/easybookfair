-- Lets org staff set their own fair's sales tax rate — previously
-- admin-only, since fairs has no org-staff UPDATE policy at all (only
-- fairs_admin_write, migration 0005) and the admin edit page's version
-- (updateFair(), app/admin/fairs/actions.ts) writes sales_tax_pct
-- directly via the regular RLS-scoped client. Mirrors set_fundraiser_goal()
-- (migration 0063) and update_org_shipping_address() (migration 0066):
-- a narrow security-definer RPC scoped to just this concern, gated by the
-- existing app.can_operate_fair() (migration 0046), rather than opening a
-- broader write policy on fairs.
--
-- Recomputes sales_tax_pct the same way updateFair() does client-side
-- (state base rate + county + city) — duplicated here in SQL rather than
-- having updateFair() call this RPC internally, to avoid touching that
-- already-shipped, already-tested action; both must stay in sync if this
-- formula ever changes (state base + county rate + city rate, rounded to
-- 4 decimals, null when the total is exactly 0).
create or replace function public.set_fair_sales_tax(
  p_fair_id uuid,
  p_tax_state text,
  p_tax_county_pct numeric,
  p_tax_city_pct numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_rate numeric := 0;
  v_combined numeric;
begin
  if not app.can_operate_fair(p_fair_id) then
    raise exception 'not authorized';
  end if;

  if p_tax_county_pct is not null and (p_tax_county_pct < 0 or p_tax_county_pct > 1) then
    raise exception 'county rate must be between 0 and 1';
  end if;
  if p_tax_city_pct is not null and (p_tax_city_pct < 0 or p_tax_city_pct > 1) then
    raise exception 'city rate must be between 0 and 1';
  end if;

  if p_tax_state is not null then
    select base_rate into v_base_rate
    from public.sales_tax_state_rates
    where state_code = p_tax_state;

    if not found then
      raise exception 'unknown state code %', p_tax_state;
    end if;
  end if;

  v_combined := v_base_rate + coalesce(p_tax_county_pct, 0) + coalesce(p_tax_city_pct, 0);

  update public.fairs
  set
    tax_state = p_tax_state,
    tax_county_pct = p_tax_county_pct,
    tax_city_pct = p_tax_city_pct,
    sales_tax_pct = case when v_combined > 0 then round(v_combined, 4) else null end
  where id = p_fair_id;
end;
$$;

revoke execute on function public.set_fair_sales_tax(uuid, text, numeric, numeric) from public;
grant execute on function public.set_fair_sales_tax(uuid, text, numeric, numeric) to authenticated;
