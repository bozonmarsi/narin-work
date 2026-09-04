-- Адресная книга получателей. Раньше "важные даты" были самостоятельной
-- сущностью (personal_dates): человек заполнял «Výročí svatby — 22.9», но
-- эти данные никуда не вели дальше напоминания — при оформлении заказа
-- получателя всё равно приходилось вбивать руками каждый раз.
--
-- Теперь главная сущность — человек (recipients), а дата становится его
-- свойством. Это даёт три вещи: напоминание знает, ЧЕЙ праздник; общие
-- праздники (8 марта, День матери) можно привязать к конкретному человеку;
-- сохранённый адрес переиспользуется при оформлении заказа.

CREATE TABLE IF NOT EXISTS recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  name text NOT NULL,
  relation text,
  phone text,
  address text,
  -- Те же координаты, что и у tilda_orders.recipient_lat/lng — сохранённый
  -- адрес сразу пригоден для маршрутизации курьеров, без повторного
  -- геокодирования при каждом заказе.
  address_lat float8,
  address_lng float8,
  -- Пожелания получателя: «не любит лилии», «код домофона 42».
  note text,
  -- Общие праздники, на которые напоминать именно про этого человека.
  -- Ключи совпадают с захардкоженным списком праздников в виджете дат
  -- (valentyn, den_matek, ...). Отдельная таблица тут избыточна: список
  -- короткий и фиксированный.
  holidays text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipients_owner_idx ON recipients (owner_email);

-- Дата может существовать и без человека — «просто дата» остаётся рабочим
-- сценарием, поэтому recipient_id nullable. Существующие даты после
-- миграции просто остаются непривязанными, ничего не теряется.
ALTER TABLE personal_dates
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES recipients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS personal_dates_recipient_idx ON personal_dates (recipient_id);

-- ON DELETE SET NULL, а не CASCADE: удаление контакта не должно молча
-- уносить напоминание. Дата деградирует до «просто даты» — модель это
-- допускает, — и человек сам решит, удалять её или нет.

ALTER TABLE recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_all_recipients" ON recipients;
CREATE POLICY "manager_all_recipients" ON recipients
  FOR ALL USING (is_manager());

-- ВАЖНО: здесь намеренно НЕТ клиентских RPC вида list_my_recipients(p_email),
-- в отличие от дат и дня рождения (20260824070000). Там компромисс «доступ
-- по одному email, без пароля» был принят осознанно: худшее, что сделает
-- посторонний, узнавший чужой email, — поменяет чужой день рождения.
--
-- Здесь цена ошибки другая: в таблице лежат адреса и телефоны третьих лиц,
-- которые сами даже не клиенты NARIN. Отдавать их по знанию одного лишь
-- email нельзя. Поэтому доступ клиента к получателям идёт только через
-- edge function с проверкой HMAC-токена (lk_auth_token, как в support-chat
-- и personal-dates), которая работает под service role и минует RLS.
