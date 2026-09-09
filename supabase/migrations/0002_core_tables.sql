-- Generic updated_at maintenance, reused by every table below that has the column.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- organizations ---------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_email text,
  status public.application_status not null default 'pending',
  stripe_connect_account_id text unique,
  stripe_charges_enabled boolean not null default false,
  stripe_payouts_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.organizations
  for each row execute function app.set_updated_at();

-- platform_admins ---------------------------------------------------------
-- Minimal stand-in for a platform-admin role ahead of Phase 7's three-tier
-- role system: membership in this table is what RLS treats as full access.

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- org_members ---------------------------------------------------------

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_member_role not null default 'org_staff',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index org_members_user_id_idx on public.org_members (user_id);

-- catalog_items ---------------------------------------------------------

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  item_type public.item_type not null default 'book',
  title text not null,
  sku text unique,
  isbn text,
  cost numeric(10, 2) not null check (cost >= 0),
  price numeric(10, 2) not null check (price >= 0),
  image_url text,
  category text,
  tags text[] not null default '{}',
  description text,
  weight_oz numeric(10, 2),
  lead_time_days integer not null default 0 check (lead_time_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ISBN only needs to be unique among rows that actually have one (books).
create unique index catalog_items_isbn_key on public.catalog_items (isbn) where isbn is not null;

create trigger set_updated_at
  before update on public.catalog_items
  for each row execute function app.set_updated_at();

-- fairs ---------------------------------------------------------

create table public.fairs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  return_deadline date not null,
  status public.fair_status not null default 'scheduled',
  -- Overrides the platform-wide default assumption used by the petty-cash
  -- suggestion (docs/spec.md, "Petty cash suggestion"); null means "use the
  -- platform default".
  cash_sales_assumption_pct numeric(5, 4) check (
    cash_sales_assumption_pct is null
    or cash_sales_assumption_pct between 0 and 1
  ),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (return_deadline >= end_date)
);

create index fairs_org_id_idx on public.fairs (org_id);

create trigger set_updated_at
  before update on public.fairs
  for each row execute function app.set_updated_at();

-- allocations ---------------------------------------------------------

create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null references public.fairs (id) on delete cascade,
  catalog_item_id uuid not null references public.catalog_items (id),
  quantity_allocated integer not null check (quantity_allocated >= 0),
  quantity_returned integer not null default 0 check (quantity_returned >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fair_id, catalog_item_id),
  check (quantity_returned <= quantity_allocated)
);

create index allocations_fair_id_idx on public.allocations (fair_id);

create trigger set_updated_at
  before update on public.allocations
  for each row execute function app.set_updated_at();

-- carton_specs / packing_suggestions ---------------------------------------------------------

create table public.carton_specs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  length_in numeric(6, 2) not null check (length_in > 0),
  width_in numeric(6, 2) not null check (width_in > 0),
  height_in numeric(6, 2) not null check (height_in > 0),
  max_weight_oz numeric(10, 2) not null check (max_weight_oz > 0),
  created_at timestamptz not null default now()
);

create table public.packing_suggestions (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null references public.fairs (id) on delete cascade,
  carton_spec_id uuid not null references public.carton_specs (id),
  suggestion jsonb not null,
  created_at timestamptz not null default now()
);

create index packing_suggestions_fair_id_idx on public.packing_suggestions (fair_id);

-- restock_orders ---------------------------------------------------------

create table public.restock_orders (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.catalog_items (id),
  allocation_id uuid not null references public.allocations (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  status public.restock_order_status not null default 'pending',
  expected_arrival date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index restock_orders_allocation_id_idx on public.restock_orders (allocation_id);

create trigger set_updated_at
  before update on public.restock_orders
  for each row execute function app.set_updated_at();

-- promotions ---------------------------------------------------------

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.promotion_kind not null,
  config jsonb not null,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.promotions
  for each row execute function app.set_updated_at();

-- sales ---------------------------------------------------------

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null references public.fairs (id),
  catalog_item_id uuid not null references public.catalog_items (id),
  channel public.sale_channel not null,
  status public.sale_status not null default 'completed',
  -- Snapshots at time of sale — catalog cost/price can change later, but
  -- the ledger and settlement must reflect what was actually charged.
  price_charged numeric(10, 2) not null check (price_charged >= 0),
  wholesale_cost numeric(10, 2) not null check (wholesale_cost >= 0),
  -- Null for cash sales; groups units from the same checkout for receipts
  -- and whole-cart refunds otherwise.
  payment_intent_id text,
  promotion_id uuid references public.promotions (id),
  sold_at timestamptz not null default now(),
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  check (channel <> 'cash' or payment_intent_id is null)
);

create index sales_fair_id_idx on public.sales (fair_id);
create index sales_payment_intent_id_idx on public.sales (payment_intent_id);

-- webhook_events ---------------------------------------------------------
-- Idempotency guard the payment webhook depends on (docs/spec.md, "Payment
-- webhook"): check for the Stripe event ID before applying any write.

create table public.webhook_events (
  stripe_event_id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  payload jsonb
);
