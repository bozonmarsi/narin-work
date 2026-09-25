-- Флорист (роль warehouse) может заводить новые товары наравне с
-- менеджером (см. миграцию 20260905050000 "Флорист получает полный
-- доступ к Магазину") — это осталось нужным для ежедневной рутины
-- (остаток, наличие, партии). Но для НОВОГО товара менеджер хочет
-- одобрять/дорабатывать карточку перед тем, как она станет обычным
-- товаром — флорист сам не должен иметь полномочий это подтвердить.
--
-- Права (RLS) на product_stickers оставляем как есть — это касается
-- только ежедневных операций (остаток/наличие/теги), их флорист
-- по-прежнему делает сам без одобрения. Здесь — отдельный флаг и
-- триггер, который не даёт роли warehouse самой снять флаг проверки.
alter table product_stickers add column if not exists pending_review boolean not null default false;

create or replace function enforce_pending_review_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_role user_role;
begin
  select role into acting_role from users where id = auth.uid();
  if acting_role = 'warehouse'::user_role then
    if tg_op = 'INSERT' then
      new.pending_review := true;
    elsif tg_op = 'UPDATE' then
      new.pending_review := old.pending_review;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pending_review_guard on product_stickers;
create trigger trg_pending_review_guard
  before insert or update on product_stickers
  for each row execute function enforce_pending_review_guard();

-- Всё, что уже есть в базе на момент этой миграции, уже одобрено и живёт
-- на сайте — задним числом ставить "на проверке" было бы неверно.
update product_stickers set pending_review = false;
