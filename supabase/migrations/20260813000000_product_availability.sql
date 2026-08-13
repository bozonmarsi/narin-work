-- Наличие цветов "на сегодня" для плашек "Доручíme dnes/zítra" в каталоге.
-- Присутствие строки = товар в наличии сегодня; отдельного boolean не нужно,
-- т.к. утренний сброс — это просто удаление всех строк.
create table if not exists product_availability (
  product_name text primary key,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

alter table product_availability enable row level security;

drop policy if exists "staff_read_product_availability" on product_availability;
create policy "staff_read_product_availability" on product_availability
  for select using (exists (select 1 from users where id = auth.uid()));

drop policy if exists "manager_write_product_availability" on product_availability;
create policy "manager_write_product_availability" on product_availability
  for all using (exists (select 1 from users where id = auth.uid() and role = 'manager'))
  with check (exists (select 1 from users where id = auth.uid() and role = 'manager'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'product_availability'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE product_availability;
  END IF;
END $$;
