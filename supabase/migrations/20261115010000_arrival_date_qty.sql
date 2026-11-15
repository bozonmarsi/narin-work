-- "Ordered, arriving" (arrival_pending) gets an expected date and quantity.
--  * arrival_date: the day the flowers arrive. From the day BEFORE it the site shows plain "Dorucime zitra"
--    (force_tomorrow is switched on by arrival_tick() every hour), before that the usual special-order date.
--  * arrival_qty: how many stems we expect. When orders already booked reach this number the card is hidden,
--    so the site never sells more than was ordered.
--  * An "arriving" flower is treated as a special order even when Van Vliet shows it in stock.
-- When the goods are received (quantity goes from 0 to > 0) everything is switched off by the trigger.

alter table product_stickers add column if not exists arrival_qty integer;
alter table product_stickers add column if not exists arrival_date date;

create or replace function public.tg_clear_arrival_pending()
returns trigger
language plpgsql
as $$
begin
  if new.arrival_pending
     and coalesce(new.quantity, 0) > 0
     and coalesce(old.quantity, 0) <= 0 then
    new.arrival_pending := false;
    new.special_order := false;
    new.auto_special_order := false;
    new.force_tomorrow := false;
    new.arrival_qty := null;
    new.arrival_date := null;
  end if;
  return new;
end;
$$;

create or replace function public.arrival_tick()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  update product_stickers
     set force_tomorrow = true
   where arrival_pending
     and arrival_date is not null
     and arrival_date <= (now() at time zone 'Europe/Prague')::date + 1
     and not force_tomorrow;
  get diagnostics n = row_count;
  return n;
end;
$$;

do $mig$
declare
  c1 text := pg_get_functiondef('public.get_catalog_page_data()'::regprocedure);
  c2 text := pg_get_functiondef('public.get_special_order_products()'::regprocedure);
  c3 text := pg_get_functiondef('public.gift_min_date(text)'::regprocedure);
  n1 text; n2 text; n3 text;
begin
  -- hide an "arriving" card once the booked orders reach the expected quantity
  n1 := regexp_replace(c1, 'ps\.manually_hidden = true',
        'ps.manually_hidden = true OR (ps.arrival_pending AND ps.arrival_qty IS NOT NULL AND COALESCE(r.reserved, 0) >= ps.arrival_qty)');
  -- "arriving" beats "Van Vliet has it"
  n1 := regexp_replace(n1, 'vanvliet_in_stock IS TRUE\)', 'vanvliet_in_stock IS TRUE AND NOT COALESCE(arrival_pending, false))');
  n2 := regexp_replace(c2, 'vanvliet_in_stock IS TRUE\)', 'vanvliet_in_stock IS TRUE AND NOT COALESCE(arrival_pending, false))');
  n3 := regexp_replace(c3, 'ps\.vanvliet_in_stock IS TRUE', 'ps.vanvliet_in_stock IS TRUE AND NOT COALESCE(ps.arrival_pending, false)');
  if n1 = c1 or n2 = c2 or n3 = c3 then
    raise exception 'pattern not found, nothing changed';
  end if;
  execute n1;
  execute n2;
  execute n3;
end
$mig$;

select cron.unschedule('arrival-tick') where exists (select 1 from cron.job where jobname = 'arrival-tick');
select cron.schedule('arrival-tick', '5 * * * *', 'select public.arrival_tick()');

-- the first batch: 20 stems of Roze yo (spray) and 20 stems of Roze Bombastik spray, arriving Tuesday 17 Nov 2026
update product_stickers
   set arrival_pending = true, special_order = true, auto_special_order = false,
       arrival_qty = 20, arrival_date = date '2026-11-17', manually_hidden = false
 where product_name in ('Růže yo (spray)', 'Růže Bombastik spray');

select public.arrival_tick();

select product_name, arrival_pending, special_order, arrival_qty, arrival_date, manually_hidden, force_tomorrow
  from product_stickers where product_name in ('Růže yo (spray)', 'Růže Bombastik spray');
