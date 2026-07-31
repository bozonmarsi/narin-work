-- product_stickers had RLS enabled with zero policies, so the manager
-- dashboard's product dropdown was getting empty results. Allow any staff
-- member (anyone in our users table) to read the catalog.

alter table product_stickers enable row level security;

drop policy if exists "staff_read_product_stickers" on product_stickers;
create policy "staff_read_product_stickers" on product_stickers
  for select using (exists (select 1 from users where id = auth.uid()));
