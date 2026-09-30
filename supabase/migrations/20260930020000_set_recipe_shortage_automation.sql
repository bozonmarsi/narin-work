-- Автоматический "под заказ" для сетов/букетов, у которых кончился хотя
-- бы один "настоящий" (свой товар, не просто имя от Van Vliet) цветок
-- из состава. Не скрываем карточку — special_order уже даёт ровно то
-- поведение, что нужно ("+2 дня" на сайте, а не пропажа товара).
--
-- auto_special_order — отдельный флаг именно для того, чтобы не путать
-- эту автоматику с РУЧНЫМ "под заказ", который менеджер мог поставить
-- по совсем другой причине (например, Atelier без своего остатка
-- вообще). Триггер включает/выключает special_order только там, где
-- сам его когда-то включил — ручной выбор человека не трогает.
alter table product_stickers add column if not exists auto_special_order boolean not null default false;

create or replace function recompute_set_special_order(p_bouquet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_current boolean;
  v_is_auto boolean;
  v_shortage boolean;
begin
  select category, special_order, auto_special_order
    into v_category, v_current, v_is_auto
    from product_stickers where id = p_bouquet_id;

  if v_category is null or v_category not in ('set', 'buket') then
    return;
  end if;

  select exists (
    select 1
    from product_recipes pr
    join product_stickers ing on ing.id = pr.ingredient_sticker_id
    where pr.bouquet_sticker_id = p_bouquet_id
      and pr.ingredient_sticker_id is not null
      and coalesce(ing.quantity, 0) <= 0
      and coalesce(ing.vanvliet_in_stock, false) = false
  ) into v_shortage;

  if v_shortage and not v_current then
    update product_stickers set special_order = true, auto_special_order = true where id = p_bouquet_id;
  elsif not v_shortage and v_current and v_is_auto then
    update product_stickers set special_order = false, auto_special_order = false where id = p_bouquet_id;
  end if;
end;
$$;

-- Пересчёт при изменении остатка/наличия у сырья — находим все сеты, в
-- составе которых оно есть, и пересчитываем каждый.
create or replace function trg_recompute_sets_after_ingredient_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.category = 'ohapka'
     and (new.quantity is distinct from old.quantity or new.vanvliet_in_stock is distinct from old.vanvliet_in_stock) then
    for r in select distinct bouquet_sticker_id from product_recipes where ingredient_sticker_id = new.id loop
      perform recompute_set_special_order(r.bouquet_sticker_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_after_ingredient_stock_change on product_stickers;
create trigger trg_after_ingredient_stock_change
  after update on product_stickers
  for each row execute function trg_recompute_sets_after_ingredient_change();

-- Пересчёт при создании/правке/удалении состава — например сразу при
-- заведении нового сета, если в его составе с самого начала есть
-- нехватка.
create or replace function trg_recompute_set_after_recipe_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform recompute_set_special_order(coalesce(new.bouquet_sticker_id, old.bouquet_sticker_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_after_recipe_change on product_recipes;
create trigger trg_after_recipe_change
  after insert or update or delete on product_recipes
  for each row execute function trg_recompute_set_after_recipe_change();
