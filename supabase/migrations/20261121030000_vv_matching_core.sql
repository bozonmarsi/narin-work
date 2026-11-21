-- Система соответствий Van Vliet, этап 1.
--
-- 1. vv_catalog: память каталога Van Vliet. Сканер 4 раза в день пишет сюда
--    КАЖДЫЙ сорт (фото, цена за стебель без DPH, качество, производитель,
--    сколько в упаковке, наличие). Цена больше не теряется, когда сорта нет.
--    Ключ sig = название|цвет|производитель|качество: так одинаковый сорт
--    от другого производителя или другого качества - отдельная строка,
--    и его можно отдельно отклонить ("меньше / хуже качеством").
-- 2. vv_price_history: цена и наличие каждого сорта по дням.
-- 3. product_name_aliases получает статус проверки:
--      suggested - найдено системой, ни на что не влияет;
--      approved  - проверено ("Это он");
--      rejected  - "Не он", больше не предлагается;
--    is_primary - основной сорт, по нему считается себестоимость.
--    Старые связи остаются approved (сайт работает как раньше), но с
--    source = legacy и без reviewed_at - в приложении они в очереди
--    "проверить по фото".
-- 4. vv_variant_blocks: конкретный вариант (sig) не подходит этому товару,
--    хотя название то же (короткий, A2, другой производитель).
-- 5. alias_events: журнал - кто, когда, что подтвердил/отклонил и почему.

create table if not exists public.vv_catalog (
  sig text primary key,
  vv_key bigint,
  product text not null,
  core text not null,
  color text,
  quality text,
  grower text,
  photo text,
  order_per integer,
  price numeric,
  stock integer,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_in_stock_at timestamptz
);
create index if not exists vv_catalog_core_idx on public.vv_catalog (core);

create table if not exists public.vv_price_history (
  sig text not null references public.vv_catalog(sig) on delete cascade,
  day date not null,
  price numeric,
  stock integer,
  primary key (sig, day)
);

alter table public.product_name_aliases
  add column if not exists status text not null default 'approved',
  add column if not exists is_primary boolean not null default false,
  add column if not exists source text not null default 'legacy',
  add column if not exists note text,
  add column if not exists score numeric,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;

-- Новые связи из приложения (рука человека) - manual; ИИ-подбор пишет
-- status = suggested, source = ai явно (см. vanvliet-alias-refresh).
alter table public.product_name_aliases alter column source set default 'manual';

do $$ begin
  alter table public.product_name_aliases
    add constraint product_name_aliases_status_chk check (status in ('suggested', 'approved', 'rejected'));
exception when duplicate_object then null; end $$;

-- Дубли (одно и то же название у одного товара, отличаются только is_manual).
delete from public.product_name_aliases a
 using public.product_name_aliases b
 where a.product_sticker_id = b.product_sticker_id
   and a.supplier_id is not distinct from b.supplier_id
   and lower(trim(a.alias)) = lower(trim(b.alias))
   and (a.is_manual::int < b.is_manual::int or (a.is_manual = b.is_manual and a.id > b.id));

create unique index if not exists product_name_aliases_uniq
  on public.product_name_aliases (product_sticker_id, coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(alias)));

create table if not exists public.vv_variant_blocks (
  sig text not null,
  product_sticker_id uuid not null references public.product_stickers(id) on delete cascade,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (sig, product_sticker_id)
);

create table if not exists public.alias_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  product_sticker_id uuid,
  alias text,
  sig text,
  action text not null,
  note text
);
create index if not exists alias_events_product_idx on public.alias_events (product_sticker_id, at desc);

alter table public.vv_catalog enable row level security;
alter table public.vv_price_history enable row level security;
alter table public.vv_variant_blocks enable row level security;
alter table public.alias_events enable row level security;
drop policy if exists staff_read_vv_catalog on public.vv_catalog;
create policy staff_read_vv_catalog on public.vv_catalog for select using (is_manager() or is_warehouse());
drop policy if exists staff_read_vv_price_history on public.vv_price_history;
create policy staff_read_vv_price_history on public.vv_price_history for select using (is_manager() or is_warehouse());
drop policy if exists staff_read_vv_variant_blocks on public.vv_variant_blocks;
create policy staff_read_vv_variant_blocks on public.vv_variant_blocks for select using (is_manager() or is_warehouse());
drop policy if exists staff_read_alias_events on public.alias_events;
create policy staff_read_alias_events on public.alias_events for select using (is_manager() or is_warehouse());

-- Нормализация названия Van Vliet, ровно как coreName() в сканере.
create or replace function public.vv_core(p text)
returns text language sql immutable as $$
  select lower(trim(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''),
      '\(\s*imp\s*\)', ' ', 'gi'),
      '\(\s*\d+\s*\)', ' ', 'g'),
      '\m\d+([.,]\d+)?\s*(cm|gram)\M', ' ', 'gi'),
      '\m\d+\s*st\M', ' ', 'gi'),
    '\s+', ' ', 'g')))
$$;

-- Все действия с соответствиями - только через эту функцию (менеджер),
-- каждое действие пишется в журнал.
--   approve / reject / suggest - статус связи
--   primary   - основной сорт (снимает "основной" с остальных связей товара)
--   unprimary - снять "основной"
create or replace function public.alias_review(p_alias_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if not is_manager() then raise exception 'forbidden'; end if;
  select * into a from product_name_aliases where id = p_alias_id;
  if not found then raise exception 'alias_not_found'; end if;

  if p_action = 'approve' then
    update product_name_aliases set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
           note = coalesce(p_note, note) where id = p_alias_id;
  elsif p_action = 'reject' then
    update product_name_aliases set status = 'rejected', is_primary = false, reviewed_by = auth.uid(), reviewed_at = now(),
           note = coalesce(p_note, note) where id = p_alias_id;
  elsif p_action = 'primary' then
    update product_name_aliases set is_primary = false where product_sticker_id = a.product_sticker_id and id <> p_alias_id;
    update product_name_aliases set is_primary = true, status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_alias_id;
  elsif p_action = 'unprimary' then
    update product_name_aliases set is_primary = false where id = p_alias_id;
  else
    raise exception 'bad_action';
  end if;

  insert into alias_events (actor, product_sticker_id, alias, action, note)
  values (auth.uid(), a.product_sticker_id, a.alias, p_action, p_note);
end $$;

-- Привязать сорт из каталога Van Vliet к товару (сразу проверено).
create or replace function public.alias_link(p_product uuid, p_vv_name text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_sup uuid := (select id from suppliers where name = 'Van Vliet');
        v_core text := vv_core(p_vv_name);
        v_id uuid;
begin
  if not is_manager() then raise exception 'forbidden'; end if;
  if v_core = '' then raise exception 'empty_name'; end if;
  select id into v_id from product_name_aliases
   where product_sticker_id = p_product and supplier_id is not distinct from v_sup and lower(trim(alias)) = v_core;
  if v_id is null then
    insert into product_name_aliases (supplier_id, alias, product_sticker_id, is_manual, status, source, reviewed_by, reviewed_at, note)
    values (v_sup, v_core, p_product, true, 'approved', 'manual', auth.uid(), now(), p_note)
    returning id into v_id;
  else
    update product_name_aliases set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = v_id;
  end if;
  insert into alias_events (actor, product_sticker_id, alias, action, note) values (auth.uid(), p_product, v_core, 'link', p_note);
  return v_id;
end $$;

-- Конкретный вариант не подходит товару (или снова подходит).
create or replace function public.vv_variant_block(p_sig text, p_product uuid, p_blocked boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_manager() then raise exception 'forbidden'; end if;
  if p_blocked then
    insert into vv_variant_blocks (sig, product_sticker_id, note, created_by) values (p_sig, p_product, p_note, auth.uid())
    on conflict (sig, product_sticker_id) do update set note = excluded.note;
  else
    delete from vv_variant_blocks where sig = p_sig and product_sticker_id = p_product;
  end if;
  insert into alias_events (actor, product_sticker_id, sig, action, note)
  values (auth.uid(), p_product, p_sig, case when p_blocked then 'block_variant' else 'unblock_variant' end, p_note);
end $$;

-- Сброс статуса Van Vliet у цветов без ПРОВЕРЕННОЙ связи (предложения и
-- отклонённые не считаются).
create or replace function public.reset_vanvliet_status_without_alias()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_supplier uuid := (select id from suppliers where name = 'Van Vliet');
  v_count integer;
begin
  update product_stickers ps
     set vanvliet_in_stock = null, vanvliet_stock_checked_at = null, vanvliet_cheapest_price = null
   where ps.category = 'ohapka'
     and (ps.vanvliet_in_stock is not null or ps.vanvliet_cheapest_price is not null or ps.vanvliet_stock_checked_at is not null)
     and not exists (
       select 1 from product_name_aliases a
        where a.product_sticker_id = ps.id and a.supplier_id = v_supplier and a.status = 'approved'
     );
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.alias_review(uuid, text, text) from public, anon;
revoke all on function public.alias_link(uuid, text, text) from public, anon;
revoke all on function public.vv_variant_block(text, uuid, boolean, text) from public, anon;
grant execute on function public.alias_review(uuid, text, text) to authenticated;
grant execute on function public.alias_link(uuid, text, text) to authenticated;
grant execute on function public.vv_variant_block(text, uuid, boolean, text) to authenticated;
