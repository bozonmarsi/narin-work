-- Депозит на кассе/странице оплаты нужен так же, как баллы, но раньше не
-- было отдельного журнала списаний-начислений (customer_deposits хранит
-- только текущий balance, страница "Клиенты" просто перезаписывает его).
-- Для онлайн-списания через tilda-webhook нужна защита от повторной
-- обработки одного и того же заказа (ретраи вебхука Tilda) — тот же
-- механизм, что уже есть у points_transactions (уникальный order_id+type).
--
-- CLI сегодня не подключается (LegacyPlatformAuthRequiredError, нужен
-- повторный supabase login) — эта миграция НЕ прогнана dry-run'ом через
-- BEGIN/ROLLBACK, как обычно в этой сессии. Она простая (одно CREATE
-- TABLE + индексы + RLS-политика, тот же паттерн, что уже 5 раз
-- применялся этой сессией), но проверь перед вставкой, если сомневаешься.

create table if not exists deposit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  amount numeric not null,
  type text not null,
  order_id text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists deposit_transactions_email_idx
  on deposit_transactions (lower(user_email));

-- Как и у points_transactions: не даём дважды списать депозит за один и
-- тот же заказ (retry вебхука), но разрешаем сколько угодно ручных
-- пополнений/списаний со страницы "Клиенты" (у них order_id пустой).
create unique index if not exists deposit_transactions_unique_order_type
  on deposit_transactions (order_id, type)
  where order_id is not null and order_id <> '';

alter table deposit_transactions enable row level security;

drop policy if exists "manager_all_deposit_transactions" on deposit_transactions;
create policy "manager_all_deposit_transactions" on deposit_transactions
  for all using (is_manager());

-- tilda-webhook теперь пишет туда же, куда и used_points, сколько крон
-- списано депозитом с конкретного заказа (для истории заказов на
-- странице "Клиенты" и в Логах).
alter table tilda_orders add column if not exists used_deposit numeric default 0;
