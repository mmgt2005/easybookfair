-- Extensions
create extension if not exists pgcrypto with schema public;

-- App-owned schema for helper functions (RLS predicates, ledger posting).
-- Kept separate from `public` so table listings/PostgREST exposure stay clean.
create schema if not exists app;

-- Enums

create type public.application_status as enum ('pending', 'approved', 'declined');

create type public.org_member_role as enum ('org_admin', 'org_staff');

create type public.item_type as enum ('book', 'merchandise');

create type public.fair_status as enum ('scheduled', 'active', 'return_window', 'closed');

create type public.sale_channel as enum ('online', 'in_person', 'cash');

create type public.sale_status as enum ('completed', 'refunded', 'disputed');

create type public.restock_order_status as enum ('pending', 'ordered', 'received', 'cancelled');

create type public.promotion_kind as enum ('percent', 'bundle');

create type public.account_type as enum ('asset', 'liability', 'equity', 'revenue', 'expense');
