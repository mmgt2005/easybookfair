-- Lets a message in author_messages carry an optional image/PDF
-- attachment, uploaded the same way author_submissions' cover
-- images/interior PDF and catalog_items' cover image already are
-- (crypto.randomUUID() filename, public bucket, no signed URLs).
-- Nullable — a message can be text-only (as today), attachment-only, or
-- both. attachment_content_type drives image-vs-link rendering
-- client-side without guessing from the filename extension.
alter table public.author_messages
  add column attachment_url text,
  add column attachment_filename text,
  add column attachment_content_type text;

-- Was: check (length(trim(body)) > 0) — rejected an attachment-only
-- message outright. Drop and recreate to also allow an empty body when
-- an attachment is present.
alter table public.author_messages
  drop constraint if exists author_messages_body_check;
alter table public.author_messages
  alter column body set default '';
alter table public.author_messages
  add constraint author_messages_body_check
  check (length(trim(body)) > 0 or attachment_url is not null);

-- Public bucket, same posture as author-submissions/catalog-images —
-- random uuid filenames, no signed URLs, consistent with every existing
-- upload in this app rather than a new private-bucket precedent.
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', true)
on conflict (id) do nothing;

-- Both sides of a thread can upload (an author attaching a document, an
-- admin attaching a form) — mirrors author-submissions' broad insert
-- policy, scoped to authenticated only (this feature already requires
-- login, unlike the public pre-account submission form). Only admins can
-- overwrite/delete, same as every other bucket.
create policy "message_attachments_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'message-attachments');

create policy "message_attachments_admin_write" on storage.objects
  for update
  using (bucket_id = 'message-attachments' and app.is_platform_admin())
  with check (bucket_id = 'message-attachments' and app.is_platform_admin());

create policy "message_attachments_admin_delete" on storage.objects
  for delete
  using (bucket_id = 'message-attachments' and app.is_platform_admin());
