-- Public bucket for catalog item images uploaded from the admin "Add item"
-- form. Public because these are meant to be shown on the storefront later
-- (Phase 4) — nothing sensitive lives in this bucket, unlike catalog_items
-- itself which also carries wholesale cost.
insert into storage.buckets (id, name, public)
values ('catalog-images', 'catalog-images', true)
on conflict (id) do nothing;

-- Only platform admins can upload/replace/delete; public read is handled
-- by the bucket's `public` flag above (Storage serves those objects over a
-- public URL without going through this table's RLS), so no separate
-- select policy is needed here.
create policy "catalog_images_admin_write" on storage.objects
  for all
  using (bucket_id = 'catalog-images' and app.is_platform_admin())
  with check (bucket_id = 'catalog-images' and app.is_platform_admin());
