-- Клиентские данные размазаны по нескольким таблицам ("Tilda points",
-- points_transactions, tilda_orders, ui_tours_seen), из-за чего в обычном
-- Table Editor непонятно с одного взгляда, зарегистрирован ли человек и
-- была ли ему выплата приветственных баллов. Эта вью склеивает всё в одну
-- строку на клиента.
--
-- Создана в отдельной схеме "private", а не "public" — вью в public
-- автоматически становится доступна снаружи через anon-ключ (как и все
-- обычные таблицы сайта), а тут email/телефон/баланс всех клиентов сразу
-- в одном месте. В приватной схеме она видна только тебе в Supabase
-- (SQL Editor и Table Editor — там есть переключатель схемы наверху),
-- но не торчит наружу через сайт.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE VIEW private.customers_overview AS
SELECT
  tp.email,
  tp.balance AS points_balance,
  tp.ma_id,
  tp.birthday,
  (welcome.awarded_at IS NOT NULL) AS welcome_bonus_paid,
  welcome.awarded_at AS welcome_bonus_paid_at,
  COALESCE(orders.orders_count, 0) AS orders_count,
  orders.last_order_at,
  (tour.seen_at IS NOT NULL) AS saw_new_cabinet,
  tour.seen_at AS saw_new_cabinet_at
FROM "Tilda points" tp
LEFT JOIN (
  SELECT lower(user_email) AS email_lc, min(created_at) AS awarded_at
  FROM points_transactions
  WHERE type = 'welcome'
  GROUP BY lower(user_email)
) welcome ON welcome.email_lc = lower(tp.email)
LEFT JOIN (
  SELECT lower(customer_email) AS email_lc,
         count(*) AS orders_count,
         max(created_at) AS last_order_at
  FROM tilda_orders
  GROUP BY lower(customer_email)
) orders ON orders.email_lc = lower(tp.email)
LEFT JOIN (
  SELECT lower(user_email) AS email_lc, min(seen_at) AS seen_at
  FROM ui_tours_seen
  WHERE tour_key = 'lk_cabinet_v1'
  GROUP BY lower(user_email)
) tour ON tour.email_lc = lower(tp.email)
ORDER BY tp.email;
