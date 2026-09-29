-- Replaces the free-text tax_county/tax_city place-name columns
-- (migration 0064) with numeric rate contributions, so the combined
-- checkout rate (sales_tax_pct) can be computed automatically — state
-- base rate + county rate + city rate — instead of requiring an org to
-- do that addition themselves and type one already-combined number.
-- (Migration 0064's original design deliberately left county/city as
-- descriptive-only text, to avoid taking on a full jurisdiction-rate
-- lookup table; this keeps that same boundary — no automatic lookup of
-- what a county's/city's rate *is* — but does let the app do the
-- arithmetic once staff has looked their own numbers up.)
--
-- Existing free-text place-name values (e.g. "Los Angeles County") are
-- dropped, not migrated — there's no reliable way to turn a place name
-- into a rate number automatically. Already-set sales_tax_pct values are
-- left untouched here (not recomputed) — a fair's current combined rate
-- is presumed correct as-is; these new fields simply start blank until
-- staff fills them in, at which point updateFair() (app/admin/fairs/
-- actions.ts) starts computing sales_tax_pct from them going forward.
alter table public.fairs
  drop column tax_county,
  drop column tax_city,
  add column tax_county_pct numeric(5, 4) check (
    tax_county_pct is null or tax_county_pct between 0 and 1
  ),
  add column tax_city_pct numeric(5, 4) check (
    tax_city_pct is null or tax_city_pct between 0 and 1
  );
