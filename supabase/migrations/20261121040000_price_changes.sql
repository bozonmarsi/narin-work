-- Журнал цен náruče: каждое решение владельца на экране «Цветы и цены».
--   applied - цена поставлена в Tilda (edge-функция tilda-price);
--   kept    - «оставить как есть»: это предложение больше не всплывает,
--             пока расчётная цена не уйдёт ещё больше чем на 10 %.
-- Пишет только edge-функция (service role); менеджер читает.
create table if not exists public.price_changes (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  product_sticker_id uuid not null references public.product_stickers(id) on delete cascade,
  action text not null check (action in ('applied', 'kept')),
  old_price numeric,
  new_price numeric,
  suggested numeric,
  cost numeric,
  stem numeric,
  k numeric
);
create index if not exists price_changes_product_idx on public.price_changes (product_sticker_id, at desc);

alter table public.price_changes enable row level security;
drop policy if exists staff_read_price_changes on public.price_changes;
create policy staff_read_price_changes on public.price_changes for select using (is_manager() or is_warehouse());
