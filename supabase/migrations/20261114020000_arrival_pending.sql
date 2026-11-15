-- "Ordered, arriving": the florist presses a button on a cut-flower card when she
-- has ordered the flowers. The card is then shown on the site like a special
-- order ("Dorucime <date>", also enforced as the earliest delivery date in the
-- checkout) instead of being hidden because there is no stock yet.
-- When the goods are received into the warehouse (quantity goes from 0 to > 0)
-- the database switches both flags off by itself, so the site returns to the
-- normal "dnes" / "zitra" logic.
alter table product_stickers add column if not exists arrival_pending boolean not null default false;

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
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_arrival_pending on product_stickers;
create trigger trg_clear_arrival_pending
  before update of quantity on product_stickers
  for each row execute function public.tg_clear_arrival_pending();
