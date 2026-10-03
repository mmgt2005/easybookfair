-- Lets one inventory-request proposal (author_inventory_requests,
-- migration 0071) cover more than one book at once, instead of being
-- pinned to a single catalog_item_id/quantity/cost. Mirrors a real
-- purchase order's "header + line items" shape -- the single Accept/
-- Decline/status still applies to the whole request as one package (one
-- legal agreement, one shipment), not per item.
create table public.author_inventory_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.author_inventory_requests (id) on delete cascade,
  catalog_item_id uuid not null references public.catalog_items (id),
  quantity_requested integer not null check (quantity_requested > 0),
  wholesale_cost_per_unit numeric(10, 2) not null check (wholesale_cost_per_unit >= 0),
  wholesale_amount_total numeric(12, 2)
    generated always as (quantity_requested * wholesale_cost_per_unit) stored,
  created_at timestamptz not null default now()
);

create index author_inventory_request_items_request_id_idx
  on public.author_inventory_request_items (request_id);

alter table public.author_inventory_request_items enable row level security;

create policy "author_inventory_request_items_admin_all" on public.author_inventory_request_items
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- Same visibility as the parent request: the owning author can read
-- their own request's line items.
create policy "author_inventory_request_items_author_select" on public.author_inventory_request_items
  for select
  using (
    request_id in (
      select id from public.author_inventory_requests where author_user_id = auth.uid()
    )
  );

-- Backfill: every request that already exists becomes a one-item request
-- under the new shape, so nothing created before this migration loses
-- its book/quantity/cost.
insert into public.author_inventory_request_items
  (request_id, catalog_item_id, quantity_requested, wholesale_cost_per_unit, created_at)
select id, catalog_item_id, quantity_requested, wholesale_cost_per_unit, created_at
from public.author_inventory_requests;

alter table public.author_inventory_requests
  -- wholesale_amount_total is a generated column derived from the two
  -- columns below -- it must be dropped first, or Postgres rejects
  -- dropping quantity_requested/wholesale_cost_per_unit out from under it
  -- even within the same ALTER TABLE statement.
  drop column wholesale_amount_total,
  drop column catalog_item_id,
  drop column quantity_requested,
  drop column wholesale_cost_per_unit,
  -- Filled in by the author (or admin) once shipped -- optional,
  -- informational only; nothing in this app verifies it against a real
  -- carrier's tracking API.
  add column tracking_number text;

-- Lets the author (or admin) record/update the shipment tracking number
-- once the request has actually been accepted -- mirrors
-- respond_to_inventory_request()'s "self or admin" security-definer
-- shape exactly, for the same reason (no broader self-UPDATE policy).
create or replace function public.set_inventory_request_tracking_number(
  p_request_id uuid,
  p_tracking_number text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_user_id uuid;
  v_status public.author_inventory_request_status;
begin
  select author_user_id, status into v_author_user_id, v_status
  from public.author_inventory_requests
  where id = p_request_id
  for update;

  if v_author_user_id is null then
    raise exception 'request % not found', p_request_id;
  end if;
  if not (app.is_platform_admin() or auth.uid() = v_author_user_id) then
    raise exception 'not authorized';
  end if;
  if v_status not in ('accepted', 'received', 'paid') then
    raise exception 'request must be accepted before adding a tracking number';
  end if;

  update public.author_inventory_requests
  set tracking_number = nullif(trim(coalesce(p_tracking_number, '')), '')
  where id = p_request_id;
end;
$$;

revoke execute on function public.set_inventory_request_tracking_number(uuid, text) from public;
grant execute on function public.set_inventory_request_tracking_number(uuid, text) to authenticated;
