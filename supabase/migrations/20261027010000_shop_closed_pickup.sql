-- Closing pickup: completely, for a whole day, or for single times (e.g. nobody is at the shop 11:00-13:00).
--   closed_date null + time_label null  -> pickup is closed completely (the checkout hides it)
--   closed_date set  + time_label null  -> pickup is closed for that whole day
--   closed_date set  + time_label 'HH:MM' -> that pickup time is closed on that day
--   closed_date null + time_label 'HH:MM' -> that pickup time is closed every day
-- The checkout reads this with the anon key (like shop_closed_slots), managers and warehouse edit it.

create table if not exists public.shop_closed_pickup (
  id uuid primary key default gen_random_uuid(),
  closed_date date,
  time_label text check (time_label is null or time_label ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  reason text,
  created_at timestamptz default now()
);

create unique index if not exists shop_closed_pickup_uniq
  on public.shop_closed_pickup (coalesce(closed_date, date '0001-01-01'), coalesce(time_label, ''));

alter table public.shop_closed_pickup enable row level security;

drop policy if exists "manager_all_closed_pickup" on public.shop_closed_pickup;
create policy "manager_all_closed_pickup" on public.shop_closed_pickup for all
  using (is_manager() or is_warehouse()) with check (is_manager() or is_warehouse());

drop policy if exists "public_read_closed_pickup" on public.shop_closed_pickup;
create policy "public_read_closed_pickup" on public.shop_closed_pickup for select using (true);

-- The pickup order of 29.10 at 11:30 is not removed: contact the customer for another time.
-- Example (close 29.10 from 11:00 to 13:00 for pickup), the manager screen does the same:
--   insert into shop_closed_pickup (closed_date, time_label, reason)
--   select date '2026-10-29', t, 'Nejsme na místě'
--   from unnest(array['11:00','11:30','12:00','12:30','13:00']) t;
