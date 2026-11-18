-- A fair's optional thermal receipt printer, for the direct-network-print
-- path (app/admin/fairs/[fairId]/checkout/CheckoutClient.tsx, "Print to
-- thermal printer"): an Epson printer on the same local WiFi as the
-- checkout device, reachable at this address over its own built-in
-- ePOS-Print HTTP API — no driver/app needed, which is what makes
-- printing from a tablet/phone (not just a computer) possible at all.
-- A simple nullable text field, not the multi-step Stripe Terminal
-- location flow (stripe_terminal_location_id, migration 0014) — this is
-- just one address staff type in once, same pattern as
-- equipment_rental_fee/cash_sales_assumption_pct.
alter table public.fairs
  add column thermal_printer_url text;
