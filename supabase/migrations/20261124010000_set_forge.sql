-- Кузница сетов (Магазин -> Кузница сетов).
--
-- 1. forge_pricelists / forge_pricelist_items: прайс Голландии Van Vliet
--    (Excel "Pricelists_DD-MM-YYYY.xlsx"), который владелец загружает в
--    приложение. Каждая строка - сорт ровно с тем названием, которое
--    ищется в каталоге Van Vliet.
-- 2. forge_candidates: сеты, которые придумал Claude по этому прайсу.
--    Владелец жмёт "Взять" (создаётся сет в Каталоге с составом из
--    product_recipes.vanvliet_ingredient_name) или "Нет" (с причиной) -
--    взятые и отклонённые уходят в следующий запрос как примеры.
-- Пишет прайс и кандидатов edge-функция set-forge (service role);
-- решение по кандидату менеджер ставит сам.

create table if not exists public.forge_pricelists (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid,
  file_name text,
  arrival_date date,
  source text not null default 'vv_nl',
  row_count integer not null default 0
);

create table if not exists public.forge_pricelist_items (
  id bigserial primary key,
  pricelist_id uuid not null references public.forge_pricelists(id) on delete cascade,
  name text not null,
  order_per integer,
  color text,
  quality text,
  grower text,
  origin text,
  tags text,
  length_cm integer,
  packing text,
  price_bunch numeric,
  price_bucket numeric
);
create index if not exists forge_pricelist_items_list_idx on public.forge_pricelist_items (pricelist_id);

create table if not exists public.forge_candidates (
  id uuid primary key default gen_random_uuid(),
  pricelist_id uuid references public.forge_pricelists(id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'taken', 'rejected')),
  name text not null,
  description_cs text,
  idea_ru text,
  items jsonb not null default '[]'::jsonb,
  stems integer,
  cost numeric,
  hint text,
  reject_note text,
  decided_at timestamptz,
  decided_by uuid,
  set_id uuid references public.product_stickers(id) on delete set null
);
create index if not exists forge_candidates_status_idx on public.forge_candidates (status, created_at desc);

alter table public.forge_pricelists enable row level security;
alter table public.forge_pricelist_items enable row level security;
alter table public.forge_candidates enable row level security;

drop policy if exists manager_read_forge_pricelists on public.forge_pricelists;
create policy manager_read_forge_pricelists on public.forge_pricelists for select using (is_manager());
drop policy if exists manager_read_forge_pricelist_items on public.forge_pricelist_items;
create policy manager_read_forge_pricelist_items on public.forge_pricelist_items for select using (is_manager());
drop policy if exists manager_read_forge_candidates on public.forge_candidates;
create policy manager_read_forge_candidates on public.forge_candidates for select using (is_manager());
drop policy if exists manager_decide_forge_candidates on public.forge_candidates;
create policy manager_decide_forge_candidates on public.forge_candidates for update using (is_manager()) with check (is_manager());
