-- Bouquet collection: the florist designs bouquets with a free-text composition, turns on the
-- S/M/L sizes he confirms, sets the price and how many he plans to sell this week. The purchase
-- list is the sum of the planned compositions. The owner later adds the sticker and the name.

create table if not exists public.collection_bouquets (
  id uuid primary key default gen_random_uuid(),
  working_name text not null,
  name text,
  slug text unique,
  sticker_url text,
  status text not null default 'draft' check (status in ('draft', 'ready', 'live', 'archived')),
  note text,
  description text,
  occasions text[] not null default '{}',
  moods text[] not null default '{}',
  recipients text[] not null default '{}',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_bouquet_sizes (
  id uuid primary key default gen_random_uuid(),
  bouquet_id uuid not null references public.collection_bouquets(id) on delete cascade,
  size text not null check (size in ('S', 'M', 'L')),
  enabled boolean not null default true,
  confirmed boolean not null default false,
  price numeric check (price is null or price > 0),
  planned_qty integer not null default 0 check (planned_qty >= 0),
  unique (bouquet_id, size)
);

create table if not exists public.collection_bouquet_lines (
  id uuid primary key default gen_random_uuid(),
  size_id uuid not null references public.collection_bouquet_sizes(id) on delete cascade,
  flower_name text not null check (btrim(flower_name) <> ''),
  qty integer not null check (qty > 0),
  product_sticker_id uuid references public.product_stickers(id) on delete set null,
  sort integer not null default 0
);
create index if not exists collection_bouquet_lines_size on public.collection_bouquet_lines(size_id);

alter table public.collection_bouquets enable row level security;
alter table public.collection_bouquet_sizes enable row level security;
alter table public.collection_bouquet_lines enable row level security;

drop policy if exists collection_staff_all on public.collection_bouquets;
create policy collection_staff_all on public.collection_bouquets for all using (is_manager() or is_warehouse()) with check (is_manager() or is_warehouse());
drop policy if exists collection_staff_all on public.collection_bouquet_sizes;
create policy collection_staff_all on public.collection_bouquet_sizes for all using (is_manager() or is_warehouse()) with check (is_manager() or is_warehouse());
drop policy if exists collection_staff_all on public.collection_bouquet_lines;
create policy collection_staff_all on public.collection_bouquet_lines for all using (is_manager() or is_warehouse()) with check (is_manager() or is_warehouse());

create or replace function public.touch_collection_bouquet() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists touch_collection_bouquet on public.collection_bouquets;
create trigger touch_collection_bouquet before update on public.collection_bouquets for each row execute function public.touch_collection_bouquet();
