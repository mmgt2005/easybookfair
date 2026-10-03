-- A single standardized agreement for author inventory-request proposals,
-- replacing the old type-it-every-time terms_text field. Append-only:
-- editing the standard text creates a new version rather than mutating
-- the current one, so a request made under an earlier version keeps
-- exactly what it actually said (author_inventory_requests.terms_version/
-- terms_text snapshot it) even after the standard wording changes later.
create table public.inventory_terms_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  -- Supports {{line_items}}, {{total_wholesale_amount}}, {{author_name}},
  -- {{request_date}} merge tokens (lib/inventoryTerms.ts), resolved once
  -- at request-creation time into the frozen snapshot stored on that
  -- request -- never re-resolved later, so editing this template never
  -- changes an already-sent request's wording.
  terms_text text not null,
  -- Nullable: the seed row below is system-authored, not by a real admin.
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.inventory_terms_versions enable row level security;

create policy "inventory_terms_versions_admin_all" on public.inventory_terms_versions
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- Seed version 1: a clearly-labeled, non-legal-advice placeholder
-- structure, not authoritative legal wording. Written to be reusable
-- boilerplate (shipping/payment/ownership/returns/cancellation) an admin
-- is expected to review/replace via /admin/inventory-terms before
-- treating it as a real binding agreement -- same "clearly flag, don't
-- fabricate authority" posture as the seeded sales_tax_state_rates table.
insert into public.inventory_terms_versions (version, terms_text, created_by) values (
  1,
  E'INVENTORY RESTOCK AGREEMENT (TEMPLATE — NOT LEGAL ADVICE)\n\n'
  'This is a general-purpose template provided for convenience. It is '
  'not legal advice and has not been reviewed by an attorney. Replace '
  'or customize this text -- or have it reviewed by your own counsel -- '
  'before relying on it as a binding agreement.\n\n'
  '1. SCOPE\n'
  'Platform requests the following from {{author_name}}, as proposed on '
  '{{request_date}}:\n'
  '{{line_items}}\n'
  'Total wholesale amount: {{total_wholesale_amount}}\n\n'
  '2. SHIPPING\n'
  'Author agrees to ship the above quantities to the platform''s '
  'designated address within a reasonable time after accepting this '
  'request, using a trackable shipping method, and to record the '
  'tracking number in the app once shipped.\n\n'
  '3. PAYMENT\n'
  'Platform agrees to pay the total wholesale amount above once the '
  'units are received and confirmed in good condition, by whatever '
  'payment method is arranged directly between the parties outside this '
  'app.\n\n'
  '4. OWNERSHIP AND RISK OF LOSS\n'
  'Ownership and risk of loss transfer to the platform once the '
  'shipment is received at its designated address.\n\n'
  '5. DAMAGED OR DEFECTIVE UNITS\n'
  'Any units received damaged or defective will be addressed directly '
  'between the parties before payment is finalized.\n\n'
  '6. CANCELLATION\n'
  'Either party may cancel this request before shipment by notifying '
  'the other through the app.',
  null
);

alter table public.author_inventory_requests
  -- Which standard-terms version this request's terms_text was merged
  -- from -- null for any request created before this migration.
  add column terms_version integer references public.inventory_terms_versions (version),
  -- True only once the author has checked "I agree to these terms" as
  -- part of accepting. Kept separate from status = 'accepted' so it's an
  -- explicit, queryable acknowledgment record rather than an implication.
  add column terms_acknowledged boolean not null default false;

-- respond_to_inventory_request() gets a new required parameter -- a
-- signature change, so drop-then-recreate (same pattern already used in
-- this codebase for set_fair_sales_tax()'s signature widening) rather
-- than create-or-replace, which can't add a parameter without a default.
drop function if exists public.respond_to_inventory_request(uuid, boolean, text);

create or replace function public.respond_to_inventory_request(
  p_request_id uuid,
  p_accept boolean,
  p_author_note text,
  p_terms_acknowledged boolean
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
  if p_accept and not coalesce(p_terms_acknowledged, false) then
    raise exception 'you must agree to the terms to accept this request';
  end if;

  update public.author_inventory_requests
  set
    status = (case when p_accept then 'accepted' else 'declined' end)::public.author_inventory_request_status,
    author_note = nullif(trim(coalesce(p_author_note, '')), ''),
    terms_acknowledged = p_accept and p_terms_acknowledged,
    responded_at = now()
  where id = p_request_id;
end;
$$;

revoke execute on function public.respond_to_inventory_request(uuid, boolean, text, boolean) from public;
grant execute on function public.respond_to_inventory_request(uuid, boolean, text, boolean) to authenticated;
