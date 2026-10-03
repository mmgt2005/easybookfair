-- Lets an admin propose a restock of an existing catalog item directly to
-- the author who supplies it (quantity, wholesale amount, free-text
-- terms), and the author accept or decline it from their own portal.
-- catalog_items.cost is already this app's per-unit wholesale cost — the
-- natural source for "wholesale amount." receive_stock() (migration 0009)
-- already handles "more copies of an existing item arrived," reused as-is
-- once a request is marked received. Payment is manual/offline for now —
-- this table only records that and when a request was paid, it never
-- moves real money (a real payout rail is a documented future follow-up).
create type public.author_inventory_request_status as enum (
  'pending', 'accepted', 'declined', 'received', 'paid', 'cancelled'
);

create table public.author_inventory_requests (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references public.authors (user_id),
  catalog_item_id uuid not null references public.catalog_items (id),
  quantity_requested integer not null check (quantity_requested > 0),
  wholesale_cost_per_unit numeric(10, 2) not null check (wholesale_cost_per_unit >= 0),
  -- Snapshot of catalog_items.cost at proposal time (admin-editable), not
  -- a live reference — a later cost change on the catalog item never
  -- retroactively changes what was actually proposed/agreed to.
  wholesale_amount_total numeric(12, 2)
    generated always as (quantity_requested * wholesale_cost_per_unit) stored,
  terms_text text,
  status public.author_inventory_request_status not null default 'pending',
  admin_note text,
  author_note text,
  requested_by uuid not null references auth.users (id),
  responded_at timestamptz,
  received_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index author_inventory_requests_author_user_id_idx
  on public.author_inventory_requests (author_user_id);

create trigger set_updated_at
  before update on public.author_inventory_requests
  for each row execute function app.set_updated_at();

alter table public.author_inventory_requests enable row level security;

create policy "author_inventory_requests_admin_all" on public.author_inventory_requests
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

create policy "author_inventory_requests_author_select" on public.author_inventory_requests
  for select
  using (author_user_id = auth.uid());

-- Lets the author accept/decline their own pending request without a
-- broader self-UPDATE policy — mirrors update_author_profile()/
-- set_fundraiser_goal()'s "security definer, scoped to self or admin"
-- shape exactly. Admin-side actions (mark received/paid) go through the
-- plain admin_all RLS policy above instead, since those are admin-only
-- with no cross-role logic to enforce.
create or replace function public.respond_to_inventory_request(
  p_request_id uuid,
  p_accept boolean,
  p_author_note text
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
  if v_status <> 'pending' then
    raise exception 'request is no longer pending';
  end if;

  update public.author_inventory_requests
  set
    status = (case when p_accept then 'accepted' else 'declined' end)::public.author_inventory_request_status,
    author_note = nullif(trim(coalesce(p_author_note, '')), ''),
    responded_at = now()
  where id = p_request_id;
end;
$$;

revoke execute on function public.respond_to_inventory_request(uuid, boolean, text) from public;
grant execute on function public.respond_to_inventory_request(uuid, boolean, text) to authenticated;
