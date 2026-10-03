-- Quick async chat between an author and "the admin team" (not a specific
-- admin) — one implicit thread per author, not a 1:1 DM concept. Polling
-- is the refresh model (matches SalesFeedClient's established pattern),
-- not Supabase Realtime, so no schema here needs to support that.
create table public.author_messages (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references public.authors (user_id),
  sender_role text not null check (sender_role in ('author', 'admin')),
  sender_user_id uuid not null references auth.users (id),
  body text not null check (length(trim(body)) > 0),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index author_messages_author_user_id_idx on public.author_messages (author_user_id, created_at);

alter table public.author_messages enable row level security;

create policy "author_messages_admin_all" on public.author_messages
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

create policy "author_messages_author_select" on public.author_messages
  for select
  using (author_user_id = auth.uid());

create policy "author_messages_author_insert" on public.author_messages
  for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and sender_role = 'author'
    and sender_user_id = auth.uid()
  );

-- "read_at" means "the OTHER side has seen this" — an author-sent row's
-- read_at is set when an admin opens the thread; an admin-sent row's
-- read_at is set when the author opens it. One column suffices since each
-- row only ever needs that single direction tracked. Scoped via a
-- security-definer RPC (same "self or admin" shape as
-- respond_to_inventory_request) rather than a broader author-UPDATE
-- policy, since the update must only ever touch the *other* sender_role's
-- rows, not arbitrary rows the author could otherwise reach.
create or replace function public.mark_author_messages_read(
  p_author_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_is_admin boolean := app.is_platform_admin();
begin
  if not (v_caller_is_admin or auth.uid() = p_author_user_id) then
    raise exception 'not authorized';
  end if;

  update public.author_messages
  set read_at = now()
  where author_user_id = p_author_user_id
    and read_at is null
    and sender_role = case when v_caller_is_admin then 'author' else 'admin' end;
end;
$$;

revoke execute on function public.mark_author_messages_read(uuid) from public;
grant execute on function public.mark_author_messages_read(uuid) to authenticated;
