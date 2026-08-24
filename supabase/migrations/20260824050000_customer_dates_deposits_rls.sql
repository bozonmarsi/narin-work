-- Тот же блокер, что уже чинили для "Tilda points" и points_transactions
-- (20260728040000_points_rls.sql): personal_dates и customer_deposits
-- созданы с RLS включённым, но без единой политики для менеджера — то
-- есть страница "Клиенты" молча показывала пустые даты и депозит для
-- всех, даже если бы там были реальные данные (сейчас там пусто, но без
-- этой правки запись новых дат/пополнение депозита из NARIN WORK тоже
-- работать не будет).
alter table personal_dates enable row level security;

drop policy if exists "manager_all_personal_dates" on personal_dates;
create policy "manager_all_personal_dates" on personal_dates
  for all using (is_manager());

alter table customer_deposits enable row level security;

drop policy if exists "manager_all_customer_deposits" on customer_deposits;
create policy "manager_all_customer_deposits" on customer_deposits
  for all using (is_manager());
