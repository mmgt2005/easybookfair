-- Lets a super admin add another admin from the UI, mirroring the
-- org_admin/org_staff distinction org_members already had (migration
-- 0001/0002) but nothing ever read. platform_admins was completely flat
-- before this — everyone had identical access.
create type public.platform_admin_role as enum ('super_admin', 'admin');

alter table public.platform_admins
  add column role public.platform_admin_role not null default 'admin';

-- Every admin that exists right now becomes a super_admin, so nobody
-- loses access and there's always someone who can use the new invite UI
-- without another manual SQL insert to bootstrap it.
update public.platform_admins set role = 'super_admin';
